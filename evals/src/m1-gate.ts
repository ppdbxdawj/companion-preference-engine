export const M1_GATE_THRESHOLDS = Object.freeze({
  minimumPrecision: 0.8,
  minimumConflictChangeAccuracy: 0.85,
  maximumCrossDomainLeakageCount: 0,
  maximumBackgroundCandidatesPer20Turns: 1,
} as const)

export type M1GateInput = Readonly<{
  precision: number
  recall: number
  abstentionAccuracy: number
  conflictChangeAccuracy: number
  crossDomainLeakageCount: number
  backgroundCandidateCount: number
  backgroundTurnCount: number
  executionFailureCount: number
}>

export type M1GateFailure =
  | 'precision-below-minimum'
  | 'conflict-change-accuracy-below-minimum'
  | 'cross-domain-leakage'
  | 'background-candidate-burden'
  | 'model-execution-failures'

export type M1GateDecision = Readonly<{
  passed: boolean
  backgroundCandidatesPer20Turns: number
  failures: readonly M1GateFailure[]
}>

export function decideM1Gate(input: M1GateInput): M1GateDecision {
  if (!Number.isInteger(input.backgroundTurnCount) || input.backgroundTurnCount <= 0) {
    throw new Error('background turn denominator must be positive')
  }
  if (!Number.isInteger(input.backgroundCandidateCount) || input.backgroundCandidateCount < 0) {
    throw new Error('background candidate count must be non-negative')
  }
  if (!Number.isInteger(input.executionFailureCount) || input.executionFailureCount < 0) {
    throw new Error('execution failure count must be non-negative')
  }
  const backgroundCandidatesPer20Turns =
    input.backgroundCandidateCount * 20 / input.backgroundTurnCount
  const failures: M1GateFailure[] = []
  if (input.precision < M1_GATE_THRESHOLDS.minimumPrecision) {
    failures.push('precision-below-minimum')
  }
  if (input.conflictChangeAccuracy < M1_GATE_THRESHOLDS.minimumConflictChangeAccuracy) {
    failures.push('conflict-change-accuracy-below-minimum')
  }
  if (input.crossDomainLeakageCount > M1_GATE_THRESHOLDS.maximumCrossDomainLeakageCount) {
    failures.push('cross-domain-leakage')
  }
  if (backgroundCandidatesPer20Turns > M1_GATE_THRESHOLDS.maximumBackgroundCandidatesPer20Turns) {
    failures.push('background-candidate-burden')
  }
  if (input.executionFailureCount > 0) failures.push('model-execution-failures')
  return {
    passed: failures.length === 0,
    backgroundCandidatesPer20Turns,
    failures,
  }
}
