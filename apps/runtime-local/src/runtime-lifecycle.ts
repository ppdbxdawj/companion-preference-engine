import { rm } from 'node:fs/promises'
import { basename, dirname, parse, resolve } from 'node:path'

import {
  acquireRuntimeLock,
  canonicalizeRuntimeDatabasePath,
  type RuntimeLockHandle,
} from './runtime-lock.js'

export type RuntimeLifecycleState =
  | 'new'
  | 'starting'
  | 'running'
  | 'maintenance'
  | 'closing'
  | 'closed'
  | 'closed-error'

export type RuntimeProcessorLifecycle = Readonly<{
  start: () => void | Promise<void>
  stop: () => void | Promise<void>
}>

export type RuntimeStoreGraph<TApplication> = Readonly<{
  application: TApplication
  processor: RuntimeProcessorLifecycle
  checkpointWal: () => void | Promise<void>
  close: () => void | Promise<void>
}>

export type RuntimeLifecycleCoordinatorOptions<TApplication> = Readonly<{
  databasePath: string
  acquireRuntimeLock?: (databasePath: string) => Promise<RuntimeLockHandle>
  createStoreGraph: (canonicalDatabasePath: string) => Promise<RuntimeStoreGraph<TApplication>>
  removeFile?: (path: string) => void | Promise<void>
}>

export class RuntimeUnavailableError extends Error {
  readonly code: 'RUNTIME_MAINTENANCE' | 'RUNTIME_CLOSED'

  constructor(code: 'RUNTIME_MAINTENANCE' | 'RUNTIME_CLOSED') {
    super(code === 'RUNTIME_MAINTENANCE'
      ? 'The local runtime is in maintenance mode'
      : 'The local runtime is closed')
    this.name = 'RuntimeUnavailableError'
    this.code = code
  }
}

export class RuntimeResetFailedError extends Error {
  readonly code = 'RUNTIME_RESET_FAILED' as const
  override readonly cause: unknown

  constructor(cause: unknown) {
    super('The local runtime could not be recreated after reset', { cause })
    this.name = 'RuntimeResetFailedError'
    this.cause = cause
  }
}

const deletionTargets = (canonicalDatabasePath: string): readonly string[] => [
  canonicalDatabasePath,
  `${canonicalDatabasePath}-wal`,
  `${canonicalDatabasePath}-shm`,
  `${canonicalDatabasePath}-journal`,
]

const assertExactDeletionTarget = (
  canonicalDatabasePath: string,
  target: string,
): void => {
  const absoluteDatabasePath = resolve(canonicalDatabasePath)
  const allowed = new Set(deletionTargets(absoluteDatabasePath))
  const root = parse(absoluteDatabasePath).root
  if (
    absoluteDatabasePath === root
    || basename(absoluteDatabasePath) === ''
    || dirname(resolve(target)) !== dirname(absoluteDatabasePath)
    || !allowed.has(resolve(target))
  ) {
    throw new Error('Refusing to remove a path outside the exact runtime database targets')
  }
}

export class RuntimeLifecycleCoordinator<TApplication> {
  private readonly configuredDatabasePath: string
  private readonly acquireLock: (databasePath: string) => Promise<RuntimeLockHandle>
  private readonly createGraph: (canonicalDatabasePath: string) => Promise<RuntimeStoreGraph<TApplication>>
  private readonly remove: (path: string) => void | Promise<void>
  private lock: RuntimeLockHandle | undefined
  private graph: RuntimeStoreGraph<TApplication> | undefined
  private activeHandlers = 0
  private drainWaiters: Array<() => void> = []
  private resetPromise: Promise<void> | undefined
  private currentState: RuntimeLifecycleState = 'new'

  constructor(options: RuntimeLifecycleCoordinatorOptions<TApplication>) {
    this.configuredDatabasePath = options.databasePath
    this.acquireLock = options.acquireRuntimeLock ?? acquireRuntimeLock
    this.createGraph = options.createStoreGraph
    this.remove = options.removeFile ?? (path => rm(path, { force: true }))
  }

  get state(): RuntimeLifecycleState {
    return this.currentState
  }

