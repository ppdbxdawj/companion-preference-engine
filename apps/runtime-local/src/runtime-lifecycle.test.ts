import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RuntimeLifecycleCoordinator } from './runtime-lifecycle.js'

type TestApplication = Readonly<{ generation: number }>

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const databaseFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'companion-runtime-lifecycle-'))
  temporaryDirectories.push(directory)
  const configuredDatabasePath = join(directory, 'profile.sqlite')
  writeFileSync(configuredDatabasePath, configuredDatabasePath)
  const databasePath = realpathSync(configuredDatabasePath)
  const targets = [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ]
  const decoys = [
    `${databasePath}-backup`,
    join(directory, 'other.sqlite'),
  ]
  for (const path of [...targets.slice(1), ...decoys]) writeFileSync(path, path)
  return { databasePath, targets, decoys }
}

describe('RuntimeLifecycleCoordinator reset oracle', () => {
  it('retains the writer lock, drains handlers, rejects maintenance calls, and deletes exact targets only', async () => {
    const { databasePath, targets, decoys } = databaseFixture()
    const events: string[] = []
    const removed: string[] = []
    const stopGate = deferred()
    const operationGate = deferred()
    let lockHeld = false
    let generation = 0

    const coordinator = new RuntimeLifecycleCoordinator<TestApplication>({
      databasePath,
      acquireRuntimeLock: async (path) => {
        events.push('lock-acquired')
        expect(path).toBe(databasePath)
        lockHeld = true
        return {
          canonicalDatabasePath: databasePath,
          release: async () => {
            events.push('lock-released')
            lockHeld = false
          },
        }
      },
      createStoreGraph: async (path) => {
        generation += 1
        events.push(`store-created-${generation}`)
        expect(path).toBe(databasePath)
        expect(lockHeld).toBe(true)
        const currentGeneration = generation
        if (currentGeneration === 2) writeFileSync(databasePath, 'recreated')
        return {
          application: { generation: currentGeneration },
          processor: {
            start: async () => { events.push(`processor-started-${currentGeneration}`) },
            stop: async () => {
              events.push(`processor-stopping-${currentGeneration}`)
              if (currentGeneration === 1) await stopGate.promise
              events.push(`processor-stopped-${currentGeneration}`)
            },
          },
          checkpointWal: async () => { events.push(`wal-checkpointed-${currentGeneration}`) },
          close: async () => { events.push(`store-closed-${currentGeneration}`) },
        }
      },
      removeFile: async (path) => {
        expect(targets).toContain(path)
        expect(lockHeld).toBe(true)
        removed.push(path)
        rmSync(path, { force: true })
      },
    })

    await coordinator.start()
    expect(events.slice(0, 3)).toEqual([
      'lock-acquired',
      'store-created-1',
      'processor-started-1',
    ])

    const inFlight = coordinator.execute(async (application) => {
      expect(application.generation).toBe(1)
      events.push('handler-entered')
      await operationGate.promise
      events.push('handler-left')
      return 'first-result'
    })
    await vi.waitFor(() => expect(events).toContain('handler-entered'))

    const resetting = coordinator.resetAllData()
    await vi.waitFor(() => expect(coordinator.state).toBe('maintenance'))
    await expect(coordinator.execute(async () => 'must-not-run')).rejects.toMatchObject({
      name: 'RuntimeUnavailableError',
      code: 'RUNTIME_MAINTENANCE',
    })
    expect(events).not.toContain('processor-stopping-1')

    operationGate.resolve()
    await expect(inFlight).resolves.toBe('first-result')
    await vi.waitFor(() => expect(events).toContain('processor-stopping-1'))
    expect(lockHeld).toBe(true)
    stopGate.resolve()
    await resetting

    expect(coordinator.state).toBe('running')
    expect(lockHeld).toBe(true)
    expect([...removed].sort()).toEqual([...targets].sort())
    expect(existsSync(databasePath)).toBe(true)
    for (const target of targets.slice(1)) expect(existsSync(target)).toBe(false)
    for (const decoy of decoys) expect(existsSync(decoy)).toBe(true)
    expect(events).toEqual([
      'lock-acquired',
      'store-created-1',
      'processor-started-1',
      'handler-entered',
      'handler-left',
      'processor-stopping-1',
      'processor-stopped-1',
      'wal-checkpointed-1',
      'store-closed-1',
      'store-created-2',
      'processor-started-2',
    ])
    await expect(coordinator.execute(async (application) => application.generation)).resolves.toBe(2)

    await coordinator.close()
    expect(lockHeld).toBe(false)
    expect(events.at(-1)).toBe('lock-released')
  })

  it('stays closed with the lock retained when store recreation fails', async () => {
    const { databasePath, targets } = databaseFixture()
    let lockHeld = false
    let createCalls = 0
    const release = vi.fn(async () => { lockHeld = false })

    const coordinator = new RuntimeLifecycleCoordinator<TestApplication>({
      databasePath,
      acquireRuntimeLock: async () => {
        lockHeld = true
        return { canonicalDatabasePath: databasePath, release }
      },
      createStoreGraph: async () => {
        createCalls += 1
        if (createCalls === 2) throw new Error('injected recreation failure')
        return {
          application: { generation: 1 },
          processor: { start: async () => {}, stop: async () => {} },
          checkpointWal: async () => {},
          close: async () => {},
        }
      },
      removeFile: async (path) => rmSync(path, { force: true }),
    })

    await coordinator.start()
    await expect(coordinator.resetAllData()).rejects.toMatchObject({
      name: 'RuntimeResetFailedError',
      code: 'RUNTIME_RESET_FAILED',
      cause: expect.objectContaining({ message: 'injected recreation failure' }),
    })
    expect(coordinator.state).toBe('closed-error')
    expect(lockHeld).toBe(true)
    expect(release).not.toHaveBeenCalled()
    for (const target of targets) expect(existsSync(target)).toBe(false)
    await expect(coordinator.execute(async () => 'must-not-run')).rejects.toMatchObject({
      name: 'RuntimeUnavailableError',
      code: 'RUNTIME_CLOSED',
    })

    await coordinator.close()
    expect(release).toHaveBeenCalledOnce()
    expect(lockHeld).toBe(false)
  })
})
