import type {
  InteractionEvidence,
  PendingCandidateProposal,
} from '@companion-preference/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FakePreferenceObserver } from './fake-observer.js'

const evidence: InteractionEvidence = {
  schemaVersion: 1,
  id: 'evidence-eval-1',
  identity: {
    userId: 'synthetic-user',
    companionId: 'synthetic-companion',
    relationshipId: 'synthetic-relationship',
    hostId: 'reference-host',
    sessionId: 'synthetic-session',
    domain: 'work',
  },
  occurredAt: '2026-08-24T00:00:00Z',
  sourceRef: 'synthetic-turn-1',
  source: { kind: 'chat-turn', contentCategory: 'ordinary-conversation' },
  consent: { purpose: 'preference-learning', policyVersion: 'eval-v1' },
  learningPayload: { userText: 'Please keep work answers concise.' },
  policySnapshot: {
    collection: {
      allowedSources: [
        { kind: 'chat-turn', contentCategory: 'ordinary-conversation' },
      ],
      retainContent: true,
    },
    outboundInference: { mode: 'disabled' },
    projection: {
      allowedHosts: ['reference-host'],
      allowedDomains: ['work'],
    },
    settingsRevision: 1,
  },
}

const supplied: PendingCandidateProposal = {
  identity: {
    userId: 'synthetic-user',
    companionId: 'synthetic-companion',
    relationshipId: 'synthetic-relationship',
  },
  preference: { key: 'interaction.response_detail', value: 'concise' },
  scope: { kind: 'domain', domain: 'work' },
  projection: {
    allowedHosts: ['reference-host'],
    allowedDomains: ['work'],
  },
  provenance: { kind: 'observer-evidence', evidenceIds: [evidence.id] },
  evidenceIds: [evidence.id],
  counterEvidenceIds: [],
  confidence: 0.9,
  riskCategory: 'standard',
  status: 'pending_confirmation',
  idempotencyKey: {
    version: 1,
    algorithm: 'sha256',
    digest: 'b3fbbd10ac6687f53bdafa076f18e3c7321229fd66a891a2bef0c6359ddc1668',
  },
}

afterEach(() => vi.restoreAllMocks())

describe('FakePreferenceObserver frozen behavior', () => {
  it('returns only defensive copies of the caller-supplied pending proposals', async () => {
    const observer = new FakePreferenceObserver([supplied])

    const first = await observer.propose({ evidenceWindow: [evidence] })
    expect(first).toEqual([supplied])
    expect(first[0]).not.toBe(supplied)
    expect(first.every((proposal) => proposal.status === 'pending_confirmation')).toBe(true)

    first[0]!.evidenceIds.push('mutation-attempt')
    const second = await observer.propose({ evidenceWindow: [evidence] })
    expect(second).toEqual([supplied])
  })

  it('rejects with AbortError when already aborted and returns no proposals', async () => {
    const observer = new FakePreferenceObserver([supplied])
    const controller = new AbortController()
    controller.abort()

    await expect(
      observer.propose({ evidenceWindow: [evidence] }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('never performs network I/O', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('network access is forbidden'),
    )
    const observer = new FakePreferenceObserver([supplied])

    await expect(observer.propose({ evidenceWindow: [evidence] })).resolves.toEqual([
      supplied,
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
