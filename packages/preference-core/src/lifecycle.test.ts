import { describe, expect, it } from 'vitest'

import {
  ActionPayloadConflictError,
  ActionReplayConflictError,
  applyCandidateAction,
  InvalidTransitionError,
  RevisionConflictError,
  revokePreference,
  supersedePreference,
  type CandidateAction,
  type CandidateActionReplay,
} from './lifecycle.js'
import {
  activePreferenceRecordFixture,
  confirmCandidateActionFixture,
  preferenceCandidateFixture,
  preferenceReplacementFixture,
  rejectCandidateActionFixture,
  revokePreferenceActionFixture,
  supersedePreferenceActionFixture,
} from './lifecycle.fixtures.js'

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  for (const nested of Object.values(value)) expectDeeplyFrozen(nested)
}

function expectTransitionCode(run: () => unknown, code: string): void {
  try {
    run()
    throw new Error('Expected transition error')
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidTransitionError)
    expect(error).toMatchObject({ code })
  }
}

describe('applyCandidateAction', () => {
  it('requires an explicit user confirmation before creating an active preference', () => {
    const execution = applyCandidateAction(
      preferenceCandidateFixture,
      confirmCandidateActionFixture,
    )

    expect(execution.result.kind).toBe('confirmed')
    if (execution.result.kind !== 'confirmed') throw new Error('unreachable')
    expect(execution.result.candidate).toMatchObject({
      status: 'confirmed',
      revision: 1,
      updatedAt: confirmCandidateActionFixture.occurredAt,
    })
    expect(execution.result.preference).toMatchObject({
      id: confirmCandidateActionFixture.preferenceId,
      identity: preferenceCandidateFixture.identity,
      preference: confirmCandidateActionFixture.preference,
      scope: confirmCandidateActionFixture.scope,
      projection: confirmCandidateActionFixture.projection,
      authority: 'user-confirmed',
      status: 'active',
      revision: 1,
      evidenceIds: preferenceCandidateFixture.evidenceIds,
      createdAt: confirmCandidateActionFixture.occurredAt,
      updatedAt: confirmCandidateActionFixture.occurredAt,
    })
    expect(execution.result.auditEvent).toEqual({
      schemaVersion: 1,
      id: confirmCandidateActionFixture.auditEventId,
      identity: preferenceCandidateFixture.identity,
      actor: 'user',
      kind: 'candidate-confirmed',
      reasonCode: 'accepted',
      entity: { kind: 'candidate', candidateId: preferenceCandidateFixture.id },
      occurredAt: confirmCandidateActionFixture.occurredAt,
      actionId: confirmCandidateActionFixture.actionId,
      revision: 1,
    })
  })

  it('rejects a pending candidate without producing a preference', () => {
    const execution = applyCandidateAction(
      preferenceCandidateFixture,
      rejectCandidateActionFixture,
    )

    expect(execution.result).toMatchObject({
      kind: 'rejected',
      candidate: {
        status: 'rejected',
        revision: 1,
        updatedAt: rejectCandidateActionFixture.occurredAt,
      },
      auditEvent: {
        id: rejectCandidateActionFixture.auditEventId,
        actor: 'user',
        kind: 'candidate-rejected',
        reasonCode: 'not-a-preference',
        actionId: rejectCandidateActionFixture.actionId,
        revision: 1,
      },
    })
    expect('preference' in execution.result).toBe(false)
  })

  it.each(['confirmed', 'rejected', 'superseded', 'deleted'] as const)(
    'rejects an action from terminal candidate status %s',
    (status) => {
      expect(() =>
        applyCandidateAction(
          { ...preferenceCandidateFixture, status },
          confirmCandidateActionFixture,
        ),
      ).toThrowError(InvalidTransitionError)
    },
  )

  it('enforces the expected candidate revision fence', () => {
    expect(() =>
      applyCandidateAction(preferenceCandidateFixture, {
        ...confirmCandidateActionFixture,
        expectedCandidateRevision: 9,
      }),
    ).toThrowError(RevisionConflictError)
    expect(() =>
      applyCandidateAction(preferenceCandidateFixture, {
        ...confirmCandidateActionFixture,
        candidateId: 'candidate-other',
      }),
    ).toThrowError(InvalidTransitionError)
  })

  it('prohibits Observer authority even for a structurally cast action', () => {
    const observerAction = {
      ...confirmCandidateActionFixture,
      actor: 'observer',
    } as unknown as CandidateAction
    expect(() =>
      applyCandidateAction(preferenceCandidateFixture, observerAction),
    ).toThrowError(InvalidTransitionError)
  })

  it('replays an identical action exactly and conflicts on changed payload', () => {
    const first = applyCandidateAction(
      preferenceCandidateFixture,
      confirmCandidateActionFixture,
    )
    const prior: CandidateActionReplay = first
    const replay = applyCandidateAction(
      structuredClone(preferenceCandidateFixture),
      { ...confirmCandidateActionFixture },
      prior,
    )
    expect(replay).toBe(first)

    expect(() =>
      applyCandidateAction(
        preferenceCandidateFixture,
        { ...confirmCandidateActionFixture, preferenceId: 'preference-other' },
        prior,
      ),
    ).toThrowError(ActionReplayConflictError)

    expect(() =>
      applyCandidateAction(
        {
          ...preferenceCandidateFixture,
          identity: {
            ...preferenceCandidateFixture.identity,
            relationshipId: 'relationship-changed',
          },
        },
        confirmCandidateActionFixture,
        prior,
      ),
    ).toThrowError(ActionPayloadConflictError)
  })
})

