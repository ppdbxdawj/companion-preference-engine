import type {
  BaselineInput,
  BaselineOutput,
  EvaluationBaseline,
} from './types.js'

import { PlainMemoryBaseline } from './plain-memory.js'

/**
 * Deliberately ungoverned comparison: the complete consented history is
 * available to one extractor and no candidate lifecycle is applied.
 */
export class FullHistoryBaseline implements EvaluationBaseline {
  readonly id = 'full-history' as const
  readonly governedCandidateState = false
  private readonly delegate = new PlainMemoryBaseline()

  evaluate(input: BaselineInput, signal?: AbortSignal): Promise<BaselineOutput> {
    return this.delegate.evaluate(input, signal)
  }
}
