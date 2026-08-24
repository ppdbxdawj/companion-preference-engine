import { writeFile } from 'node:fs/promises'

import {
  acquireRuntimeLock,
  RuntimeAlreadyRunningError,
} from './runtime-lock.js'

const argument = (name: string): string => {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

const send = (message: unknown): Promise<void> => new Promise((resolve, reject) => {
  if (!process.send) {
    reject(new Error('IPC channel is required'))
    return
  }
  process.send(message, (error) => error ? reject(error) : resolve())
})

const databasePath = argument('database')
const openMarker = argument('open-marker')
const staleMs = Number(argument('stale-ms'))
const updateMs = Number(argument('update-ms'))

try {
  const runtimeLock = await acquireRuntimeLock(databasePath, { staleMs, updateMs })

  // This marker stands in for SQLite open and must happen strictly after lock.
  await writeFile(openMarker, 'opened')
  await send({
    type: 'runtime-ready',
    code: 'RUNTIME_LOCK_ACQUIRED',
    canonicalDatabasePath: runtimeLock.canonicalDatabasePath,
    databaseOpened: true,
  })

  process.once('message', async (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)
      || message.type !== 'close') return
    await runtimeLock.release()
    await send({ type: 'runtime-closed' })
    process.exit(0)
  })
} catch (error) {
  if (error instanceof RuntimeAlreadyRunningError) {
    await send({
      type: 'runtime-error',
      code: error.code,
      phase: error.phase,
      databaseOpened: false,
    })
    process.exit(2)
  }
  throw error
}