describe('revokePreference', () => {
  it('revokes one active record with one content-free audit event', () => {
    const execution = revokePreference(
      activePreferenceRecordFixture,
      revokePreferenceActionFixture,
    )
    expect(execution.result.preference).toMatchObject({
      status: 'revoked',
      revision: 2,
      updatedAt: revokePreferenceActionFixture.occurredAt,
    })
    expect(execution.result.preference).not.toHaveProperty('supersedes')
    expect(execution.result.auditEvent).toEqual({
      schemaVersion: 1,
      id: revokePreferenceActionFixture.auditEventId,
      identity: activePreferenceRecordFixture.identity,
      actor: 'user',
      kind: 'preference-revoked',
      reasonCode: 'user-requested',
      entity: {
        kind: 'preference',
        preferenceId: activePreferenceRecordFixture.id,
      },
      occurredAt: revokePreferenceActionFixture.occurredAt,
      actionId: revokePreferenceActionFixture.actionId,
      revision: 2,
    })
    expectDeeplyFrozen(execution)
  })

  it.each(['superseded', 'revoked', 'deleted'] as const)(
    'rejects revocation from terminal preference status %s',
    (status) => {
      expect(() =>
        revokePreference(
          {
            ...activePreferenceRecordFixture,
            status,
            ...(status === 'superseded'
              ? { supersededBy: 'preference-other' }
              : {}),
          },
          revokePreferenceActionFixture,
        ),
      ).toThrowError(InvalidTransitionError)
    },
  )

  it('enforces its revision fence and replay payload identity', () => {
    expect(() =>
      revokePreference(activePreferenceRecordFixture, {
        ...revokePreferenceActionFixture,
        expectedPreferenceRevision: 9,
      }),
    ).toThrowError(RevisionConflictError)
    expect(() =>
      revokePreference(activePreferenceRecordFixture, {
        ...revokePreferenceActionFixture,
        preferenceId: 'preference-other',
      }),
    ).toThrowError(InvalidTransitionError)

    const first = revokePreference(
      activePreferenceRecordFixture,
      revokePreferenceActionFixture,
    )
    expect(
      revokePreference(
        structuredClone(activePreferenceRecordFixture),
        { ...revokePreferenceActionFixture },
        first,
      ),
    ).toBe(first)
    expect(() =>
      revokePreference(
        activePreferenceRecordFixture,
        { ...revokePreferenceActionFixture, auditEventId: 'audit-changed' },
        first,
      ),
    ).toThrowError(ActionReplayConflictError)
    expect(() =>
      revokePreference(
        {
          ...activePreferenceRecordFixture,
          scope: { kind: 'global' },
        },
        revokePreferenceActionFixture,
        first,
      ),
    ).toThrowError(ActionPayloadConflictError)
  })

  it('rejects non-user authority at runtime', () => {
    expect(() =>
      revokePreference(
        activePreferenceRecordFixture,
        {
          ...revokePreferenceActionFixture,
          actor: 'observer',
        } as unknown as typeof revokePreferenceActionFixture,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'actor-not-authorized' }),
    )
  })
})

