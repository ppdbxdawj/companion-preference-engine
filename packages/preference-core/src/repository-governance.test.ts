import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  confirmCandidateCommandFixture, createExplicitPreferenceCommandFixture,
  deleteCandidateCommandFixture, identityContextFixture,
  interactionEvidenceFixture, pendingCandidateProposalFixture,
  preferenceIdentityFixture, proposeCandidateCommandFixture,
  rejectCandidateCommandFixture, revisePreferenceCommandFixture,
  revokePreferenceCommandFixture, suppressCandidateCommandFixture,
  MutationReceiptSchema, PreferenceCandidateSchema, PreferenceRecordSchema,
} from '@companion-preference/contracts'
import type {
  AuditEvent, ConfirmCandidateCommand, CreateExplicitPreferenceCommand, InteractionEvidence,
  PendingCandidateProposal, ProposeCandidateCommand, RejectCandidateCommand,
  RevisePreferenceCommand,
} from '@companion-preference/contracts'
import { InMemoryPreferenceRepository } from './in-memory-repository.js'
import {
  ActivePreferenceSlotOccupiedError,
  CandidateIdempotencyConflictError,
} from './repository.js'
import {
  InvalidTransitionError,
  RevisionConflictError,
} from './lifecycle.js'

type SnapshotState = {
  receipts: Record<string, Record<string, unknown>>
  audits: unknown[]
  candidates: Record<string, unknown>
  preferences: Record<string, unknown>
  replayResults?: unknown
}

const snapshotState = (repository: InMemoryPreferenceRepository) =>
  repository.exportSnapshot().state as SnapshotState

const expectValid = async (
  schema: typeof PreferenceCandidateSchema | typeof PreferenceRecordSchema,
  value: unknown,
) => {
  const result = await schema['~standard'].validate(value)
  expect(result).not.toHaveProperty('issues')
  expect(result).toMatchObject({ value })
}

const hasActionId = (actionId: string) => (event: AuditEvent) =>
  'actionId' in event && event.actionId === actionId

const expectContentFreeReceipt = (
  repository: InMemoryPreferenceRepository,
  actionId: string,
  mutation: string,
  result: Record<string, unknown>,
  recordedAt: string,
) => {
  const receipt = snapshotState(repository).receipts[actionId]
  expect(receipt).toEqual({
    actionId, mutation, payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    result, recordedAt,
  })
  expect(Object.keys(receipt!)).toEqual(['actionId', 'mutation', 'payloadHash', 'result', 'recordedAt'])
}

const createRepository = (snapshot?: ReturnType<InMemoryPreferenceRepository['exportSnapshot']>) => {
  let audit = 0
  return new InMemoryPreferenceRepository({
    claimTokenFactory: () => 'governance-claim-token',
    auditEventIdFactory: () => `governance-audit-${++audit}`,
    ...(snapshot ? { snapshot } : {}),
  })
}

const seedObserverCandidate = async (repository: InMemoryPreferenceRepository, candidateId = 'candidate-1') => {
  const evidence = structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence
  if (candidateId !== 'candidate-1') {
    evidence.id = `evidence-${candidateId}`
    evidence.sourceRef = `source-${candidateId}`
  }
  await repository.ingestEvidenceAtomically(evidence)
  const claim = (await repository.claimNextEvidence('worker', '2026-08-21T04:02:00Z', '2026-08-21T04:01:00Z'))!
  const proposal = structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal
  if (candidateId !== 'candidate-1') {
    proposal.idempotencyKey.digest = 'b'.repeat(64)
    proposal.evidenceIds = [evidence.id]
    if (proposal.provenance.kind === 'observer-evidence') proposal.provenance.evidenceIds = [evidence.id]
  }
  await repository.completeEvidenceProcessingAtomically({
    claim,
    expectedSettingsRevision: evidence.policySnapshot.settingsRevision,
    candidates: [{ candidateId, proposal, auditEventId: `audit-proposed-${candidateId}` }],
    auditEventId: `audit-completed-${candidateId}`,
    occurredAt: '2026-08-21T04:01:30Z',
  })
}

