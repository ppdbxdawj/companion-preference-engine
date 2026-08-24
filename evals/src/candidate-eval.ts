import type { BehaviorGuidance } from '@companion-preference/contracts'

import type { EvaluatedCandidate } from './baselines/types.js'
import type { DevelopmentEvaluationCase } from './schema.js'

export type CandidateEvaluationPrediction = Readonly<{
  caseId: string
  candidates: readonly EvaluatedCandidate[]
  guidance: Readonly<BehaviorGuidance>
}>

export type CandidateEvaluationMetrics = Readonly<{
  caseCount: number
  truePositiveCount: number
  falsePositiveCount: number
  falseNegativeCount: number
  precision: number
  recall: number
  abstentionAccuracy: number
  conflictChangeAccuracy: number
  crossDomainLeakageCount: number
  candidatesPer20Turns: number
}>

/**
 * Exact, deterministic scoring only. Candidate identity is canonical JSON of
 * { preference, scope }. Guidance leakage is any unexpected defined field in
 * a cross-domain case. Duplicate predictions count as false positives.
 */
export function scoreCandidateEvaluation(
  cases: readonly DevelopmentEvaluationCase[],
  predictions: readonly CandidateEvaluationPrediction[],
): CandidateEvaluationMetrics {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  const candidateKey = (candidate: EvaluatedCandidate): string =>
    canonical({ preference: candidate.preference, scope: candidate.scope })
  const exact = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right)

  const caseIds = new Set<string>()
  for (const evaluationCase of cases) {
    if (caseIds.has(evaluationCase.id)) throw new Error(`duplicate evaluation case ID: ${evaluationCase.id}`)
    caseIds.add(evaluationCase.id)
  }
  const predictionById = new Map<string, CandidateEvaluationPrediction>()
  for (const prediction of predictions) {
    if (!caseIds.has(prediction.caseId)) throw new Error(`unknown prediction case ID: ${prediction.caseId}`)
    if (predictionById.has(prediction.caseId)) throw new Error(`duplicate prediction for case: ${prediction.caseId}`)
    predictionById.set(prediction.caseId, prediction)
  }
  if (predictionById.size !== cases.length) throw new Error('exactly one prediction is required for every case')

  let truePositiveCount = 0
  let falsePositiveCount = 0
  let falseNegativeCount = 0
  let abstentionCorrect = 0
  let abstentionPopulation = 0
  let conflictChangeCorrect = 0
  let conflictChangePopulation = 0
  let crossDomainLeakageCount = 0
  let predictedCandidateCount = 0
  let userTurnCount = 0

  for (const evaluationCase of cases) {
    const prediction = predictionById.get(evaluationCase.id)!
    const expectedCounts = new Map<string, number>()
    for (const candidate of evaluationCase.expectedCandidates) {
      const key = candidateKey(candidate)
      expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1)
    }
    for (const candidate of prediction.candidates) {
      const key = candidateKey(candidate)
      const remaining = expectedCounts.get(key) ?? 0
      if (remaining > 0) {
        truePositiveCount += 1
        expectedCounts.set(key, remaining - 1)
      } else {
        falsePositiveCount += 1
      }
    }
    for (const remaining of expectedCounts.values()) falseNegativeCount += remaining

    predictedCandidateCount += prediction.candidates.length
    userTurnCount += evaluationCase.turns.filter((turn) => turn.role === 'user').length

    if (evaluationCase.category === 'ambiguous-abstention') {
      abstentionPopulation += 1
      if (evaluationCase.expectedCandidates.length === 0 && prediction.candidates.length === 0) {
        abstentionCorrect += 1
      }
    }
    if (evaluationCase.category === 'conflict-or-change') {
      conflictChangePopulation += 1
      const expectedCandidates = evaluationCase.expectedCandidates.map((candidate) => ({
        preference: candidate.preference,
        scope: candidate.scope,
      })).map(candidateKey).sort()
      const predictedCandidates = prediction.candidates.map(candidateKey).sort()
      if (exact(expectedCandidates, predictedCandidates) && exact(evaluationCase.expectedGuidance, prediction.guidance)) {
        conflictChangeCorrect += 1
      }
    }
    if (evaluationCase.category === 'cross-domain-counterfactual') {
      for (const [key, value] of Object.entries(prediction.guidance)) {
        if (value !== undefined && !Object.hasOwn(evaluationCase.expectedGuidance, key)) {
          crossDomainLeakageCount += 1
        }
      }
    }
  }

  const precision = predictedCandidateCount === 0
    ? falseNegativeCount === 0 ? 1 : 0
    : truePositiveCount / predictedCandidateCount
  const expectedCandidateCount = truePositiveCount + falseNegativeCount
  const recall = expectedCandidateCount === 0
    ? falsePositiveCount === 0 ? 1 : 0
    : truePositiveCount / expectedCandidateCount
  const abstentionAccuracy = abstentionPopulation === 0
    ? 1
    : abstentionCorrect / abstentionPopulation
  const conflictChangeAccuracy = conflictChangePopulation === 0
    ? 1
    : conflictChangeCorrect / conflictChangePopulation

  return {
    caseCount: cases.length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    abstentionAccuracy,
    conflictChangeAccuracy,
    crossDomainLeakageCount,
    candidatesPer20Turns: userTurnCount === 0 ? 0 : (predictedCandidateCount / userTurnCount) * 20,
  }
}
