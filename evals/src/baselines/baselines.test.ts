import type { DevelopmentEvaluationCase } from '../schema.js'
import { describe, expect, it, vi } from 'vitest'

import { ManualProfileBaseline } from './manual-profile.js'
import { PlainMemoryBaseline } from './plain-memory.js'
import { SemanticMemoryRagBaseline } from './semantic-memory-rag.js'
import { FullHistoryBaseline } from './full-history.js'
import type { BaselineInput, SemanticMemoryBackbone } from './types.js'

const evaluationCase: DevelopmentEvaluationCase = {
  schemaVersion: 1,
  id: 'baseline-fixture',
  category: 'work-explicit-or-repeated',
  turns: [
    {
      sourceRef: 'baseline-turn-1',
      role: 'user',
      text: 'Keep work answers concise.',
    },
  ],
  expectedCandidates: [
    {
      preference: { key: 'interaction.response_detail', value: 'concise' },
      scope: { kind: 'domain', domain: 'work' },
      evidenceSourceRefs: ['baseline-turn-1'],
      counterEvidenceSourceRefs: [],
    },
  ],
  forbiddenKeys: [],
  queryContext: {
    userId: 'synthetic-user',
    companionId: 'synthetic-companion',
    relationshipId: 'synthetic-relationship',
    hostId: 'reference-host',
    domain: 'work',
    now: '2026-08-24T00:00:00Z',
  },
  expectedGuidance: { responseDetail: 'concise' },
}

const input: BaselineInput = {
  evaluationCase,
  budget: {
    consentedTurnLimit: 20,
    retrievalItemLimit: 4,
    generationTokenLimit: 256,
    backboneId: 'same-backbone-v1',
  },
}

describe('frozen baseline behavior', () => {
  it('plain memory is deterministic lexical extraction without governed state', async () => {
    const baseline = new PlainMemoryBaseline()
    const first = await baseline.evaluate(input)
    const second = await baseline.evaluate(input)

    expect(first).toEqual(second)
    expect(first).toEqual({
      candidates: [
        {
          preference: { key: 'interaction.response_detail', value: 'concise' },
          scope: { kind: 'domain', domain: 'work' },
        },
      ],
      guidance: { responseDetail: 'concise' },
    })
    expect(baseline.governedCandidateState).toBe(false)
  })

  it('semantic Memory/RAG delegates the exact consented window and budget', async () => {
    const expected = { candidates: [], guidance: { responseDetail: 'balanced' as const } }
    const run = vi.fn<SemanticMemoryBackbone['run']>().mockResolvedValue(expected)
    const baseline = new SemanticMemoryRagBaseline({ run })

    await expect(baseline.evaluate(input)).resolves.toBe(expected)
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(
      {
        consentedTurns: evaluationCase.turns,
        queryContext: evaluationCase.queryContext,
        budget: input.budget,
      },
      undefined,
    )
  })

  it('manual profile projects only the caller-supplied profile', async () => {
    const baseline = new ManualProfileBaseline()
    await expect(
      baseline.evaluate({
        ...input,
        manualProfile: { directness: 'gentle', supportStyle: 'listen_first' },
      }),
    ).resolves.toEqual({
      candidates: [],
      guidance: { directness: 'gentle', supportStyle: 'listen_first' },
    })
  })

  it('full history is an explicit ungoverned baseline over the same consented turns', async () => {
    const baseline = new FullHistoryBaseline()
    await expect(baseline.evaluate(input)).resolves.toEqual({
      candidates: [
        {
          preference: { key: 'interaction.response_detail', value: 'concise' },
          scope: { kind: 'domain', domain: 'work' },
        },
      ],
      guidance: { responseDetail: 'concise' },
    })
    expect(baseline.id).toBe('full-history')
    expect(baseline.governedCandidateState).toBe(false)
  })

  it('all executable baselines reject a pre-aborted call with AbortError', async () => {
    const controller = new AbortController()
    controller.abort()
    const backbone: SemanticMemoryBackbone = {
      run: vi.fn().mockResolvedValue({ candidates: [], guidance: {} }),
    }

    for (const baseline of [
      new PlainMemoryBaseline(),
      new SemanticMemoryRagBaseline(backbone),
      new ManualProfileBaseline(),
    ]) {
      await expect(baseline.evaluate(input, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      })
    }
    expect(backbone.run).not.toHaveBeenCalled()
  })
})
