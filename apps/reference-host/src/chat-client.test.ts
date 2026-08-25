import { describe, expect, it, vi } from 'vitest'

import { ReferenceChatClient } from './chat-client.js'

const identity = {
  userId: 'synthetic-user',
  companionId: 'synthetic-companion',
  relationshipId: 'synthetic-relationship',
} as const

const source = {
  kind: 'reference-host-turn',
  contentCategory: 'ordinary-conversation',
} as const

const policySnapshot = {
  collection: { allowedSources: [source], retainContent: true },
  outboundInference: { mode: 'local-only', allowedSources: [source] },
  projection: { allowedHosts: ['reference-host'], allowedDomains: ['work'] },
  settingsRevision: 4,
} as const

function createHarness() {
  const events: string[] = []
  const runtime = {
    getEffectiveProfile: vi.fn(async () => {
      events.push('profile')
      return { guidance: { responseDetail: 'concise' as const }, settingsRevision: 4 }
    }),
    ingestEvidence: vi.fn(async () => {
      events.push('evidence')
      return { evidenceId: 'evidence-turn-7', disposition: 'accepted' as const, settingsRevision: 4 }
    }),
  }
  const model = {
    complete: vi.fn(async () => {
      events.push('model')
      return { assistantText: 'Short answer.' }
    }),
  }
  const client = new ReferenceChatClient({
    runtime,
    model,
    identity,
    hostId: 'reference-host',
    sessionId: 'session-stable',
    domain: 'work',
    source,
    policySnapshot,
    now: () => '2026-08-25T01:02:03Z',
    nextId: () => 'evidence-turn-7',
  })
  return { client, events, model, runtime }
}

describe('reference-host closed loop', () => {
  it('queries guidance before the model and ingests only the completed current turn afterwards', async () => {
    const { client, events, model, runtime } = createHarness()

    await expect(client.complete({
      userText: 'Use secret api-key-value only to answer this request.',
      history: [{ role: 'assistant', text: 'Prior response that must not become new evidence.' }],
    })).resolves.toEqual({ assistantText: 'Short answer.', warnings: [] })

    expect(events).toEqual(['profile', 'model', 'evidence'])
    expect(runtime.getEffectiveProfile).toHaveBeenCalledWith({
      query: {
        ...identity,
        hostId: 'reference-host',
        domain: 'work',
        now: '2026-08-25T01:02:03Z',
      },
    })
    expect(model.complete).toHaveBeenCalledWith({
      developerMessage: expect.stringContaining('Response detail: concise'),
      messages: [
        { role: 'assistant', text: 'Prior response that must not become new evidence.' },
        { role: 'user', text: 'Use secret api-key-value only to answer this request.' },
      ],
    })
    expect(runtime.ingestEvidence).toHaveBeenCalledWith({
      evidence: {
        schemaVersion: 1,
        id: 'evidence-turn-7',
        identity: {
          ...identity,
          hostId: 'reference-host',
          sessionId: 'session-stable',
          domain: 'work',
        },
        occurredAt: '2026-08-25T01:02:03Z',
        sourceRef: 'reference-host:session-stable:evidence-turn-7',
        source,
        consent: { purpose: 'preference-learning', policyVersion: 'reference-host-v1' },
        learningPayload: {
          userText: 'Use secret api-key-value only to answer this request.',
          assistantText: 'Short answer.',
        },
        policySnapshot,
      },
    })
    const serializedEvidence = JSON.stringify(runtime.ingestEvidence.mock.calls[0])
    expect(serializedEvidence).not.toContain('Prior response')
    expect(serializedEvidence).not.toContain('Response detail: concise')
  })

  it('continues without guidance when the Runtime profile lookup fails', async () => {
    const { client, model, runtime } = createHarness()
    runtime.getEffectiveProfile.mockRejectedValueOnce(new Error('runtime token must not leak'))

    await expect(client.complete({ userText: 'Hello.', history: [] })).resolves.toEqual({
      assistantText: 'Short answer.',
      warnings: ['profile-unavailable'],
    })
    expect(model.complete).toHaveBeenCalledWith({
      messages: [{ role: 'user', text: 'Hello.' }],
    })
    expect(runtime.ingestEvidence).toHaveBeenCalledOnce()
  })

  it('keeps the answer when evidence ingestion fails, but never ingests after model failure', async () => {
    const first = createHarness()
    first.runtime.ingestEvidence.mockRejectedValueOnce(new Error('runtime unavailable'))
    await expect(first.client.complete({ userText: 'Hello.', history: [] })).resolves.toEqual({
      assistantText: 'Short answer.',
      warnings: ['evidence-not-ingested'],
    })

    const second = createHarness()
    second.model.complete.mockRejectedValueOnce(new Error('model unavailable'))
    await expect(second.client.complete({ userText: 'Hello.', history: [] })).rejects.toThrow('model unavailable')
    expect(second.runtime.ingestEvidence).not.toHaveBeenCalled()
  })
})
