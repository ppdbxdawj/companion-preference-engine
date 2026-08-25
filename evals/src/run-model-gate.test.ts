import { describe, expect, it } from 'vitest'

import type { CandidateEvaluationPrediction } from './candidate-eval.js'
import { createBackgroundOutcome, createQualityOutcome } from './run-model-gate.js'
import type { DevelopmentEvaluationCase } from './schema.js'

const evaluationCase: DevelopmentEvaluationCase = {
  schemaVersion: 1,
  id: 'work-explicit-001',
  category: 'work-explicit-or-repeated',
  turns: [{ sourceRef: 'turn-1', role: 'user', text: 'Synthetic evaluation text.' }],
  expectedCandidates: [{
    preference: { key: 'interaction.response_detail', value: 'concise' },
    scope: { kind: 'domain', domain: 'work' },
    evidenceSourceRefs: ['turn-1'],
    counterEvidenceSourceRefs: [],
  }],
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

const emptyPrediction: CandidateEvaluationPrediction = {
  caseId: evaluationCase.id,
  candidates: [],
  guidance: {},
}

describe('content-free model-gate outcomes', () => {
  it('marks quality execution errors separately from model misses', () => {
    expect(createQualityOutcome(evaluationCase, emptyPrediction)).toEqual({
      itemId: evaluationCase.id,
      kind: 'quality',
      status: 'missed',
    })
    expect(createQualityOutcome(evaluationCase, undefined, true)).toEqual({
      itemId: evaluationCase.id,
      kind: 'quality',
      status: 'execution-error',
    })
  })

  it('records background burden without retaining turn content', () => {
    expect(createBackgroundOutcome('background-1', 0)).toEqual({
      itemId: 'background-1',
      kind: 'background',
      status: 'clear',
    })
    expect(createBackgroundOutcome('background-2', 1)).toEqual({
      itemId: 'background-2',
      kind: 'background',
      status: 'candidate-emitted',
    })
    expect(createBackgroundOutcome('background-3', 0, true)).toEqual({
      itemId: 'background-3',
      kind: 'background',
      status: 'execution-error',
    })
    expect(JSON.stringify(createBackgroundOutcome('background-1', 0))).not.toContain('Synthetic evaluation text.')
  })
})
