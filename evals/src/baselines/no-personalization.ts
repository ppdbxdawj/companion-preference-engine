import type {
  BaselineInput,
  BaselineOutput,
  EvaluationBaseline,
} from './types.js'

export class NoPersonalizationBaseline implements EvaluationBaseline {
  readonly id = 'no-personalization' as const
  readonly governedCandidateState = false

  async evaluate(
    _input: BaselineInput,
    signal?: AbortSignal,
  ): Promise<BaselineOutput> {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    return { candidates: [], guidance: {} }
  }
}
