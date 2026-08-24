import { randomUUID } from 'node:crypto'

import type { PendingCandidateProposal } from '@companion-preference/contracts'
import { FakePreferenceObserver } from '@companion-preference/observer'
import {
  checkpointSqliteWal,
  openSqliteDatabase,
  SqlitePreferenceRepository,
} from '@companion-preference/profile-store-sqlite'

import { PreferenceApplication } from './application.js'
import { EvidenceProcessor, type ProcessorIdKind } from './processor.js'
import {
  RuntimeLifecycleCoordinator,
  type RuntimeLifecycleCoordinatorOptions,
} from './runtime-lifecycle.js'

export type RuntimeLocalOptions = Readonly<{
  databasePath: string
  observerProposals: readonly PendingCandidateProposal[]
  workerId?: string
  leaseDurationMs?: number
  leaseRenewalIntervalMs?: number
  pollIntervalMs?: number
  maxConsecutiveFailures?: number
  now?: () => string
  idFactory?: (kind: ProcessorIdKind | 'claim') => string
  acquireRuntimeLock?: RuntimeLifecycleCoordinatorOptions<PreferenceApplication>['acquireRuntimeLock']
  removeFile?: RuntimeLifecycleCoordinatorOptions<PreferenceApplication>['removeFile']
}>

/**
 * Compose, but do not start, a headless local runtime. All configuration is
 * explicit; the factory reads no environment and always constructs the
 * deterministic Fake Observer used by T9.
 */
export const createRuntimeLocal = (
  options: RuntimeLocalOptions,
): RuntimeLifecycleCoordinator<PreferenceApplication> => {
  const now = options.now ?? (() => new Date().toISOString())
  const idFactory = options.idFactory ?? ((kind: ProcessorIdKind | 'claim') => `${kind}-${randomUUID()}`)
  const observerProposals = structuredClone([...options.observerProposals])

  return new RuntimeLifecycleCoordinator<PreferenceApplication>({
    databasePath: options.databasePath,
    ...(options.acquireRuntimeLock === undefined
      ? {}
      : { acquireRuntimeLock: options.acquireRuntimeLock }),
    ...(options.removeFile === undefined ? {} : { removeFile: options.removeFile }),
    createStoreGraph: async (canonicalDatabasePath) => {
      const database = openSqliteDatabase({ filename: canonicalDatabasePath })
      try {
        const repository = new SqlitePreferenceRepository({
          database,
          claimTokenFactory: () => idFactory('claim'),
          auditEventIdFactory: () => idFactory('audit'),
        })
        const processor = new EvidenceProcessor({
          repository,
          observer: new FakePreferenceObserver(observerProposals),
          workerId: options.workerId ?? 'runtime-local-worker',
          leaseDurationMs: options.leaseDurationMs ?? 30_000,
          ...(options.leaseRenewalIntervalMs === undefined
            ? {}
            : { leaseRenewalIntervalMs: options.leaseRenewalIntervalMs }),
          ...(options.pollIntervalMs === undefined
            ? {}
            : { pollIntervalMs: options.pollIntervalMs }),
          ...(options.maxConsecutiveFailures === undefined
            ? {}
            : { maxConsecutiveFailures: options.maxConsecutiveFailures }),
          now,
          idFactory,
        })
        const application = new PreferenceApplication({
          repository,
          decisionIdFactory: () => idFactory('decision'),
          onSettingsChanged: () => {
            processor.cancelAll('settings-changed')
          },
          onEvidenceDeleted: (evidenceId) => {
            processor.cancelEvidence(evidenceId, 'evidence-deleted')
          },
        })

        return {
          application,
          processor,
          checkpointWal: () => checkpointSqliteWal(database),
          close: () => {
            database.close()
          },
        }
      } catch (error) {
        database.close()
        throw error
      }
    },
  })
}

/** @deprecated Use createRuntimeLocal with explicit options. */
export const createRuntimeLocalComposition = createRuntimeLocal
export type RuntimeLocalComposition = RuntimeLifecycleCoordinator<PreferenceApplication>

export * from './application.js'
export * from './processor.js'
export * from './auth.js'
export * from './runtime-lifecycle.js'
export * from './runtime-lock.js'
export * from './server.js'
export * from './settings.js'
