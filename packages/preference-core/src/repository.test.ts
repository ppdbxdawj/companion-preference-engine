import { describe, expect, it } from 'vitest'
import {
  identityContextFixture,
  interactionEvidenceFixture,
  pendingCandidateProposalFixture,
  preferenceIdentityFixture,
} from '@companion-preference/contracts'
import type { InteractionEvidence, PendingCandidateProposal } from '@companion-preference/contracts'
import { InMemoryPreferenceRepository } from './in-memory-repository.js'
import { ActionPayloadConflictError, RevisionConflictError } from './lifecycle.js'
import type { DiscardEvidenceProcessing, EvidenceCompletionReplay } from './repository.js'

type InspectableSnapshot = {
  state: {
    evidence: Record<string, unknown>
    candidates: Record<string, unknown>
    audits: unknown[]
    completions: Record<string, EvidenceCompletionReplay>
  }
}

const collectPropertyNames = (value: unknown, names = new Set<string>()): Set<string> => {
  if (value === null || typeof value !== 'object') return names
  if (Array.isArray(value)) {
    for (const item of value) collectPropertyNames(item, names)
    return names
  }
  for (const [key, nested] of Object.entries(value)) {
    names.add(key)
    collectPropertyNames(nested, names)
  }
  return names
}

const createRepository = () => new InMemoryPreferenceRepository({
  claimTokenFactory: () => 'claim-token-from-test',
  auditEventIdFactory: () => 'audit-event-from-test',
})

