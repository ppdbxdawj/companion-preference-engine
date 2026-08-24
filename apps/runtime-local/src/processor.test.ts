import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  interactionEvidenceFixture,
  pendingCandidateProposalFixture,
  preferenceIdentityFixture,
} from '../../../packages/contracts/src/fixtures.js'
import type {
  ConnectionSettings,
  InteractionEvidence,
  PendingCandidateProposal,
  UpdateConnectionSettingsCommand,
} from '../../../packages/contracts/src/schemas.js'
import {
  FakePreferenceObserver,
  type PreferenceObserver,
} from '../../../packages/observer/src/index.js'
import type { PreferenceRepository } from '../../../packages/preference-core/src/repository.js'
import {
  openSqliteDatabase,
  SqlitePreferenceRepository,
} from '../../../packages/profile-store-sqlite/src/index.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EvidenceProcessor } from './processor.js'

const temporaryDirectories: string[] = []
let sequence = 0

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const temporaryDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'companion-runtime-processor-'))
  temporaryDirectories.push(directory)
  return join(directory, 'profile.sqlite')
}

const openRepository = (filename: string) => {
  const database = openSqliteDatabase({ filename })
  const repository = new SqlitePreferenceRepository({
    database,
    claimTokenFactory: () => `claim-${++sequence}`,
    auditEventIdFactory: () => `audit-${++sequence}`,
  })
  return { database, repository }
}

const enableSettings = async (
  repository: PreferenceRepository,
  patch: UpdateConnectionSettingsCommand['patch'] = {},
): Promise<ConnectionSettings> => repository.updateConnectionSettingsAtomically({
  actionId: `settings-${++sequence}`,
  identity: structuredClone(preferenceIdentityFixture),
  hostId: interactionEvidenceFixture.identity.hostId,
  expectedSettingsRevision: 0,
  patch: {
    collectionPolicy: {
      allowedSources: [structuredClone(interactionEvidenceFixture.source)],
      retainContent: true,
    },
    outboundInferencePolicy: {
      mode: 'local-only',
      allowedSources: [structuredClone(interactionEvidenceFixture.source)],
    },
    projectionPolicy: structuredClone(interactionEvidenceFixture.policySnapshot.projection),
    observeEnabled: true,
    learnEnabled: true,
    applyEnabled: true,
    ...patch,
  },
  occurredAt: '2026-08-21T04:00:00.000Z',
})

const evidenceAtRevision = (
  id: string,
  sourceRef: string,
  settings: ConnectionSettings,
): InteractionEvidence => ({
  ...structuredClone(interactionEvidenceFixture),
  id,
  sourceRef,
  policySnapshot: {
    collection: structuredClone(settings.collectionPolicy),
    outboundInference: structuredClone(settings.outboundInferencePolicy),
    projection: structuredClone(settings.projectionPolicy),
    settingsRevision: settings.revision,
  },
}) as InteractionEvidence

const proposalFor = (
  evidenceId: string,
  digest = 'a'.repeat(64),
): PendingCandidateProposal => ({
  ...structuredClone(pendingCandidateProposalFixture),
  provenance: { kind: 'observer-evidence', evidenceIds: [evidenceId] },
  evidenceIds: [evidenceId],
  idempotencyKey: { version: 1, algorithm: 'sha256', digest },
}) as PendingCandidateProposal

