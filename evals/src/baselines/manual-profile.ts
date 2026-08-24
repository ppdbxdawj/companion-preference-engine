import type {
  BaselineInput,
  BaselineOutput,
  EvaluationBaseline,
} from './types.js'

export class ManualProfileBaseline implements EvaluationBaseline {
  readonly id = 'manual-profile' as const
  readonly governedCandidateState = false

  async evaluate(
    input: BaselineInput,
    signal?: AbortSignal,
  ): Promise<BaselineOutput> {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    return {
      candidates: [],
      guidance: input.manualProfile ? structuredClone(input.manualProfile) : {},
    }
  }
}
