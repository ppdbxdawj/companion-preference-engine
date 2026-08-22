import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  confirmCandidateCommandFixture,
  connectionSettingsFixture,
  contentFreePolicyDecisionFixture,
  createExplicitPreferenceCommandFixture,
  deleteEvidenceCommandFixture,
  identityContextFixture,
  interactionEvidenceFixture,
  pendingCandidateProposalFixture,
  preferenceIdentityFixture,
  reportProjectionStatusCommandFixture,
  suppressCandidateCommandFixture,
  updateConnectionSettingsCommandFixture,
} from '@companion-preference/contracts'
import type {
  ConfirmCandidateCommand,
  ContentFreePolicyDecision,
  CreateExplicitPreferenceCommand,
  InteractionEvidence,
  PendingCandidateProposal,
  PreferenceIdentity,
  ReportProjectionStatusCommand,
  UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import { ActionPayloadConflictError, RevisionConflictError } from './lifecycle.js'
import {
  InMemoryPreferenceRepository,
  type RepositoryAtomicStep,
  type RepositoryOperation,
} from './in-memory-repository.js'

type T5B2Snapshot = {
  state: {
    evidence: Record<string, unknown>
    evidenceTombstones?: Record<string, unknown>
    candidates: Record<string, unknown>
    preferences: Record<string, unknown>
    suppressions: unknown[]
    connectionSettings?: Record<string, unknown>
    policyDecisions?: Record<string, unknown>
    receipts: Record<string, unknown>
    audits: unknown[]
  }
}

const snapshot = (repository: InMemoryPreferenceRepository) =>
  repository.exportSnapshot() as unknown as T5B2Snapshot

const createRepository = (
  options: Partial<ConstructorParameters<typeof InMemoryPreferenceRepository>[0]> = {},
) => {
  let audit = 0
  return new InMemoryPreferenceRepository({
    claimTokenFactory: () => 't5b2-claim-token',
    auditEventIdFactory: () => `t5b2-audit-${++audit}`,
    ...options,
  })
}

const seedCandidate = async (
  repository: InMemoryPreferenceRepository,
  candidateId = 'candidate-1',
  evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence,
) => {
  await repository.ingestEvidenceAtomically(evidence)
  const claim = (await repository.claimNextEvidence(
    't5b2-worker',
    '2026-08-21T04:10:00Z',
    '2026-08-21T04:00:00Z',
  ))!
  await repository.completeEvidenceProcessingAtomically({
    claim,
    expectedSettingsRevision: evidence.policySnapshot.settingsRevision,
    candidates: [{
      candidateId,
      proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal,
      auditEventId: `audit-${candidateId}`,
    }],
    auditEventId: `audit-complete-${candidateId}`,
    occurredAt: '2026-08-21T04:01:00Z',
  })
}

describe('T5B2 connection settings and content-free adapter state', () => {
  it('returns deterministic deny-by-default settings owned by stable identity plus host', async () => {
    const repository = createRepository()
    const actual = await repository.getConnectionSettings(preferenceIdentityFixture, 'new-host')
    expect(actual).toEqual({
      schemaVersion: 1,
      identity: preferenceIdentityFixture,
      hostId: 'new-host',
      collectionPolicy: { allowedSources: [], retainContent: false },
      outboundInferencePolicy: { mode: 'disabled' },
      projectionPolicy: { allowedHosts: [], allowedDomains: [] },
      observeEnabled: false,
      learnEnabled: false,
      applyEnabled: false,
      revision: 0,
      updatedAt: '1970-01-01T00:00:00.000Z',
    })
    actual.identity.userId = 'mutated-outside'
    expect((await repository.getConnectionSettings(preferenceIdentityFixture, 'new-host')).identity)
      .toEqual(preferenceIdentityFixture)
  })

  it('updates only the addressed identity/host with a revision fence, audit, receipt, and exact replay', async () => {
    const repository = createRepository()
    const command = {
      ...structuredClone(updateConnectionSettingsCommandFixture),
      expectedSettingsRevision: 0,
    } as unknown as UpdateConnectionSettingsCommand
    const updated = await repository.updateConnectionSettingsAtomically(command)
    expect(updated).toMatchObject({
      identity: command.identity,
      hostId: command.hostId,
      revision: 1,
      applyEnabled: true,
      updatedAt: command.occurredAt,
    })
    expect(await repository.updateConnectionSettingsAtomically(command)).toEqual(updated)
    const restarted = createRepository({ snapshot: repository.exportSnapshot() })
    expect(await restarted.updateConnectionSettingsAtomically(command)).toEqual(updated)
    expect(await restarted.getConnectionSettings(command.identity, command.hostId)).toEqual(updated)
    expect((await restarted.getConnectionSettings(command.identity, 'other-host')).revision).toBe(0)
    expect(await restarted.listAuditEvents({
      identity: command.identity,
      kinds: ['connection-settings-updated'],
    })).toEqual([expect.objectContaining({
      actor: 'user', actionId: command.actionId,
      entity: { kind: 'connection', hostId: command.hostId },
      settingsRevision: 1,
    })])
  })

  it('rejects stale settings revisions and action-id payload conflicts without mutation', async () => {
    const repository = createRepository()
    const command = {
      ...structuredClone(updateConnectionSettingsCommandFixture),
      expectedSettingsRevision: 0,
    } as unknown as UpdateConnectionSettingsCommand
    await repository.updateConnectionSettingsAtomically(command)
    const before = repository.exportSnapshot()
    await expect(repository.updateConnectionSettingsAtomically({
      ...command,
      actionId: 'action-stale-settings',
      patch: { learnEnabled: true },
      expectedSettingsRevision: 0,
    })).rejects.toBeInstanceOf(RevisionConflictError)
    await expect(repository.updateConnectionSettingsAtomically({
      ...command,
      patch: { applyEnabled: false },
    })).rejects.toBeInstanceOf(ActionPayloadConflictError)
    expect(repository.exportSnapshot()).toEqual(before)
  })

  it('reports projection truth at the exact settings fence and retains hash/content-free detail', async () => {
    const repository = createRepository()
    await repository.updateConnectionSettingsAtomically({
      ...structuredClone(updateConnectionSettingsCommandFixture),
      expectedSettingsRevision: 0,
    } as unknown as UpdateConnectionSettingsCommand)
    const command = {
      ...structuredClone(reportProjectionStatusCommandFixture),
      expectedSettingsRevision: 1,
    } as unknown as ReportProjectionStatusCommand
    const status = await repository.reportAdapterProjectionStatusAtomically(command)
    expect(status).toEqual({
      schemaVersion: 1,
      identity: command.identity,
      hostId: command.hostId,
      domain: command.domain,
      settingsRevision: 1,
      connectionState: command.connectionState,
      state: command.state,
      lastGuidanceHash: command.lastGuidanceHash,
      lastAttemptAt: command.lastAttemptAt,
      detailCode: command.detailCode,
      reportedAt: command.occurredAt,
    })
    expect((await repository.getConnectionSettings(command.identity, command.hostId)).projectionStatus)
      .toEqual(status)
    expect(await repository.reportAdapterProjectionStatusAtomically(command)).toEqual(status)

    const tombstone = await repository.reportAdapterProjectionStatusAtomically({
      ...command,
      actionId: 'action-report-tombstone',
      state: 'tombstone-locally-written',
      detailCode: 'tombstone-local-write-completed',
      lastGuidanceHash: undefined,
      occurredAt: '2026-08-21T03:23:31Z',
    } as unknown as ReportProjectionStatusCommand)
    expect(tombstone).not.toHaveProperty('lastGuidanceHash')
  })

  it('rejects projection reports for absent/mismatched ownership or stale revisions', async () => {
    const repository = createRepository()
    const command = {
      ...structuredClone(reportProjectionStatusCommandFixture),
      expectedSettingsRevision: 0,
    } as unknown as ReportProjectionStatusCommand
    const before = repository.exportSnapshot()
    await expect(repository.reportAdapterProjectionStatusAtomically({
      ...command,
      expectedSettingsRevision: 1,
    })).rejects.toBeInstanceOf(RevisionConflictError)
    await expect(repository.reportAdapterProjectionStatusAtomically({
      ...command,
      identity: { ...command.identity, userId: 'other-user' },
      expectedSettingsRevision: 1,
    })).rejects.toBeInstanceOf(RevisionConflictError)
    expect(repository.exportSnapshot()).toEqual(before)
  })

  it('records a decision exactly once as a strictly content-free audit projection', async () => {
    const repository = createRepository()
    const decision = {
      ...structuredClone(contentFreePolicyDecisionFixture),
      settingsRevision: 0,
    } as ContentFreePolicyDecision
    await repository.recordPolicyDecisionAtomically(decision)
    await repository.recordPolicyDecisionAtomically(decision)
    const restarted = createRepository({ snapshot: repository.exportSnapshot() })
    await restarted.recordPolicyDecisionAtomically(decision)
    const audits = await restarted.listAuditEvents({
      identity: decision.identity,
      kinds: ['policy-decision-recorded'],
    })
    expect(audits).toEqual([{
      schemaVersion: 1,
      id: decision.decisionId,
      identity: decision.identity,
      actor: 'runtime',
      kind: 'policy-decision-recorded',
      reasonCode: decision.reasonCode,
      entity: { kind: 'policy-decision', decisionId: decision.decisionId },
      settingsRevision: decision.settingsRevision,
      occurredAt: decision.occurredAt,
    }])
    const serialized = JSON.stringify(snapshot(restarted).state)
    for (const forbidden of ['learningPayload', 'userText', 'assistantText', 'composedMessage', 'contexts', 'tools']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('rejects decision-id payload conflict and a decision that leads canonical settings', async () => {
    const repository = createRepository()
    const decision = {
      ...structuredClone(contentFreePolicyDecisionFixture),
      settingsRevision: 0,
    } as ContentFreePolicyDecision
    await repository.recordPolicyDecisionAtomically(decision)
    const before = repository.exportSnapshot()
    await expect(repository.recordPolicyDecisionAtomically({
      ...decision,
      reasonCode: 'collection-disabled',
    })).rejects.toBeInstanceOf(ActionPayloadConflictError)
    await expect(repository.recordPolicyDecisionAtomically({
      ...decision,
      decisionId: 'decision-leading-settings',
      settingsRevision: 1,
    })).rejects.toBeInstanceOf(RevisionConflictError)
    expect(repository.exportSnapshot()).toEqual(before)
  })
})

describe('T5B2 evidence deletion graph', () => {
  it('tombstones evidence, deletes only evidence-only pending candidates, and retains authorized preferences', async () => {
    const repository = createRepository()
    await seedCandidate(repository)
    const confirmed = await repository.confirmCandidateAtomically(
      structuredClone(confirmCandidateCommandFixture) as unknown as ConfirmCandidateCommand,
    )

    const secondEvidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    secondEvidence.id = 'evidence-pending-only'
    secondEvidence.sourceRef = 'source-pending-only'
    secondEvidence.occurredAt = '2026-08-21T04:02:00Z'
    const secondProposal = structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal
    secondProposal.idempotencyKey.digest = '7'.repeat(64)
    secondProposal.evidenceIds = [secondEvidence.id]
    secondProposal.provenance = { kind: 'observer-evidence', evidenceIds: [secondEvidence.id] }
    await repository.ingestEvidenceAtomically(secondEvidence)
    const claim = (await repository.claimNextEvidence('worker-two', '2026-08-21T04:20:00Z', '2026-08-21T04:10:00Z'))!
    await repository.completeEvidenceProcessingAtomically({
      claim,
      expectedSettingsRevision: secondEvidence.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-pending-only', proposal: secondProposal, auditEventId: 'audit-pending-only' }],
      auditEventId: 'audit-complete-pending-only',
      occurredAt: '2026-08-21T04:11:00Z',
    })

    const result = await repository.deleteEvidenceAtomically({
      ...structuredClone(deleteEvidenceCommandFixture),
      evidenceId: secondEvidence.id,
    })
    expect(result).toEqual({
      kind: 'evidence-deletion', evidenceId: secondEvidence.id,
      disposition: 'deleted', tombstoneCreated: true,
      deletedPendingCandidateIds: ['candidate-pending-only'], revokedPreferenceIds: [],
    })
    expect(await repository.getEvidenceProvenance(secondEvidence.id)).toEqual({
      state: 'deleted-tombstone', evidenceId: secondEvidence.id,
      deletedAt: deleteEvidenceCommandFixture.occurredAt, reasonCode: 'user-requested',
    })
    expect(await repository.getCandidate('candidate-pending-only')).toBeUndefined()
    expect(await repository.getPreference(confirmed.id)).toEqual(confirmed)
  })

  it('preserves retained candidate/suppression governance while scrubbing deleted evidence references', async () => {
    const repository = createRepository()
    await seedCandidate(repository)
    await repository.suppressCandidateAtomically(structuredClone(suppressCandidateCommandFixture))
    const result = await repository.deleteEvidenceAtomically(structuredClone(deleteEvidenceCommandFixture))
    expect(result.deletedPendingCandidateIds).toEqual([])
    expect(await repository.getCandidate('candidate-1')).toMatchObject({
      status: 'rejected', evidenceIds: [], provenance: { kind: 'observer-evidence', evidenceIds: [] },
    })
    expect(await repository.listCandidateSuppressions(identityContextFixture)).toHaveLength(1)
    expect(JSON.stringify(repository.exportSnapshot())).not.toContain(
      interactionEvidenceFixture.learningPayload.userText,
    )
  })

  it('optionally revokes every active dependent preference with deterministic ordering and audits', async () => {
    const repository = createRepository()
    const first = await repository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      evidenceIds: [interactionEvidenceFixture.id],
    } as unknown as CreateExplicitPreferenceCommand)
    const second = await repository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      actionId: 'action-create-dependent-two', preferenceId: 'preference-dependent-two',
      preference: { key: 'interaction.directness', value: 'direct' },
      evidenceIds: [interactionEvidenceFixture.id],
    } as unknown as CreateExplicitPreferenceCommand)
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const command = { ...structuredClone(deleteEvidenceCommandFixture), revokeDependentPreferences: true }
    const result = await repository.deleteEvidenceAtomically(command)
    expect(result.revokedPreferenceIds).toEqual([first.id, second.id].sort())
    for (const id of result.revokedPreferenceIds) {
      expect(await repository.getPreference(id)).toMatchObject({
        status: 'revoked', revision: 2, updatedAt: command.occurredAt,
      })
    }
    const audits = await repository.listAuditEvents({ identity: command.identity })
    expect(audits.filter((event) => event.kind === 'preference-revoked')).toHaveLength(2)
    expect(audits.filter((event) => event.kind === 'evidence-deleted')).toEqual([
      expect.objectContaining({ id: command.auditEventId, actionId: command.actionId }),
    ])
  })

  it('returns the stored result on exact replay, including after restart, and distinguishes a new already-deleted action', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const command = structuredClone(deleteEvidenceCommandFixture)
    const original = await repository.deleteEvidenceAtomically(command)
    expect(await repository.deleteEvidenceAtomically(command)).toEqual(original)
    const restarted = createRepository({ snapshot: repository.exportSnapshot() })
    expect(await restarted.deleteEvidenceAtomically(command)).toEqual(original)
    expect(await restarted.deleteEvidenceAtomically({
      ...command,
      actionId: 'action-delete-already-deleted',
      auditEventId: 'audit-delete-already-deleted',
      occurredAt: '2026-08-21T03:16:30Z',
    })).toEqual({
      kind: 'evidence-deletion', evidenceId: command.evidenceId,
      disposition: 'already-deleted', tombstoneCreated: false,
      deletedPendingCandidateIds: [], revokedPreferenceIds: [],
    })
  })

  it('rejects identity mismatch and action payload conflict without leaking existence or mutating state', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const command = structuredClone(deleteEvidenceCommandFixture)
    await expect(repository.deleteEvidenceAtomically({
      ...command,
      identity: { ...command.identity, userId: 'other-user' },
    })).rejects.toMatchObject({ code: expect.any(String) })
    const before = repository.exportSnapshot()
    await repository.deleteEvidenceAtomically(command)
    const after = repository.exportSnapshot()
    await expect(repository.deleteEvidenceAtomically({
      ...command,
      revokeDependentPreferences: true,
    })).rejects.toBeInstanceOf(ActionPayloadConflictError)
    expect(repository.exportSnapshot()).toEqual(after)
    expect(before).not.toEqual(after)
  })
})

