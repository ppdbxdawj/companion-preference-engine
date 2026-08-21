import type { PreferenceKey, EffectiveProfileResolution, ResolutionExclusionReason } from './resolver.js'

export type ResolutionExplanation =
  | Readonly<{
      kind: 'applied'
      key: PreferenceKey
      recordIds: readonly [string]
      reason: 'highest-priority-applicable'
    }>
  | Readonly<{
      kind: 'excluded'
      key: PreferenceKey
      recordIds: readonly [string]
      reason: ResolutionExclusionReason
    }>
  | Readonly<{
      kind: 'conflict'
      key: PreferenceKey
      recordIds: readonly string[]
      reason: 'equal-priority-different-values'
    }>

export function explainResolution(
  result: EffectiveProfileResolution,
): readonly ResolutionExplanation[] {
  const entries: ResolutionExplanation[] = result.applied.map((item) => ({
    kind: 'applied', key: item.key, recordIds: [item.recordId] as [string], reason: 'highest-priority-applicable',
  }))
  for (const item of result.excluded) {
    if (item.reason !== 'equal-priority-conflict') entries.push({
      kind: 'excluded', key: item.key, recordIds: [item.recordId], reason: item.reason,
    })
  }
  for (const item of result.conflicts) entries.push({
    kind: 'conflict', key: item.key, recordIds: [...item.recordIds], reason: item.reason,
  })
  const kindOrder = { applied: 0, excluded: 1, conflict: 2 } as const
  return entries.sort((a, b) => lexical(a.key, b.key) || kindOrder[a.kind] - kindOrder[b.kind] || lexical(a.recordIds.join('\u0000'), b.recordIds.join('\u0000')))
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
