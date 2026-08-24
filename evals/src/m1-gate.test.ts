import { describe, expect, it } from 'vitest'

import { decideM1Gate, M1_GATE_THRESHOLDS } from './m1-gate.js'

const passingMetrics = {
  precision: 0.8,
  recall: 0.7,
  abstentionAccuracy: 0.9,
  conflictChangeAccuracy: 0.85,
  crossDomainLeakageCount: 0,
  backgroundCandidateCount: 5,
  backgroundTurnCount: 100,
  executionFailureCount: 0,
} as const

describe('M1 binding model gate', () => {
  it('freezes the approved thresholds and treats their boundaries as passing', () => {
    expect(M1_GATE_THRESHOLDS).toEqual({
      minimumPrecision: 0.8,
      minimumConflictChangeAccuracy: 0.85,
      maximumCrossDomainLeakageCount: 0,
      maximumBackgroundCandidatesPer20Turns: 1,
    })
    expect(decideM1Gate(passingMetrics)).toEqual({
      passed: true,
      backgroundCandidatesPer20Turns: 1,
      failures: [],
    })
  })

  it('reports every binding failure instead of hiding failures behind recall', () => {
    expect(decideM1Gate({
      ...passingMetrics,
      precision: 0.79,
      recall: 1,
      conflictChangeAccuracy: 0.84,
      crossDomainLeakageCount: 1,
      backgroundCandidateCount: 6,
      executionFailureCount: 2,
    })).toEqual({
      passed: false,
      backgroundCandidatesPer20Turns: 1.2,
      failures: [
        'precision-below-minimum',
        'conflict-change-accuracy-below-minimum',
        'cross-domain-leakage',
        'background-candidate-burden',
        'model-execution-failures',
      ],
    })
  })

  it('rejects a missing background denominator instead of dividing by zero', () => {
    expect(() => decideM1Gate({ ...passingMetrics, backgroundTurnCount: 0 })).toThrow(/background/i)
  })
})