describe('T5B2 real atomic boundaries', () => {
  const allSteps: RepositoryAtomicStep[] = [
    'after-state', 'after-audit', 'after-receipt', 'before-commit',
  ]

  it('stages state, audit, receipt, and commit separately and rolls back every T5B2 mutation', async () => {
    const cases: Array<{
      operation: RepositoryOperation
      prepare: (repository: InMemoryPreferenceRepository) => Promise<void>
      run: (repository: InMemoryPreferenceRepository) => Promise<unknown>
      steps: RepositoryAtomicStep[]
    }> = [
      {
        operation: 'update-connection-settings', prepare: async () => {}, steps: allSteps,
        run: (repository) => repository.updateConnectionSettingsAtomically({
          ...structuredClone(updateConnectionSettingsCommandFixture), expectedSettingsRevision: 0,
        } as unknown as UpdateConnectionSettingsCommand),
      },
      {
        operation: 'report-projection-status',
        prepare: (repository) => repository.updateConnectionSettingsAtomically({
          ...structuredClone(updateConnectionSettingsCommandFixture), expectedSettingsRevision: 0,
        } as unknown as UpdateConnectionSettingsCommand).then(() => undefined),
        steps: allSteps,
        run: (repository) => repository.reportAdapterProjectionStatusAtomically({
          ...structuredClone(reportProjectionStatusCommandFixture), expectedSettingsRevision: 1,
        } as unknown as ReportProjectionStatusCommand),
      },
      {
        operation: 'record-policy-decision', prepare: async () => {},
        steps: ['after-state', 'after-audit', 'before-commit'],
        run: (repository) => repository.recordPolicyDecisionAtomically({
          ...structuredClone(contentFreePolicyDecisionFixture), settingsRevision: 0,
        } as ContentFreePolicyDecision),
      },
      {
        operation: 'delete-evidence',
        prepare: (repository) => repository.ingestEvidenceAtomically(
          structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence,
        ).then(() => undefined),
        steps: allSteps,
        run: (repository) => repository.deleteEvidenceAtomically(
          structuredClone(deleteEvidenceCommandFixture),
        ),
      },
    ]

    for (const testCase of cases) {
      for (const injectedStep of testCase.steps) {
        let armed = false
        let before!: ReturnType<InMemoryPreferenceRepository['exportSnapshot']>
        const observed: Array<{ step: RepositoryAtomicStep; changed: boolean }> = []
        const repository = createRepository({
          failAt: (operation, step) => {
            if (!armed || operation !== testCase.operation) return
            observed.push({ step, changed: JSON.stringify(repository.exportSnapshot()) !== JSON.stringify(before) })
            if (step === injectedStep) throw new Error(`rollback-${operation}-${step}`)
          },
        })
        await testCase.prepare(repository)
        before = repository.exportSnapshot()
        armed = true
        await expect(testCase.run(repository)).rejects.toThrow(
          `rollback-${testCase.operation}-${injectedStep}`,
        )
        expect(observed.map((item) => item.step)).toEqual(
          testCase.steps.slice(0, testCase.steps.indexOf(injectedStep) + 1),
        )
        expect(observed.every((item) => item.changed)).toBe(true)
        expect(repository.exportSnapshot()).toEqual(before)
      }
    }
  })
})

