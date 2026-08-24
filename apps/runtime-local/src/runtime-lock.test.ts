import { fork, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { canonicalizeRuntimeDatabasePath } from './runtime-lock.js'

type ChildMessage =
  | Readonly<{
      type: 'runtime-ready'
      code: 'RUNTIME_LOCK_ACQUIRED'
      canonicalDatabasePath: string
      databaseOpened: true
    }>
  | Readonly<{
      type: 'runtime-error'
      code: 'RUNTIME_ALREADY_RUNNING'
      phase: 'before-database-open'
      databaseOpened: false
    }>
  | Readonly<{ type: 'runtime-closed' }>

const temporaryDirectories: string[] = []
const children = new Set<ChildProcess>()

afterEach(() => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  children.clear()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const waitForMessage = <T extends ChildMessage['type']>(
  child: ChildProcess,
  type: T,
): Promise<Extract<ChildMessage, { type: T }>> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 5_000)
  const onError = (error: Error) => {
    clearTimeout(timeout)
    reject(error)
  }
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    clearTimeout(timeout)
    reject(new Error(`child exited before ${type}: code=${code} signal=${signal}`))
  }
  const onMessage = (message: ChildMessage) => {
    if (message.type !== type) return
    clearTimeout(timeout)
    child.off('error', onError)
    child.off('exit', onExit)
    resolve(message as Extract<ChildMessage, { type: T }>)
  }
  child.once('error', onError)
  child.once('exit', onExit)
  child.on('message', onMessage)
})

const waitForExit = (child: ChildProcess): Promise<number | null> => new Promise((resolve) => {
  if (child.exitCode !== null) {
    resolve(child.exitCode)
    return
  }
  child.once('exit', (code) => resolve(code))
})

const launch = (
  databasePath: string,
  role: string,
  openMarker: string,
): ChildProcess => {
  const child = fork(
    fileURLToPath(new URL('./test-child-process.ts', import.meta.url)),
    [
      '--database', databasePath,
      '--role', role,
      '--open-marker', openMarker,
      '--stale-ms', '2000',
      '--update-ms', '500',
    ],
    {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  children.add(child)
  return child
}

describe('RuntimeLock process oracle', () => {
  it('canonicalizes aliases and rejects a second child before it opens SQLite', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'companion-runtime-lock-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'profile.sqlite')
    const aliasPath = join(directory, 'profile-alias.sqlite')
    const firstMarker = join(directory, 'first-opened')
    const secondMarker = join(directory, 'second-opened')
    writeFileSync(databasePath, '')
    symlinkSync(databasePath, aliasPath)
    const canonicalDatabasePath = realpathSync(databasePath)

    await expect(canonicalizeRuntimeDatabasePath(aliasPath)).resolves.toBe(canonicalDatabasePath)

    const first = launch(databasePath, 'first', firstMarker)
    await expect(waitForMessage(first, 'runtime-ready')).resolves.toEqual({
      type: 'runtime-ready',
      code: 'RUNTIME_LOCK_ACQUIRED',
      canonicalDatabasePath,
      databaseOpened: true,
    })
    expect(existsSync(firstMarker)).toBe(true)

    const second = launch(aliasPath, 'second', secondMarker)
    await expect(waitForMessage(second, 'runtime-error')).resolves.toEqual({
      type: 'runtime-error',
      code: 'RUNTIME_ALREADY_RUNNING',
      phase: 'before-database-open',
      databaseOpened: false,
    })
    await expect(waitForExit(second)).resolves.not.toBe(0)
    expect(existsSync(secondMarker)).toBe(false)

    first.send?.({ type: 'close' })
    await expect(waitForMessage(first, 'runtime-closed')).resolves.toEqual({
      type: 'runtime-closed',
    })
    await expect(waitForExit(first)).resolves.toBe(0)
  })
})