describe('PreferenceRepository contract', () => {
  it('atomically ingests and deduplicates the canonical identity/host/sourceRef tuple', async () => {
    const repository = createRepository()
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    expect(await repository.ingestEvidenceAtomically(evidence)).toBe('inserted')
    expect(await repository.ingestEvidenceAtomically({ ...evidence, id: 'another-id' })).toBe('duplicate')
    expect(await repository.listAuditEvents({ identity: evidence.identity })).toHaveLength(1)
  })

  it('uses explicit now, caller-controlled tokens, and monotonically fenced leases', async () => {
    const repository = createRepository()
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    await repository.ingestEvidenceAtomically(evidence)
    const first = await repository.claimNextEvidence('worker-a', '2026-08-21T04:01:00Z', '2026-08-21T04:00:00Z')
    expect(first).toMatchObject({ claimToken: 'claim-token-from-test', leaseVersion: 1 })
    expect(await repository.claimNextEvidence('worker-b', '2026-08-21T04:02:00Z', '2026-08-21T04:00:30Z')).toBeUndefined()
    const second = await repository.claimNextEvidence('worker-b', '2026-08-21T04:03:00Z', '2026-08-21T04:01:01Z')
    expect(second?.leaseVersion).toBe(2)
    await expect(repository.releaseEvidenceClaim(first!)).rejects.toMatchObject({ code: 'STALE_CLAIM' })
  })

  it('returns immutable clones rather than aliases to stored state', async () => {
    const repository = createRepository()
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    await repository.ingestEvidenceAtomically(evidence)
    evidence.learningPayload.userText = 'mutated outside repository'
    const provenance = await repository.listEvidenceProvenance(structuredClone(identityContextFixture))
    expect(provenance).toHaveLength(1)
    expect(provenance[0]).not.toBe(evidence)
  })

  it('exports a clone-isolated process-memory snapshot for re-instantiation', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const restarted = new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'claim-token-after-restart',
      auditEventIdFactory: () => 'audit-event-after-restart',
      snapshot: repository.exportSnapshot(),
    })
    expect(await restarted.listEvidenceProvenance(structuredClone(identityContextFixture))).toHaveLength(1)
  })

  it('claims the oldest available evidence using plain timestamp then ID ordering', async () => {
    const repository = createRepository()
    const later = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    later.id = 'evidence-z'
    later.sourceRef = 'source-z'
    later.occurredAt = '2026-08-21T04:00:01Z'
    const earlier = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    earlier.id = 'evidence-a'
    earlier.sourceRef = 'source-a'
    earlier.occurredAt = '2026-08-21T04:00:00Z'
    await repository.ingestEvidenceAtomically(later)
    await repository.ingestEvidenceAtomically(earlier)
    expect((await repository.claimNextEvidence('worker', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))?.evidence.id).toBe('evidence-a')
  })

  it('rejects stale worker, token, and lease-version references on renew', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const claim = (await repository.claimNextEvidence('worker', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
    for (const patch of [
      { workerId: 'other-worker' }, { claimToken: 'other-token' },
      { leaseVersion: claim.leaseVersion + 1 },
    ]) {
      await expect(repository.renewEvidenceClaim({ ...claim, ...patch }, '2026-08-21T04:03:00Z', '2026-08-21T04:01:30Z')).rejects.toMatchObject({ code: 'STALE_CLAIM' })
    }
  })

  it('atomically completes evidence and deduplicates candidate insertions', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const claim = (await repository.claimNextEvidence('worker', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
    const command = {
      claim,
      expectedSettingsRevision: interactionEvidenceFixture.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-completion-1', proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal, auditEventId: 'audit-candidate-completion-1' }],
      auditEventId: 'audit-completion-1',
      occurredAt: '2026-08-21T04:01:30Z',
    } as const
    await repository.completeEvidenceProcessingAtomically(command)
    await repository.completeEvidenceProcessingAtomically(command)
    expect(await repository.listCandidates()).toHaveLength(1)
  })

  it('atomically terminally discards a valid claim under the current settings fence', async () => {
    const repository = createRepository()
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-before-discard',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 0,
      patch: { observeEnabled: true, learnEnabled: true },
      occurredAt: '2026-08-21T03:59:00Z',
    })
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'discard-worker',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const settings = await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-revoked-during-observation',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 1,
      patch: { learnEnabled: false },
      occurredAt: '2026-08-21T04:00:30Z',
    })
    const command: DiscardEvidenceProcessing = {
      claim,
      expectedSettingsRevision: settings.revision,
      reasonCode: 'stale-settings-revision',
      auditEventId: 'audit-discarded-evidence',
      occurredAt: '2026-08-21T04:01:00Z',
    }

    await repository.discardEvidenceProcessingAtomically(command)
    await repository.discardEvidenceProcessingAtomically({
      ...command,
      auditEventId: 'ignored-audit-id-on-discard-replay',
    })
    await expect(repository.discardEvidenceProcessingAtomically({
      ...command,
      reasonCode: 'late-result-discarded',
    })).rejects.toBeInstanceOf(ActionPayloadConflictError)

    expect(await repository.claimNextEvidence(
      'worker-after-discard',
      '2026-08-21T04:20:00Z',
      '2026-08-21T04:11:00Z',
    )).toBeUndefined()
    expect(await repository.listCandidates()).toEqual([])
    expect(await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })).toEqual([{
      schemaVersion: 1,
      id: 'audit-discarded-evidence',
      identity: structuredClone(preferenceIdentityFixture),
      actor: 'observer',
      kind: 'evidence-processing-completed',
      reasonCode: 'stale-settings-revision',
      entity: { kind: 'evidence', evidenceId: evidence.id },
      settingsRevision: settings.revision,
      occurredAt: command.occurredAt,
    }])

    const restarted = new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'claim-token-after-discard-restart',
      auditEventIdFactory: () => 'audit-after-discard-restart',
      snapshot: repository.exportSnapshot(),
    })
    await restarted.discardEvidenceProcessingAtomically(command)
    expect(await restarted.claimNextEvidence(
      'worker-after-restart',
      '2026-08-21T04:20:00Z',
      '2026-08-21T04:11:00Z',
    )).toBeUndefined()
  })

  it('rejects discard on a stale claim or stale canonical settings fence without terminalizing evidence', async () => {
    const repository = createRepository()
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-before-rejected-discard',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 0,
      patch: { observeEnabled: true, learnEnabled: true },
      occurredAt: '2026-08-21T03:59:00Z',
    })
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'discard-worker',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const settings = await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-advance-before-rejected-discard',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 1,
      patch: { learnEnabled: false },
      occurredAt: '2026-08-21T04:00:30Z',
    })
    const command: DiscardEvidenceProcessing = {
      claim,
      expectedSettingsRevision: settings.revision,
      reasonCode: 'late-result-discarded',
      auditEventId: 'audit-valid-discard',
      occurredAt: '2026-08-21T04:01:00Z',
    }

    for (const claimPatch of [
      { workerId: 'wrong-worker' },
      { claimToken: 'wrong-claim-token' },
      { leaseVersion: claim.leaseVersion + 1 },
    ]) {
      await expect(repository.discardEvidenceProcessingAtomically({
        ...command,
        claim: { ...claim, ...claimPatch },
      })).rejects.toMatchObject({ code: 'STALE_CLAIM' })
    }
    await expect(repository.discardEvidenceProcessingAtomically({
      ...command,
      expectedSettingsRevision: settings.revision - 1,
    })).rejects.toEqual(new RevisionConflictError(
      settings.revision - 1,
      settings.revision,
    ))

    await repository.discardEvidenceProcessingAtomically(command)
    expect(await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })).toHaveLength(1)
  })

  it('rolls back terminal discard state, audit, and replay fence together', async () => {
    let fail = true
    const repository = new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'claim-token-discard-rollback',
      auditEventIdFactory: () => 'audit-discard-rollback-setup',
      failAt: (operation, step) => {
        if (fail && operation === 'discard-evidence' && step === 'before-commit') {
          fail = false
          throw new Error('rollback-discard')
        }
      },
    })
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-discard-rollback',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 0,
      patch: { observeEnabled: true, learnEnabled: true },
      occurredAt: '2026-08-21T03:59:00Z',
    })
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'discard-rollback-worker',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const command: DiscardEvidenceProcessing = {
      claim,
      expectedSettingsRevision: 1,
      reasonCode: 'late-result-discarded',
      auditEventId: 'audit-discard-rollback',
      occurredAt: '2026-08-21T04:01:00Z',
    }

    await expect(repository.discardEvidenceProcessingAtomically(command))
      .rejects.toThrow('rollback-discard')
    expect(await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })).toEqual([])

    await repository.discardEvidenceProcessingAtomically(command)
    expect(await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })).toHaveLength(1)
  })

  it('creates one strict content-free observer audit per inserted candidate and none on exact replay', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const claim = (await repository.claimNextEvidence('worker', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
    const command = {
      claim,
      expectedSettingsRevision: interactionEvidenceFixture.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-completion-audit-1', proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal, auditEventId: 'audit-candidate-proposed-1' }],
      auditEventId: 'audit-evidence-completed-1',
      occurredAt: '2026-08-21T04:01:30Z',
    } as const
    await repository.completeEvidenceProcessingAtomically(command)
    const [candidate] = await repository.listCandidates()
    expect(candidate?.revision).toBe(0)
    const proposed = await repository.listAuditEvents({
      identity: interactionEvidenceFixture.identity,
      kinds: ['candidate-proposed'],
    })
    expect(proposed).toEqual([{
      schemaVersion: 1,
      id: 'audit-candidate-proposed-1',
      identity: {
        userId: interactionEvidenceFixture.identity.userId,
        companionId: interactionEvidenceFixture.identity.companionId,
        relationshipId: interactionEvidenceFixture.identity.relationshipId,
      },
      actor: 'observer',
      kind: 'candidate-proposed',
      reasonCode: 'accepted',
      entity: { kind: 'candidate', candidateId: 'candidate-completion-audit-1' },
      occurredAt: command.occurredAt,
      revision: 0,
    }])
    await repository.completeEvidenceProcessingAtomically(command)
    expect(await repository.listAuditEvents({ identity: interactionEvidenceFixture.identity, kinds: ['candidate-proposed'] })).toEqual(proposed)
  })

  it('exports only the typed content-free completion replay projection', async () => {
    const repository = createRepository()
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const claim = (await repository.claimNextEvidence('worker-replay', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
    const command = {
      claim,
      expectedSettingsRevision: interactionEvidenceFixture.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-replay-private-id', proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal, auditEventId: 'audit-proposal-private-id' }],
      auditEventId: 'audit-completion-private-id',
      occurredAt: '2026-08-21T04:01:30Z',
    } as const
    await repository.completeEvidenceProcessingAtomically(command)
    const snapshot = repository.exportSnapshot() as unknown as InspectableSnapshot
    expect(Object.values(snapshot.state.completions)).toEqual([{
      evidenceId: interactionEvidenceFixture.id,
      workerId: 'worker-replay',
      claimToken: 'claim-token-from-test',
      leaseVersion: 1,
      expectedSettingsRevision: interactionEvidenceFixture.policySnapshot.settingsRevision,
      candidateIdempotencyDigests: [pendingCandidateProposalFixture.idempotencyKey.digest],
      occurredAt: command.occurredAt,
    }])
    const propertyNames = collectPropertyNames(snapshot.state.completions)
    for (const forbiddenName of [
      'candidateId', 'auditEventId', 'evidence', 'learningPayload', 'proposal',
      'userText', 'assistantText',
    ]) expect(propertyNames.has(forbiddenName)).toBe(false)
    const serialized = JSON.stringify(snapshot.state.completions)
    for (const forbiddenValue of [
      'candidate-replay-private-id', 'audit-proposal-private-id',
      'audit-completion-private-id', interactionEvidenceFixture.learningPayload.userText,
      interactionEvidenceFixture.learningPayload.assistantText!,
    ]) expect(serialized).not.toContain(forbiddenValue)

    await repository.completeEvidenceProcessingAtomically({
      ...command,
      auditEventId: 'different-excluded-completion-audit-id',
      candidates: [{ ...command.candidates[0], candidateId: 'different-excluded-candidate-id', auditEventId: 'different-excluded-proposal-audit-id' }],
    })
    expect(await repository.listCandidates()).toHaveLength(1)
  })

  it('deduplicates a candidate digest across evidence without emitting a false accepted proposal audit', async () => {
    const repository = createRepository()
    const firstEvidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    const secondEvidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    secondEvidence.id = 'evidence-second'
    secondEvidence.sourceRef = 'source-second'
    secondEvidence.occurredAt = '2026-08-21T04:00:01Z'
    await repository.ingestEvidenceAtomically(firstEvidence)
    await repository.ingestEvidenceAtomically(secondEvidence)
    const firstClaim = (await repository.claimNextEvidence('worker-first', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
    await repository.completeEvidenceProcessingAtomically({
      claim: firstClaim,
      expectedSettingsRevision: firstEvidence.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-original', proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal, auditEventId: 'audit-proposal-original' }],
      auditEventId: 'audit-completion-original', occurredAt: '2026-08-21T04:01:10Z',
    })
    const secondClaim = (await repository.claimNextEvidence('worker-second', '2026-08-21T04:03:00Z', '2026-08-21T04:01:20Z'))!
    await repository.completeEvidenceProcessingAtomically({
      claim: secondClaim,
      expectedSettingsRevision: secondEvidence.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-must-not-exist', proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal, auditEventId: 'audit-proposal-must-not-exist' }],
      auditEventId: 'audit-completion-second', occurredAt: '2026-08-21T04:01:30Z',
    })
    expect((await repository.listCandidates()).map((candidate) => candidate.id)).toEqual(['candidate-original'])
    const proposalAudits = await repository.listAuditEvents({ identity: firstEvidence.identity, kinds: ['candidate-proposed'] })
    expect(proposalAudits.map((event) => event.id)).toEqual(['audit-proposal-original'])
    expect(proposalAudits.some((event) => event.entity.kind === 'candidate' && event.entity.candidateId === 'candidate-must-not-exist')).toBe(false)
    expect((await repository.listAuditEvents({ identity: firstEvidence.identity, kinds: ['evidence-processing-completed'] })).map((event) => event.id)).toEqual(['audit-completion-original', 'audit-completion-second'])
  })

  it('filters audit queries and orders by plain lexical occurredAt then ID', async () => {
    const repository = createRepository()
    const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
    await repository.ingestEvidenceAtomically(evidence)
    const all = await repository.listAuditEvents({ identity: evidence.identity })
    const event = all[0]!
    expect(Object.keys(event.identity).sort()).toEqual(['companionId', 'relationshipId', 'userId'])
    expect(await repository.listAuditEvents({ identity: evidence.identity, actors: ['adapter'] })).toEqual(all)
    expect(await repository.listAuditEvents({ identity: evidence.identity, actors: ['user'] })).toEqual([])
    expect(await repository.listAuditEvents({ identity: evidence.identity, kinds: ['evidence-ingested'] })).toEqual(all)
    expect(await repository.listAuditEvents({ identity: evidence.identity, entity: event.entity })).toEqual(all)
    expect(await repository.listAuditEvents({ identity: { ...evidence.identity, userId: 'other-user' } })).toEqual([])
    expect(await repository.listAuditEvents({ identity: evidence.identity, occurredAtOrAfter: event.occurredAt })).toEqual(all)
    expect(await repository.listAuditEvents({ identity: evidence.identity, occurredBefore: event.occurredAt })).toEqual([])
    expect(await repository.listAuditEvents({ identity: evidence.identity, limit: 0 + 1 })).toEqual(all.slice(0, 1))
    expect(all).toEqual([...all].sort((a, b) => a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  })

  it('exposes actual ingest transaction boundaries before rollback', async () => {
    const observed: Array<{ step: string; evidence: number; audits: number; receipts: number }> = []
    let repository!: InMemoryPreferenceRepository
    repository = new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'claim-token',
      auditEventIdFactory: () => 'audit-ingest-boundary',
      failAt: (operation, step) => {
        if (operation !== 'ingest-evidence') return
        const snapshot = repository.exportSnapshot() as unknown as InspectableSnapshot
        observed.push({ step, evidence: Object.keys(snapshot.state.evidence).length, audits: snapshot.state.audits.length, receipts: Object.keys(snapshot.state.completions).length })
        if (step === 'before-commit') throw new Error('rollback-ingest')
      },
    })
    await expect(repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)).rejects.toThrow('rollback-ingest')
    expect(observed).toEqual([
      { step: 'after-state', evidence: 1, audits: 0, receipts: 0 },
      { step: 'after-audit', evidence: 1, audits: 1, receipts: 0 },
      { step: 'before-commit', evidence: 1, audits: 1, receipts: 0 },
    ])
    expect((repository.exportSnapshot() as unknown as InspectableSnapshot).state.evidence).toEqual({})
  })

  it('exposes completion state, audit, internal replay-fence, and commit boundaries before rollback', async () => {
    const observed: Array<{ step: string; candidates: number; audits: number; replays: number }> = []
    let enableFailure = false
    let repository!: InMemoryPreferenceRepository
    repository = new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'claim-token',
      auditEventIdFactory: () => 'audit-ingest',
      failAt: (operation, step) => {
        if (!enableFailure || operation !== 'complete-evidence') return
        const snapshot = repository.exportSnapshot() as unknown as InspectableSnapshot
        observed.push({ step, candidates: Object.keys(snapshot.state.candidates).length, audits: snapshot.state.audits.length, replays: Object.keys(snapshot.state.completions).length })
        if (step === 'before-commit') throw new Error('rollback-completion')
      },
    })
    await repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)
    const claim = (await repository.claimNextEvidence('worker', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
    enableFailure = true
    await expect(repository.completeEvidenceProcessingAtomically({
      claim,
      expectedSettingsRevision: interactionEvidenceFixture.policySnapshot.settingsRevision,
      candidates: [{ candidateId: 'candidate-boundary-1', proposal: structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal, auditEventId: 'audit-candidate-boundary-1' }],
      auditEventId: 'audit-completion-boundary-1',
      occurredAt: '2026-08-21T04:01:30Z',
    })).rejects.toThrow('rollback-completion')
    expect(observed).toEqual([
      { step: 'after-state', candidates: 1, audits: 1, replays: 0 },
      { step: 'after-audit', candidates: 1, audits: 3, replays: 0 },
      { step: 'after-receipt', candidates: 1, audits: 3, replays: 1 },
      { step: 'before-commit', candidates: 1, audits: 3, replays: 1 },
    ])
    const rolledBack = (repository.exportSnapshot() as unknown as InspectableSnapshot).state
    expect(rolledBack.candidates).toEqual({})
    expect(rolledBack.completions).toEqual({})
    expect(rolledBack.audits).toHaveLength(1)
  })

  it('rolls back state and audit when an injected atomic step fails', async () => {
    let shouldFail = true
    const repository = new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'claim-token',
      auditEventIdFactory: () => 'audit-event',
      failAt: (operation, step) => {
        if (shouldFail && operation === 'ingest-evidence' && step === 'after-audit') {
          shouldFail = false
          throw new Error('injected-failure')
        }
      },
    })
    await expect(repository.ingestEvidenceAtomically(structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence)).rejects.toThrow('injected-failure')
    expect(await repository.listEvidenceProvenance(structuredClone(identityContextFixture))).toEqual([])
    expect(await repository.listAuditEvents({ identity: structuredClone(identityContextFixture) })).toEqual([])
  })
})

/*
 * T5A oracle matrix frozen for the reusable suite completed in the next
 * high-tier packet: completion/candidate idempotency; revision fences and
 * active-slot supersession; governed mutation replay/conflict; suppression;
 * settings/projection/policy audit; deletion cascade; deterministic ordering;
 * and every atomic step's state+audit+receipt rollback.
 */