  async start(): Promise<void> {
    if (this.currentState !== 'new') throw new RuntimeUnavailableError('RUNTIME_CLOSED')
    this.currentState = 'starting'
    try {
      this.lock = await this.acquireLock(this.configuredDatabasePath)
      this.graph = await this.createGraph(this.lock.canonicalDatabasePath)
      await this.graph.processor.start()
      this.currentState = 'running'
    } catch (error) {
      const graph = this.graph
      this.graph = undefined
      try {
        await graph?.close()
      } finally {
        const lock = this.lock
        this.lock = undefined
        await lock?.release()
        this.currentState = 'closed-error'
      }
      throw error
    }
  }

  async execute<TResult>(operation: (application: TApplication) => TResult | Promise<TResult>): Promise<TResult> {
    if (this.currentState === 'maintenance') {
      throw new RuntimeUnavailableError('RUNTIME_MAINTENANCE')
    }
    if (this.currentState !== 'running' || !this.graph) {
      throw new RuntimeUnavailableError('RUNTIME_CLOSED')
    }

    const application = this.graph.application
    this.activeHandlers += 1
    try {
      return await operation(application)
    } finally {
      this.activeHandlers -= 1
      if (this.activeHandlers === 0) {
        for (const resolveDrain of this.drainWaiters.splice(0)) resolveDrain()
      }
    }
  }

  resetAllData(): Promise<void> {
    if (this.resetPromise) return this.resetPromise
    if (this.currentState !== 'running' || !this.graph || !this.lock) {
      return Promise.reject(new RuntimeUnavailableError('RUNTIME_CLOSED'))
    }

    // Admission closes synchronously so no handler can enter behind reset.
    this.currentState = 'maintenance'
    this.resetPromise = this.performReset().finally(() => {
      this.resetPromise = undefined
    })
    return this.resetPromise
  }

  async close(): Promise<void> {
    if (this.resetPromise) {
      try {
        await this.resetPromise
      } catch {
        // Reset already left the runtime failure-closed; shutdown still releases.
      }
    }
    if (this.currentState === 'closed' && !this.lock) return

    this.currentState = 'closing'
    await this.waitForHandlers()
    const graph = this.graph
    this.graph = undefined
    const lock = this.lock
    this.lock = undefined
    try {
      if (graph) {
        await graph.processor.stop()
        await graph.close()
      }
    } finally {
      try {
        await lock?.release()
      } finally {
        this.currentState = 'closed'
      }
    }
  }

  private async performReset(): Promise<void> {
    const previousGraph = this.graph
    const lock = this.lock
    if (!previousGraph || !lock) {
      this.currentState = 'closed-error'
      throw new RuntimeResetFailedError(new Error('Runtime graph or lock is unavailable'))
    }

    try {
      await this.waitForHandlers()
      await previousGraph.processor.stop()
      await previousGraph.checkpointWal()
      await previousGraph.close()
      this.graph = undefined

      // Re-canonicalize while the lock is retained and require the same target.
      // This prevents a path swap from redirecting reset to an unrelated file.
      const currentCanonicalPath = await canonicalizeRuntimeDatabasePath(lock.canonicalDatabasePath)
      if (currentCanonicalPath !== lock.canonicalDatabasePath) {
        throw new Error('Runtime database path changed during reset')
      }

      for (const target of deletionTargets(lock.canonicalDatabasePath)) {
        assertExactDeletionTarget(lock.canonicalDatabasePath, target)
        await this.remove(target)
      }

      const nextGraph = await this.createGraph(lock.canonicalDatabasePath)
      this.graph = nextGraph
      try {
        await nextGraph.processor.start()
      } catch (error) {
        this.graph = undefined
        await nextGraph.close()
        throw error
      }
      this.currentState = 'running'
    } catch (cause) {
      this.graph = undefined
      this.currentState = 'closed-error'
      throw new RuntimeResetFailedError(cause)
    }
  }

  private waitForHandlers(): Promise<void> {
    if (this.activeHandlers === 0) return Promise.resolve()
    return new Promise(resolve => this.drainWaiters.push(resolve))
  }
}
