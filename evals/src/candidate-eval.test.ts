import type { DevelopmentEvaluationCase } from './schema.js'
import { describe, expect, it } from 'vitest'

import { NoPersonalizationBaseline } from './baselines/no-personalization.js'
import type { CandidateEvaluationPrediction } from './candidate-eval.js'
import { scoreCandidateEvaluation } from './candidate-eval.js'

const base = {
  schemaVersion: 1,
  turns: [{ sourceRef: 'turn-1', role: 'user', text: 'Synthetic text.' }],
  forbiddenKeys: [],
  queryContext: {
    userId: 'synthetic-user',
    companionId: 'synthetic-companion',
    relationshipId: 'synthetic-relationship',
    hostId: 'reference-host',
    domain: 'work',
    now: '2026-08-24T00:00:00Z',
  },
} as const

const preference = {
  preference: { key: 'interaction.response_detail', value: 'concise' },
  scope: { kind: 'domain', domain: 'work' },
} as const

const cases: DevelopmentEvaluationCase[] = [
  {
    ...base,
    id: 'positive',
    category: 'work-explicit-or-repeated',
    expectedCandidates: [
      { ...preference, evidenceSourceRefs: ['turn-1'], counterEvidenceSourceRefs: [] },
    ],
    expectedGuidance: { responseDetail: 'concise' },
  },
  {
    ...base,
    id: 'abstain',
    category: 'ambiguous-abstention',
    expectedCandidates: [],
    forbiddenKeys: ['interaction.response_detail'],
    expectedGuidance: {},
  },
  {
    ...base,
    id: 'change',
    category: 'conflict-or-change',
    expectedCandidates: [
      { ...preference, evidenceSourceRefs: ['turn-1'], counterEvidenceSourceRefs: [] },
    ],
    expectedGuidance: { responseDetail: 'concise' },
  },
  {
    ...base,
    id: 'cross-work',
    category: 'cross-domain-counterfactual',
    counterfactualPairId: 'pair-1',
    expectedCandidates: [
      { ...preference, evidenceSourceRefs: ['turn-1'], counterEvidenceSourceRefs: [] },
    ],
    expectedGuidance: { responseDetail: 'concise' },
  },
  {
    ...base,
    id: 'cross-companion',
    category: 'cross-domain-counterfactual',
    counterfactualPairId: 'pair-1',
    queryContext: { ...base.queryContext, domain: 'companion' },
    expectedCandidates: [
      { ...preference, evidenceSourceRefs: ['turn-1'], counterEvidenceSourceRefs: [] },
    ],
    expectedGuidance: {},
  },
]

describe('frozen candidate metrics', () => {
  it('scores exact matches, abstention, changes, leakage, and normalized volume', () => {
    const predictions: CandidateEvaluationPrediction[] = [
      { caseId: 'positive', candidates: [preference], guidance: { responseDetail: 'concise' } },
      { caseId: 'abstain', candidates: [], guidance: {} },
      { caseId: 'change', candidates: [preference], guidance: { responseDetail: 'concise' } },
      { caseId: 'cross-work', candidates: [preference], guidance: { responseDetail: 'concise' } },
      { caseId: 'cross-companion', candidates: [preference], guidance: {} },
    ]

    expect(scoreCandidateEvaluation(cases, predictions)).toEqual({
      caseCount: 5,
      truePositiveCount: 4,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      precision: 1,
      recall: 1,
      abstentionAccuracy: 1,
      conflictChangeAccuracy: 1,
      crossDomainLeakageCount: 0,
      candidatesPer20Turns: 16,
    })
  })

  it('counts duplicates as false positives and unexpected cross-domain guidance as leakage', () => {
    const predictions: CandidateEvaluationPrediction[] = cases.map((item) => ({
      caseId: item.id,
      candidates: item.id === 'abstain' ? [] : [preference],
      guidance:
        item.id === 'cross-companion'
          ? { responseDetail: 'concise' }
          : item.expectedGuidance,
    }))
    predictions[0] = {
      ...predictions[0]!,
      candidates: [preference, preference],
    }

    const metrics = scoreCandidateEvaluation(cases, predictions)
    expect(metrics.truePositiveCount).toBe(4)
    expect(metrics.falsePositiveCount).toBe(1)
    expect(metrics.precision).toBe(0.8)
    expect(metrics.crossDomainLeakageCount).toBe(1)
  })

  it('requires exactly one prediction per known case', () => {
    expect(() => scoreCandidateEvaluation(cases, [])).toThrow(/prediction/i)
    expect(() =>
      scoreCandidateEvaluation(cases, [
        { caseId: 'unknown', candidates: [], guidance: {} },
      ]),
    ).toThrow(/unknown/i)
  })

  it('freezes no-personalization as empty candidates and empty guidance', async () => {
    const baseline = new NoPersonalizationBaseline()
    await expect(
      baseline.evaluate({
        evaluationCase: cases[0]!,
        budget: {
          consentedTurnLimit: 20,
          retrievalItemLimit: 4,
          generationTokenLimit: 256,
          backboneId: 'deterministic-fixture-v1',
        },
      }),
    ).resolves.toEqual({ candidates: [], guidance: {} })
  })
})
