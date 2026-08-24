import { open, realpath } from 'node:fs/promises'
import { basename, dirname, parse, resolve } from 'node:path'

import lockfile from 'proper-lockfile'

export type RuntimeLockOptions = Readonly<{
  staleMs?: number
  updateMs?: number
}>

export type RuntimeLockHandle = Readonly<{
  canonicalDatabasePath: string
  release: () => Promise<void>
}>

export class RuntimeAlreadyRunningError extends Error {
  readonly code = 'RUNTIME_ALREADY_RUNNING' as const
  readonly phase = 'before-database-open' as const

  constructor() {
    super('Another local runtime already owns this database')
    this.name = 'RuntimeAlreadyRunningError'
  }
}

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

const assertSafeDatabasePath = (databasePath: string): void => {
  const root = parse(databasePath).root
  const name = basename(databasePath)
  if (databasePath === root || name === '' || name === '.' || name === '..') {
    throw new TypeError('Runtime database path must name a file below an existing directory')
  }
}

/**
 * Resolve all aliases that can affect lock identity. Existing database symlinks
 * resolve to their target; a database that does not exist yet uses its real
 * parent directory plus the configured basename.
 */
export const canonicalizeRuntimeDatabasePath = async (databasePath: string): Promise<string> => {
  const absolutePath = resolve(databasePath)
  assertSafeDatabasePath(absolutePath)
  try {
    const canonicalPath = await realpath(absolutePath)
    assertSafeDatabasePath(canonicalPath)
    return canonicalPath
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
    const canonicalParent = await realpath(dirname(absolutePath))
    const canonicalPath = resolve(canonicalParent, basename(absolutePath))
    assertSafeDatabasePath(canonicalPath)
    return canonicalPath
  }
}

/** Acquire the cross-process writer lease before any SQLite open or migration. */
export const acquireRuntimeLock = async (
  databasePath: string,
  options: RuntimeLockOptions = {},
): Promise<RuntimeLockHandle> => {
  const canonicalDatabasePath = await canonicalizeRuntimeDatabasePath(databasePath)
  const lockTarget = `${canonicalDatabasePath}.runtime`

  // proper-lockfile locks an adjacent directory. The stable target may remain
  // after shutdown; it contains no application data and is never the database.
  const target = await open(lockTarget, 'a')
  await target.close()

  const stale = Math.max(2_000, options.staleMs ?? 10_000)
  const requestedUpdate = options.updateMs ?? Math.floor(stale / 4)
  const update = Math.min(Math.max(1_000, requestedUpdate), Math.floor(stale / 2))

  let unlock: (() => Promise<void>) | undefined
  try {
    unlock = await lockfile.lock(lockTarget, {
      realpath: false,
      retries: 0,
      stale,
      update,
    })
  } catch (error) {
    if (errorCode(error) === 'ELOCKED') throw new RuntimeAlreadyRunningError()
    throw error
  }

  let released = false
  return {
    canonicalDatabasePath,
    release: async () => {
      if (released) return
      released = true
      await unlock?.()
    },
  }
}