describe('supersedePreference', () => {
  it('supersedes the old record and creates one active lineage replacement', () => {
    const execution = supersedePreference(
      activePreferenceRecordFixture,
      preferenceReplacementFixture,
      supersedePreferenceActionFixture,
    )
    expect(execution.result.previous).toMatchObject({
      id: activePreferenceRecordFixture.id,
      status: 'superseded',
      revision: 2,
      supersededBy: preferenceReplacementFixture.id,
      updatedAt: supersedePreferenceActionFixture.occurredAt,
    })
    expect(execution.result.replacement).toMatchObject({
      schemaVersion: 1,
      id: preferenceReplacementFixture.id,
      identity: activePreferenceRecordFixture.identity,
      status: 'active',
      revision: 1,
      supersedes: activePreferenceRecordFixture.id,
      createdAt: supersedePreferenceActionFixture.occurredAt,
      updatedAt: supersedePreferenceActionFixture.occurredAt,
    })
    expect(execution.result.auditEvents).toHaveLength(2)
    expect(execution.result.auditEvents).toEqual([
      expect.objectContaining({
        id: supersedePreferenceActionFixture.previousAuditEventId,
        actionId: supersedePreferenceActionFixture.actionId,
        kind: 'preference-revised',
        reasonCode: 'superseded',
        entity: {
          kind: 'preference',
          preferenceId: activePreferenceRecordFixture.id,
        },
        revision: 2,
      }),
      expect.objectContaining({
        id: supersedePreferenceActionFixture.replacementAuditEventId,
        actionId: supersedePreferenceActionFixture.actionId,
        kind: 'preference-revised',
        reasonCode: 'superseded',
        entity: {
          kind: 'preference',
          preferenceId: preferenceReplacementFixture.id,
        },
        revision: 1,
      }),
    ])
    expectDeeplyFrozen(execution)
  })

  it('rejects terminal previous records, duplicate IDs, and unrelated keys', () => {
    expect(() =>
      supersedePreference(
        { ...activePreferenceRecordFixture, status: 'revoked' },
        preferenceReplacementFixture,
        supersedePreferenceActionFixture,
      ),
    ).toThrowError(InvalidTransitionError)
    expect(() =>
      supersedePreference(
        activePreferenceRecordFixture,
        {
          ...preferenceReplacementFixture,
          preference: {
            key: 'interaction.directness',
            value: 'direct',
          },
        },
        supersedePreferenceActionFixture,
      ),
    ).toThrowError(InvalidTransitionError)
    expect(() =>
      supersedePreference(
        activePreferenceRecordFixture,
        { ...preferenceReplacementFixture, id: activePreferenceRecordFixture.id },
        supersedePreferenceActionFixture,
      ),
    ).toThrowError(InvalidTransitionError)
  })

  it('enforces revision, exact replay, and conflicting action payload', () => {
    expect(() =>
      supersedePreference(
        activePreferenceRecordFixture,
        preferenceReplacementFixture,
        { ...supersedePreferenceActionFixture, expectedPreviousRevision: 9 },
      ),
    ).toThrowError(RevisionConflictError)

    const first = supersedePreference(
      activePreferenceRecordFixture,
      preferenceReplacementFixture,
      supersedePreferenceActionFixture,
    )
    expect(
      supersedePreference(
        structuredClone(activePreferenceRecordFixture),
        structuredClone(preferenceReplacementFixture),
        { ...supersedePreferenceActionFixture },
        first,
      ),
    ).toBe(first)
    expect(() =>
      supersedePreference(
        activePreferenceRecordFixture,
        preferenceReplacementFixture,
        {
          ...supersedePreferenceActionFixture,
          replacementAuditEventId: 'audit-changed',
        },
        first,
      ),
    ).toThrowError(ActionReplayConflictError)
    expect(() =>
      supersedePreference(
        activePreferenceRecordFixture,
        {
          ...preferenceReplacementFixture,
          evidenceIds: ['evidence-changed'],
        },
        supersedePreferenceActionFixture,
        first,
      ),
    ).toThrowError(ActionPayloadConflictError)
  })

  it('requires two distinct non-empty caller-supplied audit event IDs', () => {
    for (const action of [
      { ...supersedePreferenceActionFixture, previousAuditEventId: '' },
      { ...supersedePreferenceActionFixture, replacementAuditEventId: '' },
    ]) {
      expectTransitionCode(
        () =>
          supersedePreference(
            activePreferenceRecordFixture,
            preferenceReplacementFixture,
            action,
          ),
        'audit-event-id-invalid',
      )
    }
    expectTransitionCode(
      () =>
        supersedePreference(
          activePreferenceRecordFixture,
          preferenceReplacementFixture,
          {
            ...supersedePreferenceActionFixture,
            replacementAuditEventId:
              supersedePreferenceActionFixture.previousAuditEventId,
          },
        ),
      'audit-event-id-conflict',
    )
  })
})

