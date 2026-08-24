import type { DevelopmentEvaluationCase } from './schema.js'
import { describe, expect, it } from 'vitest'

import { validateM1DatasetComposition } from './m1-dataset-contract.js'

const categoryMinimums = {
  'work-explicit-or-repeated': 15,
  'temporary-state': 10,
  'conflict-or-change': 10,
  'ambiguous-abstention': 10,
  'cross-domain-counterfactual': 30,
} as const

function syntheticCase(
  category: DevelopmentEvaluationCase['category'],
  index: number,
): DevelopmentEvaluationCase {
  const id = `${category}-${index}`
  const crossDomain = category === 'cross-domain-counterfactual'
  return {
    schemaVersion: 1,
    id,
    category,
    ...(crossDomain ? { counterfactualPairId: `pair-${Math.floor(index / 2)}` } : {}),
    turns: [{ sourceRef: `${id}-turn`, role: 'user', text: 'Synthetic reviewed input.' }],
    expectedCandidates: [],
    forbiddenKeys: [],
    queryContext: {
      userId: 'synthetic-user',
      companionId: 'synthetic-companion',
      relationshipId: 'synthetic-relationship',
      hostId: 'reference-host',
      domain: crossDomain && index % 2 === 1 ? 'companion' : 'work',
      now: '2026-08-25T00:00:00Z',
    },
    expectedGuidance: {},
  }
}

function validQualitySet(): DevelopmentEvaluationCase[] {
  return Object.entries(categoryMinimums).flatMap(([category, count]) => (
    Array.from({ length: count }, (_, index) => (
      syntheticCase(category as DevelopmentEvaluationCase['category'], index)
    ))
  ))
}

describe('M1 dataset composition freeze', () => {
  it('accepts the approved minimum quality composition plus 100 background turns', () => {
    expect(validateM1DatasetComposition({
      qualityCases: validQualitySet(),
      backgroundTurns: Array.from({ length: 100 }, (_, index) => ({
        sourceRef: `background-${index}`,
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        text: 'Synthetic ordinary conversation with no preference change.',
      })),
    })).toEqual({
      qualityCaseCount: 75,
      backgroundTurnCount: 100,
      categoryCounts: categoryMinimums,
    })
  })

  it('rejects undersized quality categories and background sets', () => {
    expect(() => validateM1DatasetComposition({
      qualityCases: validQualitySet().slice(1),
      backgroundTurns: Array.from({ length: 99 }, (_, index) => ({
        sourceRef: `background-${index}`,
        role: 'user' as const,
        text: 'Synthetic ordinary conversation.',
      })),
    })).toThrow(/minimum|background/i)
  })

  it('requires reviewed cross-domain pair membership rather than unpaired cases', () => {
    const cases = validQualitySet()
    const crossDomain = cases.find((item) => item.category === 'cross-domain-counterfactual')!
    delete (crossDomain as { counterfactualPairId?: string }).counterfactualPairId

    expect(() => validateM1DatasetComposition({
      qualityCases: cases,
      backgroundTurns: Array.from({ length: 100 }, (_, index) => ({
        sourceRef: `background-${index}`,
        role: 'user' as const,
        text: 'Synthetic ordinary conversation.',
      })),
    })).toThrow(/counterfactual/i)
  })
})
