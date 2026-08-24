import type { DevelopmentEvaluationCase, EvaluationTurn } from './schema.js'

export type M1DatasetCompositionInput = Readonly<{
  qualityCases: readonly DevelopmentEvaluationCase[]
  backgroundTurns: readonly EvaluationTurn[]
}>

export type M1DatasetComposition = Readonly<{
  qualityCaseCount: number
  backgroundTurnCount: number
  categoryCounts: Readonly<Record<DevelopmentEvaluationCase['category'], number>>
}>

export function validateM1DatasetComposition(
  input: M1DatasetCompositionInput,
): M1DatasetComposition {
  const minimums: Record<DevelopmentEvaluationCase['category'], number> = {
    'work-explicit-or-repeated': 15,
    'temporary-state': 10,
    'conflict-or-change': 10,
    'ambiguous-abstention': 10,
    'cross-domain-counterfactual': 30,
  }
  const categoryCounts = Object.fromEntries(
    Object.keys(minimums).map((category) => [category, 0]),
  ) as Record<DevelopmentEvaluationCase['category'], number>
  const ids = new Set<string>()
  const pairCounts = new Map<string, { total: number; domains: Set<string> }>()
  for (const item of input.qualityCases) {
    if (ids.has(item.id)) throw new Error(`duplicate quality case id: ${item.id}`)
    ids.add(item.id)
    categoryCounts[item.category] += 1
    if (item.category === 'cross-domain-counterfactual') {
      if (!item.counterfactualPairId) throw new Error('cross-domain counterfactual pair is missing an id')
      const pair = pairCounts.get(item.counterfactualPairId) ?? { total: 0, domains: new Set<string>() }
      pair.total += 1
      pair.domains.add(item.queryContext.domain)
      pairCounts.set(item.counterfactualPairId, pair)
    }
  }
  for (const [category, minimum] of Object.entries(minimums) as Array<[DevelopmentEvaluationCase['category'], number]>) {
    if (categoryCounts[category] < minimum) {
      throw new Error(`${category} minimum is ${minimum}`)
    }
  }
  if (pairCounts.size < 15) throw new Error('cross-domain counterfactual minimum requires 15 pairs')
  for (const [pairId, pair] of pairCounts) {
    if (pair.total !== 2 || pair.domains.size !== 2) {
      throw new Error(`counterfactual pair ${pairId} must contain work and companion cases`)
    }
  }
  if (input.backgroundTurns.length < 100) throw new Error('background dataset requires at least 100 turns')
  const backgroundRefs = new Set<string>()
  for (const turn of input.backgroundTurns) {
    if (!turn.sourceRef || !turn.text.trim()) throw new Error('background turn must contain sourceRef and text')
    if (backgroundRefs.has(turn.sourceRef)) throw new Error(`duplicate background sourceRef: ${turn.sourceRef}`)
    backgroundRefs.add(turn.sourceRef)
  }
  return {
    qualityCaseCount: input.qualityCases.length,
    backgroundTurnCount: input.backgroundTurns.length,
    categoryCounts,
  }
}
