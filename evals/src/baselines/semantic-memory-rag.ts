import type {
  BaselineInput,
  BaselineOutput,
  EvaluationBaseline,
  SemanticMemoryBackbone,
} from './types.js'

export class SemanticMemoryRagBaseline implements EvaluationBaseline {
  readonly id = 'semantic-memory-rag' as const
  readonly governedCandidateState = false

  private readonly backbone: SemanticMemoryBackbone

  constructor(backbone: SemanticMemoryBackbone) {
    this.backbone = backbone
  }

  async evaluate(
    input: BaselineInput,
    signal?: AbortSignal,
  ): Promise<BaselineOutput> {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    return this.backbone.run({
      consentedTurns: input.evaluationCase.turns,
      queryContext: input.evaluationCase.queryContext,
      budget: input.budget,
    }, signal)
  }
}
