import type {
  BehaviorGuidance,
  Preference,
  PreferenceScope,
} from '@companion-preference/contracts'

import type { DevelopmentEvaluationCase } from '../schema.js'

export type EvaluatedCandidate = Readonly<{
  preference: Preference
  scope: PreferenceScope
}>

export type BaselineBudget = Readonly<{
  consentedTurnLimit: number
  retrievalItemLimit: number
  generationTokenLimit: number
  backboneId: string
}>

export type BaselineInput = Readonly<{
  evaluationCase: DevelopmentEvaluationCase
  budget: BaselineBudget
  manualProfile?: Readonly<BehaviorGuidance>
}>

export type BaselineOutput = Readonly<{
  candidates: readonly EvaluatedCandidate[]
  guidance: Readonly<BehaviorGuidance>
}>

export interface EvaluationBaseline {
  readonly id:
    | 'no-personalization'
    | 'plain-memory'
    | 'semantic-memory-rag'
    | 'manual-profile'
  readonly governedCandidateState: boolean
  evaluate(input: BaselineInput, signal?: AbortSignal): Promise<BaselineOutput>
}

export interface SemanticMemoryBackbone {
  run(
    input: Readonly<{
      consentedTurns: DevelopmentEvaluationCase['turns']
      queryContext: DevelopmentEvaluationCase['queryContext']
      budget: BaselineBudget
    }>,
    signal?: AbortSignal,
  ): Promise<BaselineOutput>
}