describe('T5B2 correction regressions', () => {
  it('fails closed without mutation for a never-existing evidence ID using the non-enumerating owner-mismatch shape', async () => {
    const missing = createRepository()
    const missingBefore = missing.exportSnapshot()
    const missingCommand = {
      ...structuredClone(deleteEvidenceCommandFixture),
      evidenceId: 'evidence-never-existed',
    }
    let missingError: unknown
    try { await missing.deleteEvidenceAtomically(missingCommand) } catch (error) { missingError = error }
    expect(missingError).toMatchObject({ code: 'EVIDENCE_NOT_FOUND' })
    expect(missing.exportSnapshot()).toEqual(missingBefore)

    const owned = createRepository()
    await owned.ingestEvidenceAtomically(
      structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence,
    )
    let mismatchError: unknown
    try {
      await owned.deleteEvidenceAtomically({
        ...structuredClone(deleteEvidenceCommandFixture),
        identity: { ...deleteEvidenceCommandFixture.identity, userId: 'other-user' },
      })
    } catch (error) { mismatchError = error }
    expect(missingError).toMatchObject({
      name: (mismatchError as Error & { name: string }).name,
      code: (mismatchError as Error & { code: string }).code,
      message: (mismatchError as Error).message,
    })
  })

  it('audits and genuinely stages every boundary for a new action against an existing tombstone', async () => {
    const seeded = createRepository()
    await seeded.ingestEvidenceAtomically(
      structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence,
    )
    await seeded.deleteEvidenceAtomically(structuredClone(deleteEvidenceCommandFixture))
    const tombstoned = seeded.exportSnapshot()
    const command = {
      ...structuredClone(deleteEvidenceCommandFixture),
      actionId: 'action-delete-existing-tombstone',
      auditEventId: 'audit-delete-existing-tombstone',
      occurredAt: '2026-08-21T03:16:30Z',
    }

    for (const injectedStep of ['after-state', 'after-audit', 'after-receipt', 'before-commit'] as const) {
      const observed: RepositoryAtomicStep[] = []
      const repository = createRepository({
        snapshot: tombstoned,
        failAt: (operation, step) => {
          if (operation !== 'delete-evidence') return
          observed.push(step)
          if (step === injectedStep) throw new Error(`rollback-already-deleted-${step}`)
        },
      })
      const before = repository.exportSnapshot()
      await expect(repository.deleteEvidenceAtomically(command)).rejects.toThrow(
        `rollback-already-deleted-${injectedStep}`,
      )
      expect(observed).toEqual(
        ['after-state', 'after-audit', 'after-receipt', 'before-commit']
          .slice(0, ['after-state', 'after-audit', 'after-receipt', 'before-commit'].indexOf(injectedStep) + 1),
      )
      expect(repository.exportSnapshot()).toEqual(before)
    }

    const repository = createRepository({ snapshot: tombstoned })
    const result = await repository.deleteEvidenceAtomically(command)
    expect(result).toMatchObject({ disposition: 'already-deleted', tombstoneCreated: false })
    expect(await repository.listAuditEvents({ identity: command.identity })).toContainEqual({
      schemaVersion: 1,
      id: command.auditEventId,
      identity: command.identity,
      actor: 'user',
      kind: 'evidence-deleted',
      reasonCode: 'user-requested',
      entity: { kind: 'evidence', evidenceId: command.evidenceId },
      actionId: command.actionId,
      occurredAt: command.occurredAt,
    })
    const restarted = createRepository({ snapshot: repository.exportSnapshot() })
    expect(await restarted.deleteEvidenceAtomically(command)).toEqual(result)
  })

  it('rejects every canonical policy-decision payload change after restart while storing only a content-free digest', async () => {
    const repository = createRepository()
    const decision = {
      ...structuredClone(contentFreePolicyDecisionFixture),
      settingsRevision: 0,
    } as ContentFreePolicyDecision
    await repository.recordPolicyDecisionAtomically(decision)
    const saved = repository.exportSnapshot()
    const variants: ContentFreePolicyDecision[] = [
      { ...decision, hostId: 'different-host' },
      { ...decision, domain: 'voice' },
      { ...decision, stage: 'projection' },
      { ...decision, outcome: 'discarded' },
    ] as ContentFreePolicyDecision[]
    for (const variant of variants) {
      const restarted = createRepository({ snapshot: saved })
      await expect(restarted.recordPolicyDecisionAtomically(variant))
        .rejects.toBeInstanceOf(ActionPayloadConflictError)
      expect(restarted.exportSnapshot()).toEqual(saved)
    }
    const serialized = JSON.stringify(saved)
    expect(serialized).not.toContain('learningPayload')
    expect(serialized).not.toContain('userText')
    expect(serialized).not.toContain('assistantText')
  })

  it('scrubs retained candidates when the deleted ID appears only in counter-evidence or observer provenance', async () => {
    const repository = createRepository()
    await seedCandidate(repository)
    await repository.suppressCandidateAtomically(structuredClone(suppressCandidateCommandFixture))
    const target = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    target.id = 'evidence-reference-only'
    target.sourceRef = 'source-reference-only'
    await repository.ingestEvidenceAtomically(target)
    const saved = repository.exportSnapshot() as unknown as {
      state: { candidates: Record<string, PendingCandidateProposal & { id: string }> }
    }
    const candidate = Object.values(saved.state.candidates)[0]!
    candidate.counterEvidenceIds = [target.id]
    candidate.provenance = { kind: 'observer-evidence', evidenceIds: [target.id] }
    const restarted = createRepository({ snapshot: saved as unknown as ReturnType<typeof repository.exportSnapshot> })
    await restarted.deleteEvidenceAtomically({
      ...structuredClone(deleteEvidenceCommandFixture),
      evidenceId: target.id,
      actionId: 'action-delete-reference-only',
      auditEventId: 'audit-delete-reference-only',
    })
    expect(await restarted.getCandidate(candidate.id)).toMatchObject({
      counterEvidenceIds: [],
      provenance: { kind: 'observer-evidence', evidenceIds: [] },
    })
  })

  it('contains no completed T5B TODO helper or placeholder string', () => {
    const source = readFileSync(new URL('./in-memory-repository.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/TODO\(T5B\)/)
    expect(source).not.toMatch(/const todo\s*=/)
  })
})
