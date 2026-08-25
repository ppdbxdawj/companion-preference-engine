import type { CandidateEvaluationMetrics } from './candidate-eval.js'
import type { M1GateDecision } from './m1-gate.js'

export type M1RunMetadata = Readonly<{
  evaluationMode: 'full' | 'smoke'
  modelId: string
  provider: 'codex-cli'
  cliVersion: string
  promptVersion: string
  outputSchemaVersion: string
  datasetManifestSha256: string
  baselineVersions: Readonly<Record<string, string>>
  generationTokenLimit: number
  startedAt: string
  endedAt: string
}>

export type M1ReportInput = Readonly<{
  metadata: M1RunMetadata
  quality: CandidateEvaluationMetrics
  backgroundCandidateCount: number
  backgroundTurnCount: number
  executionFailureCount: number
  gate: M1GateDecision
  outcomes: readonly EvaluationItemOutcome[]
}>

export type EvaluationItemOutcome = Readonly<{
  itemId: string
  kind: 'quality' | 'background'
  status: 'matched' | 'missed' | 'unexpected' | 'mixed' | 'execution-error' | 'clear' | 'candidate-emitted'
}>

export type M1Report = Readonly<{
  schemaVersion: 2
  status: 'M1_GATE' | 'SMOKE_ONLY'
  metadata: M1RunMetadata
  quality: CandidateEvaluationMetrics
  background: Readonly<{
    candidateCount: number
    turnCount: number
    candidatesPer20Turns: number
  }>
  executionFailureCount: number
  gate: M1GateDecision
  outcomes: readonly EvaluationItemOutcome[]
}>

const nonEmpty = (value: string, field: string): string => {
  if (value.trim() === '') throw new Error(`${field} must be non-empty`)
  return value
}

export function createM1Report(input: M1ReportInput): M1Report {
  nonEmpty(input.metadata.modelId, 'modelId')
  nonEmpty(input.metadata.cliVersion, 'cliVersion')
  nonEmpty(input.metadata.promptVersion, 'promptVersion')
  nonEmpty(input.metadata.outputSchemaVersion, 'outputSchemaVersion')
  nonEmpty(input.metadata.datasetManifestSha256, 'datasetManifestSha256')
  if (!Number.isInteger(input.metadata.generationTokenLimit) || input.metadata.generationTokenLimit <= 0) {
    throw new Error('generation token limit must be positive')
  }
  if (!Number.isInteger(input.executionFailureCount) || input.executionFailureCount < 0) {
    throw new Error('execution failure count must be non-negative')
  }
  if (!Number.isInteger(input.backgroundTurnCount) || input.backgroundTurnCount <= 0) {
    throw new Error('background turn count must be positive')
  }
  if (!Number.isInteger(input.backgroundCandidateCount) || input.backgroundCandidateCount < 0) {
    throw new Error('background candidate count must be non-negative')
  }
  const outcomeIds = new Set<string>()
  for (const outcome of input.outcomes) {
    if (outcome.itemId.trim() === '') throw new Error('outcome item ID must be non-empty')
    const identity = `${outcome.kind}:${outcome.itemId}`
    if (outcomeIds.has(identity)) throw new Error(`duplicate outcome item: ${identity}`)
    outcomeIds.add(identity)
    const validStatus = outcome.kind === 'quality'
      ? ['matched', 'missed', 'unexpected', 'mixed', 'execution-error'].includes(outcome.status)
      : ['clear', 'candidate-emitted', 'execution-error'].includes(outcome.status)
    if (!validStatus) throw new Error(`invalid outcome status for ${outcome.kind}: ${outcome.status}`)
  }
  return {
    schemaVersion: 2,
    status: input.metadata.evaluationMode === 'smoke' ? 'SMOKE_ONLY' : 'M1_GATE',
    metadata: input.metadata,
    quality: input.quality,
    background: {
      candidateCount: input.backgroundCandidateCount,
      turnCount: input.backgroundTurnCount,
      candidatesPer20Turns: input.backgroundCandidateCount * 20 / input.backgroundTurnCount,
    },
    executionFailureCount: input.executionFailureCount,
    gate: input.gate,
    outcomes: input.outcomes,
  }
}

export function renderM1ReportMarkdown(report: M1Report): string {
  const statusCounts = new Map<string, number>()
  for (const outcome of report.outcomes) statusCounts.set(outcome.status, (statusCounts.get(outcome.status) ?? 0) + 1)
  const renderedStatusCounts = [...statusCounts.entries()].map(([status, count]) => `- ${status}: ${count}`)
  return [
    '# M1 Model Gate Report',
    '',
    `- Status: ${report.status === 'SMOKE_ONLY' ? 'SMOKE_ONLY' : report.gate.passed ? 'PASS' : 'FAIL'}`,
    `- Model: ${report.metadata.modelId}`,
    `- Provider: ${report.metadata.provider}`,
    `- Codex CLI: ${report.metadata.cliVersion}`,
    `- Dataset manifest: ${report.metadata.datasetManifestSha256}`,
    `- Precision: ${report.quality.precision.toFixed(3)}`,
    `- Conflict/change accuracy: ${report.quality.conflictChangeAccuracy.toFixed(3)}`,
    `- Cross-domain leakage: ${report.quality.crossDomainLeakageCount}`,
    `- Background candidates per 20 turns: ${report.background.candidatesPer20Turns.toFixed(3)}`,
    `- Model execution failures: ${report.executionFailureCount}`,
    '',
    '## Content-free outcome counts',
    ...renderedStatusCounts,
    '',
    report.gate.failures.length === 0
      ? 'All binding thresholds passed.'
      : `Failures: ${report.gate.failures.join(', ')}`,
    '',
  ].join('\n')
}

export type BehaviorPair = Readonly<{
  scenarioId: string
  responseA: string
  responseB: string
  systemA: string
  systemB: string
}>

export type BlindedBehaviorExport = Readonly<{
  rows: readonly Readonly<{
    scenarioId: string
    responseA: string
    responseB: string
  }>[]
  concealedMapping: Readonly<Record<string, Readonly<{ A: string; B: string }>>>
}>

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

export function createBlindedBehaviorExport(
  pairs: readonly BehaviorPair[],
  seed: number,
): BlindedBehaviorExport {
  const random = seededRandom(seed)
  const rows: Array<{ scenarioId: string; responseA: string; responseB: string }> = []
  const concealedMapping: Record<string, { A: string; B: string }> = {}
  const ids = new Set<string>()
  for (const pair of pairs) {
    if (ids.has(pair.scenarioId)) throw new Error(`duplicate behavior scenario: ${pair.scenarioId}`)
    ids.add(pair.scenarioId)
    const swap = random() >= 0.5
    rows.push({
      scenarioId: pair.scenarioId,
      responseA: swap ? pair.responseB : pair.responseA,
      responseB: swap ? pair.responseA : pair.responseB,
    })
    concealedMapping[pair.scenarioId] = swap
      ? { A: pair.systemB, B: pair.systemA }
      : { A: pair.systemA, B: pair.systemB }
  }
  return { rows, concealedMapping }
}