describe('PreferenceRepository T5B1 governance contract', () => {
  it('keeps the governed repository implementation reviewable', () => {
    const source = readFileSync(
      new URL('./in-memory-repository.ts', import.meta.url),
      'utf8',
    )
    const overlong = source.split('\n')
      .map((line, index) => ({ line: index + 1, length: line.length }))
      .filter(({ length }) => length > 180)
    expect(overlong).toEqual([])
  })

  it('proposes one external pending candidate with receipt replay and payload conflict across re-instantiation', async () => {
    const repository = createRepository()
    const command = structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand
    const created = await repository.proposeCandidateAtomically(command)
    expect(created).toMatchObject({ id: command.candidateId, status: 'pending_confirmation', revision: 0 })
    const replayed = await repository.proposeCandidateAtomically(structuredClone(command))
    expect(replayed).toEqual(created)
    expect(replayed).not.toBe(created)
    const restarted = createRepository(repository.exportSnapshot())
    expect(await restarted.proposeCandidateAtomically(command)).toEqual(created)
    await expect(restarted.proposeCandidateAtomically({ ...command, confidence: 0.1 })).rejects.toMatchObject({ code: 'action-payload-conflict' })
    const audits = await restarted.listAuditEvents({ identity: command.identity, kinds: ['candidate-proposed'] })
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ actor: 'user', kind: 'candidate-proposed', reasonCode: 'accepted', entity: { kind: 'candidate', candidateId: command.candidateId }, revision: 0, actionId: command.actionId })
    const serialized = JSON.stringify(repository.exportSnapshot())
    expectContentFreeReceipt(repository, command.actionId, 'propose-candidate', {
      kind: 'candidate', candidateId: created.id, revision: 0,
    }, command.occurredAt)
    for (const secret of ['requestPayload', 'proposerId', 'proposalRef', 'interaction.response_detail']) {
      expect(JSON.stringify(snapshotState(repository).receipts)).not.toContain(secret)
    }
    expect(serialized).not.toContain('requestPayload')
  })

  it('confirms atomically, and supersedes only with the typed active-record expectation', async () => {
    const repository = createRepository()
    await seedObserverCandidate(repository)
    const confirmed = await repository.confirmCandidateAtomically(structuredClone(confirmCandidateCommandFixture) as unknown as ConfirmCandidateCommand)
    expect(confirmed).toMatchObject({ id: confirmCandidateCommandFixture.preferenceId, status: 'active', authority: 'user-confirmed', revision: 1 })
    expect(await repository.getCandidate(confirmCandidateCommandFixture.candidateId)).toMatchObject({ status: 'confirmed', revision: 1 })
    expect((await repository.listActivePreferences(identityContextFixture)).map((record) => record.id)).toEqual([confirmed.id])

    await seedObserverCandidate(repository, 'candidate-replacement')
    const withoutExpectation = { ...structuredClone(confirmCandidateCommandFixture), actionId: 'action-confirm-replacement-missing-edge', candidateId: 'candidate-replacement', preferenceId: 'preference-replacement-missing-edge' } as unknown as ConfirmCandidateCommand
    await expect(repository.confirmCandidateAtomically(withoutExpectation)).rejects.toMatchObject({ code: 'ACTIVE_PREFERENCE_SLOT_OCCUPIED' })
    const replacement = await repository.confirmCandidateAtomically({
      ...withoutExpectation,
      actionId: 'action-confirm-replacement',
      preferenceId: 'preference-replacement',
      supersedesPreference: { preferenceId: confirmed.id, expectedRevision: confirmed.revision },
    })
    expect(await repository.getPreference(confirmed.id)).toMatchObject({ status: 'superseded', supersededBy: replacement.id, revision: 2 })
    expect(replacement).toMatchObject({ status: 'active', supersedes: confirmed.id, revision: 1 })
    const audits = await repository.listAuditEvents({ identity: preferenceIdentityFixture })
    expect(audits.filter(hasActionId(confirmCandidateCommandFixture.actionId))).toEqual([
      expect.objectContaining({ actor: 'user', kind: 'candidate-confirmed', reasonCode: 'accepted', entity: { kind: 'candidate', candidateId: 'candidate-1' }, revision: 1 }),
    ])
    expect(audits.filter(hasActionId('action-confirm-replacement'))).toEqual([
      expect.objectContaining({ actor: 'user', kind: 'candidate-confirmed', entity: { kind: 'candidate', candidateId: 'candidate-replacement' }, revision: 1 }),
      expect.objectContaining({ actor: 'user', kind: 'preference-revised', reasonCode: 'superseded', entity: { kind: 'preference', preferenceId: confirmed.id }, revision: 2 }),
      expect.objectContaining({ actor: 'user', kind: 'preference-revised', reasonCode: 'superseded', entity: { kind: 'preference', preferenceId: replacement.id }, revision: 1 }),
    ])
    const restarted = createRepository(repository.exportSnapshot())
    expect(await restarted.confirmCandidateAtomically({
      ...withoutExpectation, actionId: 'action-confirm-replacement', preferenceId: replacement.id,
      supersedesPreference: { preferenceId: confirmed.id, expectedRevision: confirmed.revision },
    })).toEqual(replacement)
  })

  it('rejects, deletes, and suppresses pending candidates with deterministic suppression listing', async () => {
    const operations = [
      ['reject', rejectCandidateCommandFixture],
      ['delete', deleteCandidateCommandFixture],
      ['suppress', suppressCandidateCommandFixture],
    ] as const
    for (const [operation, fixture] of operations) {
      const repository = createRepository()
      await seedObserverCandidate(repository)
      if (operation === 'reject') await repository.rejectCandidateAtomically(structuredClone(fixture))
      if (operation === 'delete') await repository.deleteCandidateAtomically(structuredClone(fixture))
      if (operation === 'suppress') await repository.suppressCandidateAtomically(structuredClone(fixture))
      expect(await repository.getCandidate('candidate-1')).toMatchObject({ status: operation === 'delete' ? 'deleted' : 'rejected', revision: 1 })
      if (operation === 'suppress') {
        const suppressions = await repository.listCandidateSuppressions(identityContextFixture)
        expect(suppressions).toHaveLength(1)
        expect(suppressions[0]).toMatchObject({ id: suppressCandidateCommandFixture.suppressionId, identity: preferenceIdentityFixture, preferenceKey: 'interaction.response_detail' })
      }
      const expectedAudit = operation === 'reject'
        ? { kind: 'candidate-rejected', reasonCode: rejectCandidateCommandFixture.reasonCode ?? 'user-requested' }
        : operation === 'delete'
          ? { kind: 'candidate-deleted', reasonCode: 'user-requested' }
          : { kind: 'candidate-suppressed', reasonCode: 'do-not-suggest-again' }
      expect((await repository.listAuditEvents({ identity: preferenceIdentityFixture }))
        .filter(hasActionId(fixture.actionId))).toEqual([
        expect.objectContaining({ actor: 'user', ...expectedAudit, entity: { kind: 'candidate', candidateId: 'candidate-1' }, revision: 1 }),
      ])
      const restarted = createRepository(repository.exportSnapshot())
      if (operation === 'reject') await expect(restarted.rejectCandidateAtomically(structuredClone(fixture))).resolves.toBeUndefined()
      if (operation === 'delete') await expect(restarted.deleteCandidateAtomically(structuredClone(fixture))).resolves.toBeUndefined()
      if (operation === 'suppress') await expect(restarted.suppressCandidateAtomically(structuredClone(fixture))).resolves.toBeUndefined()
      expect((await restarted.listAuditEvents({ identity: preferenceIdentityFixture })).filter(hasActionId(fixture.actionId))).toHaveLength(1)
    }
  })

  it('creates explicitly only in an empty slot and conflicts without overwriting an occupied slot', async () => {
    const repository = createRepository()
    const command = structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand
    const created = await repository.createExplicitPreferenceAtomically(command)
    expect(created).toMatchObject({ id: command.preferenceId, authority: 'user-set', status: 'active', revision: 1 })
    await expect(repository.createExplicitPreferenceAtomically({ ...command, actionId: 'action-create-occupied', preferenceId: 'preference-must-not-overwrite' })).rejects.toMatchObject({ code: 'ACTIVE_PREFERENCE_SLOT_OCCUPIED' })
    expect((await repository.listActivePreferences(identityContextFixture)).map((record) => record.id)).toEqual([created.id])
    expect((await repository.listAuditEvents({ identity: preferenceIdentityFixture })).filter(hasActionId(command.actionId))).toEqual([
      expect.objectContaining({ actor: 'user', kind: 'preference-created', reasonCode: 'accepted', entity: { kind: 'preference', preferenceId: created.id }, revision: 1 }),
    ])
    expect(await createRepository(repository.exportSnapshot()).createExplicitPreferenceAtomically(command)).toEqual(created)
  })

  it('revises through a linked supersession edge, revokes, and excludes inactive records', async () => {
    const repository = createRepository()
    const created = await repository.createExplicitPreferenceAtomically(structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand)
    const revise = { ...structuredClone(revisePreferenceCommandFixture), preferenceId: created.id, expectedPreferenceRevision: created.revision } as unknown as RevisePreferenceCommand
    const replacement = await repository.revisePreferenceAtomically(revise)
    expect(await repository.getPreference(created.id)).toMatchObject({ status: 'superseded', supersededBy: replacement.id, revision: 2 })
    expect(replacement).toMatchObject({ status: 'active', supersedes: created.id, revision: 1 })
    const revoked = await repository.revokePreferenceAtomically({ ...structuredClone(revokePreferenceCommandFixture), preferenceId: replacement.id, expectedPreferenceRevision: replacement.revision })
    expect(revoked).toMatchObject({ status: 'revoked', revision: 2 })
    expect(await repository.listActivePreferences(identityContextFixture)).toEqual([])
    const audits = await repository.listAuditEvents({ identity: preferenceIdentityFixture })
    expect(audits.filter(hasActionId(revise.actionId))).toEqual([
      expect.objectContaining({ kind: 'preference-revised', entity: { kind: 'preference', preferenceId: created.id }, revision: 2 }),
      expect.objectContaining({ kind: 'preference-revised', entity: { kind: 'preference', preferenceId: replacement.id }, revision: 1 }),
    ])
    expect(audits.filter(hasActionId(revokePreferenceCommandFixture.actionId))).toEqual([
      expect.objectContaining({ kind: 'preference-revoked', reasonCode: 'user-requested', entity: { kind: 'preference', preferenceId: replacement.id }, revision: 2 }),
    ])
  })

  it('returns clone-isolated, deterministically ordered candidate and preference lists', async () => {
    const repository = createRepository()
    const first = await repository.proposeCandidateAtomically(structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand)
    const secondCommand = { ...structuredClone(proposeCandidateCommandFixture), actionId: 'action-propose-2', candidateId: 'candidate-external-0', provenance: { ...proposeCandidateCommandFixture.provenance, proposalRef: 'proposal-2' }, idempotencyKey: { ...proposeCandidateCommandFixture.idempotencyKey, digest: '1'.repeat(64) } } as unknown as ProposeCandidateCommand
    const second = await repository.proposeCandidateAtomically(secondCommand)
    const listed = await repository.listCandidates('pending_confirmation')
    expect(listed.map((candidate) => candidate.id)).toEqual([second.id, first.id].sort())
    listed[0]!.evidenceIds.push('outside-mutation')
    expect((await repository.listCandidates()).some((candidate) => candidate.evidenceIds.includes('outside-mutation'))).toBe(false)
    secondCommand.evidenceIds.push('late-input-mutation')
    second.evidenceIds.push('late-result-mutation')
    expect((await repository.getCandidate(second.id))!.evidenceIds).not.toContain('late-input-mutation')
    expect((await repository.getCandidate(second.id))!.evidenceIds).not.toContain('late-result-mutation')
  })

  it('persists and returns only strict candidate and preference records', async () => {
    const repository = createRepository()
    const proposed = await repository.proposeCandidateAtomically(
      structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand,
    )
    await expectValid(PreferenceCandidateSchema, proposed)
    expect(proposed).not.toHaveProperty('actionId')
    expect(proposed).not.toHaveProperty('candidateId')
    expect(proposed).not.toHaveProperty('occurredAt')

    const explicit = await repository.createExplicitPreferenceAtomically(
      structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand,
    )
    await expectValid(PreferenceRecordSchema, explicit)

    const lifecycleRepository = createRepository()
    await seedObserverCandidate(lifecycleRepository)
    const confirmed = await lifecycleRepository.confirmCandidateAtomically(
      structuredClone(confirmCandidateCommandFixture) as unknown as ConfirmCandidateCommand,
    )
    await expectValid(PreferenceRecordSchema, confirmed)
    const revised = await lifecycleRepository.revisePreferenceAtomically({
      ...structuredClone(revisePreferenceCommandFixture),
      preferenceId: confirmed.id,
      expectedPreferenceRevision: confirmed.revision,
    } as unknown as RevisePreferenceCommand)
    await expectValid(PreferenceRecordSchema, revised)
    const revoked = await lifecycleRepository.revokePreferenceAtomically({
      ...structuredClone(revokePreferenceCommandFixture),
      preferenceId: revised.id,
      expectedPreferenceRevision: revised.revision,
    })
    await expectValid(PreferenceRecordSchema, revoked)
    for (const candidate of await repository.listCandidates()) {
      await expectValid(PreferenceCandidateSchema, candidate)
    }
    for (const preference of await repository.listActivePreferences(identityContextFixture)) {
      await expectValid(PreferenceRecordSchema, preference)
    }
    const state = snapshotState(repository)
    for (const candidate of Object.values(state.candidates)) {
      await expectValid(PreferenceCandidateSchema, candidate)
    }
    for (const preference of Object.values(state.preferences)) {
      await expectValid(PreferenceRecordSchema, preference)
    }
    const lifecycleState = snapshotState(lifecycleRepository)
    for (const candidate of Object.values(lifecycleState.candidates)) {
      await expectValid(PreferenceCandidateSchema, candidate)
    }
    for (const preference of Object.values(lifecycleState.preferences)) {
      await expectValid(PreferenceRecordSchema, preference)
    }
  })

  it('treats a candidate digest as repository-wide proposal idempotency', async () => {
    const repository = createRepository()
    const firstCommand = structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand
    const first = await repository.proposeCandidateAtomically(firstCommand)
    const sameProposalNewEnvelope = {
      ...structuredClone(firstCommand),
      actionId: 'action-same-proposal-new-envelope',
      candidateId: 'candidate-id-must-not-replace-stored-id',
      occurredAt: '2026-08-21T05:59:59Z',
    }
    const replayed = await repository.proposeCandidateAtomically(sameProposalNewEnvelope)
    expect(replayed).toEqual(first)
    expect(replayed).not.toBe(first)
    expect((await repository.listCandidates()).map((candidate) => candidate.id)).toEqual([first.id])

    const conflicting = {
      ...sameProposalNewEnvelope,
      actionId: 'action-same-digest-different-proposal',
      confidence: firstCommand.confidence / 2,
    }
    await expect(repository.proposeCandidateAtomically(conflicting)).rejects.toBeInstanceOf(
      CandidateIdempotencyConflictError,
    )
  })

  it('replays the exact result of a same-digest proposal sent in a new envelope', async () => {
    const repository = createRepository()
    const firstCommand = structuredClone(
      proposeCandidateCommandFixture,
    ) as unknown as ProposeCandidateCommand
    const first = await repository.proposeCandidateAtomically(firstCommand)
    const newEnvelope = {
      ...structuredClone(firstCommand),
      actionId: 'action-same-digest-new-envelope-exact-replay',
      candidateId: 'candidate-id-ignored-by-digest-idempotency',
      occurredAt: '2026-08-21T05:59:59Z',
    }
    const originalResult = await repository.proposeCandidateAtomically(newEnvelope)
    expect(originalResult).toEqual(first)

    const restarted = createRepository(repository.exportSnapshot())
    const replayed = await restarted.proposeCandidateAtomically(newEnvelope)
    expect(replayed).toEqual(originalResult)
  })

  it('keeps persisted replay metadata content-free while replaying exact historical results', async () => {
    const repository = createRepository()
    const create = structuredClone(
      createExplicitPreferenceCommandFixture,
    ) as unknown as CreateExplicitPreferenceCommand
    const original = await repository.createExplicitPreferenceAtomically(create)
    await repository.revisePreferenceAtomically({
      ...structuredClone(revisePreferenceCommandFixture),
      preferenceId: original.id,
      expectedPreferenceRevision: original.revision,
    } as unknown as RevisePreferenceCommand)

    const restarted = createRepository(repository.exportSnapshot())
    const replayed = await restarted.createExplicitPreferenceAtomically(create)
    expect(replayed).toEqual(original)
    expect(replayed).not.toBe(original)
    expect(replayed).toMatchObject({ status: 'active', revision: 1 })
    const state = snapshotState(restarted)
    expect(state).not.toHaveProperty('replayResults')
    for (const receipt of Object.values(state.receipts)) {
      const validation = await MutationReceiptSchema['~standard'].validate(receipt)
      expect(validation).not.toHaveProperty('issues')
      expect(validation).toMatchObject({ value: receipt })
    }
    const serializedReceipts = JSON.stringify(state.receipts)
    for (const forbidden of [
      '"preference":', '"value":', '"scope":', '"projection":',
      '"evidenceIds":', '"provenance":', '"proposalRef":',
      '"allowedHosts":', '"allowedDomains":', '"workspaceId":', '"claimToken":',
      'requestPayload', 'governance-claim-token', 'interaction.response_detail',
      'concise', 'detailed', 'workspace-1', 'reference-host', 'evidence-1',
      '"work"', '"airi"',
    ]) {
      expect(serializedReceipts).not.toContain(forbidden)
    }
  })

  it('requires pending candidates before revision checks for every terminal action', async () => {
    const terminalCases = [
      ['reject', rejectCandidateCommandFixture],
      ['delete', deleteCandidateCommandFixture],
      ['suppress', suppressCandidateCommandFixture],
    ] as const
    for (const [kind, command] of terminalCases) {
      const repository = createRepository()
      await seedObserverCandidate(repository)
      if (kind === 'reject') await repository.rejectCandidateAtomically(structuredClone(command))
      if (kind === 'delete') await repository.deleteCandidateAtomically(structuredClone(command))
      if (kind === 'suppress') await repository.suppressCandidateAtomically(structuredClone(command))
      const repeat = {
        ...structuredClone(command),
        actionId: `action-${kind}-terminal-repeat`,
        expectedCandidateRevision: 0,
      }
      await expect(
        kind === 'reject'
          ? repository.rejectCandidateAtomically(repeat)
          : kind === 'delete'
            ? repository.deleteCandidateAtomically(repeat as typeof deleteCandidateCommandFixture)
            : repository.suppressCandidateAtomically(repeat as typeof suppressCandidateCommandFixture),
      ).rejects.toMatchObject({
        name: InvalidTransitionError.name,
        code: 'candidate-not-pending',
      })
    }

    const repository = createRepository()
    await seedObserverCandidate(repository)
    await repository.rejectCandidateAtomically(structuredClone(rejectCandidateCommandFixture))
    await expect(repository.confirmCandidateAtomically({
      ...structuredClone(confirmCandidateCommandFixture),
      actionId: 'action-confirm-terminal',
      expectedCandidateRevision: 0,
    } as unknown as ConfirmCandidateCommand)).rejects.toMatchObject({
      name: InvalidTransitionError.name,
      code: 'candidate-not-pending',
    })
  })

  it('uses typed slot and revision errors with frozen precedence', async () => {
    const repository = createRepository()
    const created = await repository.createExplicitPreferenceAtomically(
      structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand,
    )
    await expect(repository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      actionId: 'action-typed-slot-conflict',
      preferenceId: 'preference-typed-slot-conflict',
    } as unknown as CreateExplicitPreferenceCommand)).rejects.toBeInstanceOf(
      ActivePreferenceSlotOccupiedError,
    )
    await expect(repository.revokePreferenceAtomically({
      ...structuredClone(revokePreferenceCommandFixture),
      actionId: 'action-typed-revision-conflict',
      preferenceId: created.id,
      expectedPreferenceRevision: created.revision + 1,
    })).rejects.toBeInstanceOf(RevisionConflictError)
  })

  it('requires a supplied confirmation supersession fence to identify a current active slot', async () => {
    const repository = createRepository()
    await seedObserverCandidate(repository)
    await expect(repository.confirmCandidateAtomically({
      ...structuredClone(confirmCandidateCommandFixture),
      actionId: 'action-dangling-supersession',
      supersedesPreference: { preferenceId: 'preference-not-active', expectedRevision: 1 },
    } as unknown as ConfirmCandidateCommand)).rejects.toBeInstanceOf(
      ActivePreferenceSlotOccupiedError,
    )
  })

  it('sets exact supersession timestamps and expiry lineage on confirmation and revision', async () => {
    const repository = createRepository()
    const oldExpiry = '2026-09-01T00:00:00Z'
    const created = await repository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      expiresAt: oldExpiry,
    } as unknown as CreateExplicitPreferenceCommand)
    const candidateExpiry = '2026-09-15T00:00:00Z'
    const expiringCandidate = await repository.proposeCandidateAtomically({
      ...structuredClone(proposeCandidateCommandFixture),
      actionId: 'action-propose-expiring-candidate',
      candidateId: 'candidate-expiring-lineage',
      idempotencyKey: { ...proposeCandidateCommandFixture.idempotencyKey, digest: '3'.repeat(64) },
      expiresAt: candidateExpiry,
    } as unknown as ProposeCandidateCommand)
    const confirmation = {
      ...structuredClone(confirmCandidateCommandFixture),
      actionId: 'action-confirm-expiry-lineage',
      candidateId: expiringCandidate.id,
      preferenceId: 'preference-confirm-expiry-lineage',
      supersedesPreference: { preferenceId: created.id, expectedRevision: created.revision },
    } as unknown as ConfirmCandidateCommand
    const confirmed = await repository.confirmCandidateAtomically(confirmation)
    expect(await repository.getPreference(created.id)).toMatchObject({
      updatedAt: confirmation.occurredAt,
      status: 'superseded',
      revision: 2,
      supersededBy: confirmed.id,
    })
    expect(confirmed.expiresAt).toBe(candidateExpiry)

    const replacementExpiry = '2026-10-01T00:00:00Z'
    const revised = await repository.revisePreferenceAtomically({
      ...structuredClone(revisePreferenceCommandFixture),
      actionId: 'action-revise-expiry-lineage',
      preferenceId: confirmed.id,
      expectedPreferenceRevision: confirmed.revision,
      replacementPreferenceId: 'preference-revised-expiry-lineage',
      expiresAt: replacementExpiry,
    } as unknown as RevisePreferenceCommand)
    expect(await repository.getPreference(confirmed.id)).toMatchObject({
      updatedAt: revisePreferenceCommandFixture.occurredAt,
      status: 'superseded',
      supersededBy: revised.id,
    })
    expect(revised.expiresAt).toBe(replacementExpiry)

    const withoutExpiryRepository = createRepository()
    const expiring = await withoutExpiryRepository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      expiresAt: oldExpiry,
    } as unknown as CreateExplicitPreferenceCommand)
    const withoutExpiry = await withoutExpiryRepository.revisePreferenceAtomically({
      ...structuredClone(revisePreferenceCommandFixture),
      preferenceId: expiring.id,
      expectedPreferenceRevision: expiring.revision,
      expiresAt: undefined,
    } as unknown as RevisePreferenceCommand)
    expect(withoutExpiry).not.toHaveProperty('expiresAt')
  })

  it('never overwrites records when candidate or preference IDs collide', async () => {
    const repository = createRepository()
    const firstCandidate = await repository.proposeCandidateAtomically(
      structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand,
    )
    await expect(repository.proposeCandidateAtomically({
      ...structuredClone(proposeCandidateCommandFixture),
      actionId: 'action-candidate-id-collision',
      idempotencyKey: { ...proposeCandidateCommandFixture.idempotencyKey, digest: '2'.repeat(64) },
      confidence: proposeCandidateCommandFixture.confidence / 2,
    } as unknown as ProposeCandidateCommand)).rejects.toBeInstanceOf(
      CandidateIdempotencyConflictError,
    )
    expect(await repository.getCandidate(firstCandidate.id)).toEqual(firstCandidate)

    const firstPreference = await repository.createExplicitPreferenceAtomically(
      structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand,
    )
    await expect(repository.confirmCandidateAtomically({
      ...structuredClone(confirmCandidateCommandFixture),
      actionId: 'action-preference-id-collision',
      candidateId: firstCandidate.id,
      preferenceId: firstPreference.id,
      scope: { kind: 'domain', domain: 'coding' },
    } as unknown as ConfirmCandidateCommand)).rejects.toBeInstanceOf(
      ActivePreferenceSlotOccupiedError,
    )
    expect(await repository.getPreference(firstPreference.id)).toEqual(firstPreference)
  })

  it('rejects explicit preference ID reuse without mutating an inactive record', async () => {
    const repository = createRepository()
    const created = await repository.createExplicitPreferenceAtomically(
      structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand,
    )
    await repository.revokePreferenceAtomically({
      ...structuredClone(revokePreferenceCommandFixture),
      actionId: 'action-revoke-before-id-collision',
      preferenceId: created.id,
      expectedPreferenceRevision: created.revision,
    })
    const before = repository.exportSnapshot()

    await expect(repository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      actionId: 'action-explicit-inactive-id-collision',
      preferenceId: created.id,
      preference: { key: 'interaction.directness', value: 'direct' },
      scope: { kind: 'global' },
    } as unknown as CreateExplicitPreferenceCommand)).rejects.toBeInstanceOf(
      ActivePreferenceSlotOccupiedError,
    )

    expect(repository.exportSnapshot()).toEqual(before)
    expect(await repository.getPreference(created.id)).toEqual(
      (before.state as SnapshotState).preferences[created.id],
    )
  })

  it('canonicalizes absent and explicitly undefined optional fields identically', async () => {
    const repository = createRepository()
    await seedObserverCandidate(repository)
    const command = {
      actionId: rejectCandidateCommandFixture.actionId,
      candidateId: rejectCandidateCommandFixture.candidateId,
      expectedCandidateRevision: rejectCandidateCommandFixture.expectedCandidateRevision,
      occurredAt: rejectCandidateCommandFixture.occurredAt,
    } satisfies RejectCandidateCommand
    await repository.rejectCandidateAtomically(command)
    const restarted = createRepository(repository.exportSnapshot())
    await expect(restarted.rejectCandidateAtomically({
      ...command,
      reasonCode: undefined,
    } as unknown as RejectCandidateCommand)).resolves.toBeUndefined()
  })

  it('invokes real state/audit/receipt/commit boundaries and rolls back every T5B1 mutation', async () => {
    const cases = [
      { operation: 'propose-candidate', prepare: async () => {}, run: (r: InMemoryPreferenceRepository) => r.proposeCandidateAtomically(structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand) },
      { operation: 'confirm-candidate', prepare: seedObserverCandidate, run: (r: InMemoryPreferenceRepository) => r.confirmCandidateAtomically(structuredClone(confirmCandidateCommandFixture) as unknown as ConfirmCandidateCommand) },
      { operation: 'reject-candidate', prepare: seedObserverCandidate, run: (r: InMemoryPreferenceRepository) => r.rejectCandidateAtomically(structuredClone(rejectCandidateCommandFixture)) },
      { operation: 'delete-candidate', prepare: seedObserverCandidate, run: (r: InMemoryPreferenceRepository) => r.deleteCandidateAtomically(structuredClone(deleteCandidateCommandFixture)) },
      { operation: 'suppress-candidate', prepare: seedObserverCandidate, run: (r: InMemoryPreferenceRepository) => r.suppressCandidateAtomically(structuredClone(suppressCandidateCommandFixture)) },
      { operation: 'create-explicit-preference', prepare: async () => {}, run: (r: InMemoryPreferenceRepository) => r.createExplicitPreferenceAtomically(structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand) },
      { operation: 'revise-preference', prepare: async (r: InMemoryPreferenceRepository) => { await r.createExplicitPreferenceAtomically(structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand) }, run: (r: InMemoryPreferenceRepository) => r.revisePreferenceAtomically({ ...structuredClone(revisePreferenceCommandFixture), preferenceId: createExplicitPreferenceCommandFixture.preferenceId } as unknown as RevisePreferenceCommand) },
      { operation: 'revoke-preference', prepare: async (r: InMemoryPreferenceRepository) => { await r.createExplicitPreferenceAtomically(structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand) }, run: (r: InMemoryPreferenceRepository) => r.revokePreferenceAtomically({ ...structuredClone(revokePreferenceCommandFixture), preferenceId: createExplicitPreferenceCommandFixture.preferenceId }) },
    ] as const
    for (const item of cases) {
      for (const injectedStep of ['after-state', 'after-audit', 'after-receipt', 'before-commit'] as const) {
        const steps: string[] = []
        const observations: Array<{ step: string; audits: number; receipts: number; changed: boolean }> = []
        let inject = false
        let before: ReturnType<InMemoryPreferenceRepository['exportSnapshot']>
        const repository = new InMemoryPreferenceRepository({
          claimTokenFactory: () => 'boundary-token',
          auditEventIdFactory: () => 'boundary-audit',
          failAt: (operation, step) => {
            if (!inject || operation !== item.operation) return
            steps.push(step)
            const current = repository.exportSnapshot()
            const state = current.state as SnapshotState
            observations.push({
              step, audits: state.audits.length,
              receipts: Object.keys(state.receipts).length,
              changed: JSON.stringify(current) !== JSON.stringify(before),
            })
            if (step === injectedStep) throw new Error(`rollback-${operation}-${step}`)
          },
        })
        await item.prepare(repository)
        before = repository.exportSnapshot()
        const beforeState = before.state as SnapshotState
        inject = true
        await expect(item.run(repository)).rejects.toThrow(`rollback-${item.operation}-${injectedStep}`)
        expect(steps).toEqual(['after-state', 'after-audit', 'after-receipt', 'before-commit'].slice(0, ['after-state', 'after-audit', 'after-receipt', 'before-commit'].indexOf(injectedStep) + 1))
        for (const observation of observations) {
          expect(observation.changed).toBe(true)
          expect(observation.receipts).toBe(Object.keys(beforeState.receipts).length + (observation.step === 'after-state' || observation.step === 'after-audit' ? 0 : 1))
          expect(observation.audits).toBe(beforeState.audits.length + (observation.step === 'after-state' ? 0 : item.operation === 'revise-preference' ? 2 : 1))
        }
        expect(repository.exportSnapshot()).toEqual(before)
      }
    }
  })
})