const createProcessor = (
  repository: PreferenceRepository,
  observer: PreferenceObserver,
  now = '2026-08-21T04:02:00.000Z',
) => new EvidenceProcessor({
  repository,
  observer,
  workerId: 'runtime-worker-1',
  leaseDurationMs: 60_000,
  now: () => now,
  idFactory: (kind) => `${kind}-${++sequence}`,
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('EvidenceProcessor policy and crash oracle', () => {
  it.each([
    ['learning-disabled', { learnEnabled: false }],
    ['outbound-inference-disabled', { outboundInferencePolicy: { mode: 'disabled' } }],
  ] as const)('does not call even the Fake Observer when %s', async (reasonCode, patch) => {
    const { database, repository } = openRepository(':memory:')
    const settings = await enableSettings(repository, patch)
    const evidence = evidenceAtRevision(`evidence-${reasonCode}`, `source-${reasonCode}`, settings)
    await repository.ingestEvidenceAtomically(evidence)
    const observer = new FakePreferenceObserver([proposalFor(evidence.id)])
    const propose = vi.spyOn(observer, 'propose')

    await expect(createProcessor(repository, observer).drain()).resolves.toMatchObject({
      claimed: 1,
      proposed: 0,
      discarded: 1,
    })
    expect(propose).not.toHaveBeenCalled()
    await expect(repository.listCandidates()).resolves.toEqual([])
    await expect(repository.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['policy-decision-recorded'],
    })).resolves.toContainEqual(expect.objectContaining({ reasonCode }))
    database.close()
  })

  it('rechecks the canonical settings revision after observation and discards a late result', async () => {
    const { database, repository } = openRepository(':memory:')
    const settings = await enableSettings(repository)
    const evidence = evidenceAtRevision('evidence-policy-fence', 'source-policy-fence', settings)
    await repository.ingestEvidenceAtomically(evidence)

    const response = deferred<PendingCandidateProposal[]>()
    const called = deferred<AbortSignal | undefined>()
    const observer: PreferenceObserver = {
      propose: vi.fn(async (_input, signal) => {
        called.resolve(signal)
        return response.promise
      }),
    }
    const processing = createProcessor(repository, observer).drain()
    await called.promise

    await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-disable-learning-in-flight',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: settings.revision,
      patch: { learnEnabled: false },
      occurredAt: '2026-08-21T04:01:00.000Z',
    })
    response.resolve([proposalFor(evidence.id)])

    await expect(processing).resolves.toMatchObject({ proposed: 0, discarded: 1 })
    await expect(repository.listCandidates()).resolves.toEqual([])
    await expect(repository.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['policy-decision-recorded'],
    })).resolves.toContainEqual(expect.objectContaining({
      reasonCode: 'stale-settings-revision',
      settingsRevision: settings.revision + 1,
    }))
    database.close()
  })

  it('keeps the settings fence atomic when policy changes at the completion boundary', async () => {
    const { database, repository } = openRepository(':memory:')
    const settings = await enableSettings(repository)
    const evidence = evidenceAtRevision('evidence-atomic-fence', 'source-atomic-fence', settings)
    await repository.ingestEvidenceAtomically(evidence)
    let fenceInjected = false

    const fencedRepository = new Proxy<PreferenceRepository>(repository, {
      get(target, property, receiver) {
        if (property === 'completeEvidenceProcessingAtomically') {
          return async (command: Parameters<PreferenceRepository['completeEvidenceProcessingAtomically']>[0]) => {
            if (!fenceInjected) {
              fenceInjected = true
              await target.updateConnectionSettingsAtomically({
                actionId: 'settings-disable-at-completion',
                identity: structuredClone(preferenceIdentityFixture),
                hostId: evidence.identity.hostId,
                expectedSettingsRevision: settings.revision,
                patch: { learnEnabled: false },
                occurredAt: '2026-08-21T04:01:30.000Z',
              })
            }
            return target.completeEvidenceProcessingAtomically(command)
          }
        }
        const value = Reflect.get(target, property, receiver) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const observer = new FakePreferenceObserver([proposalFor(evidence.id, 'd'.repeat(64))])

    await expect(createProcessor(fencedRepository, observer).drain()).resolves.toMatchObject({
      proposed: 0,
      discarded: 1,
    })
    expect(fenceInjected).toBe(true)
    await expect(repository.listCandidates()).resolves.toEqual([])
    await expect(repository.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['policy-decision-recorded'],
    })).resolves.toContainEqual(expect.objectContaining({
      reasonCode: 'stale-settings-revision',
      settingsRevision: settings.revision + 1,
    }))
    database.close()
  })

  it('recovers an expired lease after restart and creates one logical candidate', async () => {
    const filename = temporaryDatabasePath()
    const first = openRepository(filename)
    const settings = await enableSettings(first.repository)
    const evidence = evidenceAtRevision('evidence-restart', 'source-restart', settings)
    await first.repository.ingestEvidenceAtomically(evidence)
    await expect(first.repository.claimNextEvidence(
      'crashed-worker',
      '2026-08-21T04:01:00.000Z',
      '2026-08-21T04:00:30.000Z',
    )).resolves.toBeDefined()
    first.database.close()

    const second = openRepository(filename)
    const observer = new FakePreferenceObserver([proposalFor(evidence.id, 'b'.repeat(64))])
    await expect(createProcessor(second.repository, observer).drain()).resolves.toMatchObject({
      claimed: 1,
      proposed: 1,
    })
    await expect(createProcessor(second.repository, observer).drain()).resolves.toMatchObject({
      claimed: 0,
      proposed: 0,
    })
    await expect(second.repository.listCandidates('pending_confirmation')).resolves.toHaveLength(1)
    second.database.close()
  })

  it('aborts an in-flight observation and rejects its late result after evidence deletion', async () => {
    const { database, repository } = openRepository(':memory:')
    const settings = await enableSettings(repository)
    const evidence = evidenceAtRevision('evidence-delete-in-flight', 'source-delete-in-flight', settings)
    await repository.ingestEvidenceAtomically(evidence)

    const response = deferred<PendingCandidateProposal[]>()
    const called = deferred<AbortSignal | undefined>()
    const observer: PreferenceObserver = {
      propose: vi.fn(async (_input, signal) => {
        called.resolve(signal)
        return response.promise
      }),
    }
    const processor = createProcessor(repository, observer)
    const processing = processor.drain()
    const signal = await called.promise

    await repository.deleteEvidenceAtomically({
      actionId: 'delete-in-flight-evidence',
      evidenceId: evidence.id,
      identity: structuredClone(preferenceIdentityFixture),
      auditEventId: 'audit-delete-in-flight-evidence',
      revokeDependentPreferences: false,
      occurredAt: '2026-08-21T04:01:00.000Z',
    })
    expect(processor.cancelEvidence(evidence.id, 'evidence-deleted')).toBe(true)
    expect(signal?.aborted).toBe(true)
    response.resolve([proposalFor(evidence.id, 'c'.repeat(64))])

    await expect(processing).resolves.toMatchObject({ proposed: 0, discarded: 1 })
    await expect(repository.listCandidates()).resolves.toEqual([])
    await expect(repository.getEvidenceProvenance(evidence.id)).resolves.toMatchObject({
      state: 'deleted-tombstone',
      evidenceId: evidence.id,
    })
    await expect(repository.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['policy-decision-recorded'],
    })).resolves.toContainEqual(expect.objectContaining({ reasonCode: 'late-result-discarded' }))
    database.close()
  })
})