describe('deterministic validation precedence', () => {
  it('reports candidate target mismatch before terminal status and revision', () => {
    expectTransitionCode(
      () =>
        applyCandidateAction(
          { ...preferenceCandidateFixture, status: 'deleted', revision: 4 },
          {
            ...confirmCandidateActionFixture,
            candidateId: 'candidate-other',
            expectedCandidateRevision: 99,
          },
        ),
      'candidate-id-mismatch',
    )
  })

  it('reports preference target mismatch before terminal status and revision', () => {
    expectTransitionCode(
      () =>
        revokePreference(
          { ...activePreferenceRecordFixture, status: 'deleted', revision: 4 },
          {
            ...revokePreferenceActionFixture,
            preferenceId: 'preference-other',
            expectedPreferenceRevision: 99,
          },
        ),
      'preference-id-mismatch',
    )
  })

  it('reports replacement key and audit ID conflicts before status and revision', () => {
    const invalidPrevious = {
      ...activePreferenceRecordFixture,
      status: 'deleted' as const,
      revision: 4,
    }
    expectTransitionCode(
      () =>
        supersedePreference(
          invalidPrevious,
          {
            ...preferenceReplacementFixture,
            preference: { key: 'interaction.directness', value: 'direct' },
          },
          { ...supersedePreferenceActionFixture, expectedPreviousRevision: 99 },
        ),
      'replacement-key-conflict',
    )
    expectTransitionCode(
      () =>
        supersedePreference(
          invalidPrevious,
          preferenceReplacementFixture,
          {
            ...supersedePreferenceActionFixture,
            expectedPreviousRevision: 99,
            replacementAuditEventId:
              supersedePreferenceActionFixture.previousAuditEventId,
          },
        ),
      'audit-event-id-conflict',
    )
  })
})

describe('immutability and ambient-state prohibition', () => {
  it('does not mutate inputs and deeply freezes every returned execution', () => {
    const candidate = structuredClone(preferenceCandidateFixture)
    const action = structuredClone(confirmCandidateActionFixture)
    const candidateBefore = structuredClone(candidate)
    const actionBefore = structuredClone(action)
    const execution = applyCandidateAction(
      candidate,
      action,
    )
    expect(candidate).toEqual(candidateBefore)
    expect(action).toEqual(actionBefore)
    expect(Object.isFrozen(candidate)).toBe(false)
    expect(Object.isFrozen(candidate.identity)).toBe(false)
    expect(Object.isFrozen(action)).toBe(false)
    expect(Object.isFrozen(action.projection)).toBe(false)
    expect(execution.input.candidate).not.toBe(candidate)
    expect(execution.input.action).not.toBe(action)
    expectDeeplyFrozen(execution)

    const preference = structuredClone(activePreferenceRecordFixture)
    const revokeAction = structuredClone(revokePreferenceActionFixture)
    const revokeExecution = revokePreference(preference, revokeAction)
    expect(Object.isFrozen(preference)).toBe(false)
    expect(Object.isFrozen(preference.identity)).toBe(false)
    expect(Object.isFrozen(revokeAction)).toBe(false)
    expect(revokeExecution.input.preference).not.toBe(preference)
    expect(revokeExecution.input.action).not.toBe(revokeAction)
    expectDeeplyFrozen(revokeExecution)

    const previous = structuredClone(activePreferenceRecordFixture)
    const replacement = structuredClone(preferenceReplacementFixture)
    const supersedeAction = structuredClone(supersedePreferenceActionFixture)
    const supersedeExecution = supersedePreference(
      previous,
      replacement,
      supersedeAction,
    )
    expect(Object.isFrozen(previous)).toBe(false)
    expect(Object.isFrozen(replacement)).toBe(false)
    expect(Object.isFrozen(replacement.projection)).toBe(false)
    expect(Object.isFrozen(supersedeAction)).toBe(false)
    expect(supersedeExecution.input.previous).not.toBe(previous)
    expect(supersedeExecution.input.replacement).not.toBe(replacement)
    expect(supersedeExecution.input.action).not.toBe(supersedeAction)
    expectDeeplyFrozen(supersedeExecution)
  })
})
