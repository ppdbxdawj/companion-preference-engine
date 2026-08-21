import type {
  BehaviorGuidance,
  EffectiveProfileQuery,
  Preference,
  PreferenceAuthority,
  PreferenceRecord,
  PreferenceScope,
} from '@companion-preference/contracts'

export type PreferenceKey = Preference['key']

export type ResolutionExclusionReason =
  | 'identity-mismatch'
  | 'inactive-status'
  | 'expired'
  | 'privacy-host-mismatch'
  | 'privacy-domain-mismatch'
  | 'scope-mismatch'
  | 'global-confirmed-not-permitted'
  | 'lower-priority'
  | 'equivalent-duplicate'
  | 'equal-priority-conflict'

export type AppliedPreference = Readonly<{
  recordId: string
  key: PreferenceKey
  preference: Preference
  scope: PreferenceScope
  authority: PreferenceAuthority
}>

export type ExcludedPreference = Readonly<{
  recordId: string
  key: PreferenceKey
  reason: ResolutionExclusionReason
}>

export type PreferenceConflict = Readonly<{
  key: PreferenceKey
  recordIds: readonly string[]
  reason: 'equal-priority-different-values'
}>

export type EffectiveProfileResolution = Readonly<{
  guidance: Readonly<BehaviorGuidance>
  applied: readonly AppliedPreference[]
  excluded: readonly ExcludedPreference[]
  conflicts: readonly PreferenceConflict[]
}>

/** Exact ownership match; host and domain are applicability, not identity. */
export function matchesIdentity(
  record: PreferenceRecord,
  query: EffectiveProfileQuery,
): boolean {
  return record.identity.userId === query.userId && record.identity.companionId === query.companionId && record.identity.relationshipId === query.relationshipId
}

export function matchesPrivacy(
  record: PreferenceRecord,
  query: EffectiveProfileQuery,
): boolean {
  return record.projection.allowedHosts.includes(query.hostId) && record.projection.allowedDomains.includes(query.domain)
}

export function matchesScope(
  record: PreferenceRecord,
  query: EffectiveProfileQuery,
): boolean {
  switch (record.scope.kind) {
    case 'task': return query.taskId === record.scope.taskId
    case 'workspace': return query.workspaceId === record.scope.workspaceId
    case 'host': return query.hostId === record.scope.hostId
    case 'domain': return query.domain === record.scope.domain
    case 'global': return true
  }
}

export function scopeSpecificity(scope: PreferenceScope): number {
  return ({ task: 5, workspace: 4, host: 3, domain: 2, global: 1 })[scope.kind]
}

export function authorityPriority(authority: PreferenceAuthority): number {
  return authority === 'user-set' ? 2 : 1
}

export function resolveEffectiveProfile(
  records: readonly PreferenceRecord[],
  query: EffectiveProfileQuery,
): EffectiveProfileResolution {
  const applied: AppliedPreference[] = []
  const excluded: ExcludedPreference[] = []
  const conflicts: PreferenceConflict[] = []
  const eligible = new Map<PreferenceKey, PreferenceRecord[]>()
  for (const record of records) {
    let reason: ResolutionExclusionReason | undefined
    if (!matchesIdentity(record, query)) reason = 'identity-mismatch'
    else if (record.status !== 'active') reason = 'inactive-status'
    else if (record.expiresAt !== undefined && Date.parse(record.expiresAt) <= Date.parse(query.now)) reason = 'expired'
    else if (!record.projection.allowedHosts.includes(query.hostId)) reason = 'privacy-host-mismatch'
    else if (!record.projection.allowedDomains.includes(query.domain)) reason = 'privacy-domain-mismatch'
    else if (!matchesScope(record, query)) reason = 'scope-mismatch'
    else if (record.scope.kind === 'global' && record.authority === 'user-confirmed') reason = 'global-confirmed-not-permitted'
    if (reason) excluded.push({ recordId: record.id, key: record.preference.key, reason })
    else (eligible.get(record.preference.key) ?? (eligible.set(record.preference.key, []), eligible.get(record.preference.key)!)).push(record)
  }
  for (const [key, candidates] of eligible) {
    const sorted = [...candidates].sort((a, b) => score(b) - score(a) || lexical(a.id, b.id))
    const bestScore = score(sorted[0]!)
    const winners = sorted.filter((record) => score(record) === bestScore)
    const values = new Set(winners.map((record) => record.preference.value))
    if (values.size > 1) {
      const ids = winners.map((record) => record.id).sort(lexical)
      conflicts.push({ key, recordIds: ids, reason: 'equal-priority-different-values' })
      for (const record of winners) excluded.push({ recordId: record.id, key, reason: 'equal-priority-conflict' })
      for (const record of sorted.slice(winners.length)) excluded.push({ recordId: record.id, key, reason: 'lower-priority' })
    } else {
      const winner = winners[0]!
      applied.push({ recordId: winner.id, key, preference: winner.preference, scope: winner.scope, authority: winner.authority })
      for (const record of winners.slice(1)) excluded.push({ recordId: record.id, key, reason: 'equivalent-duplicate' })
      for (const record of sorted.slice(winners.length)) excluded.push({ recordId: record.id, key, reason: 'lower-priority' })
    }
  }
  applied.sort((a, b) => lexical(a.key, b.key) || lexical(a.recordId, b.recordId))
  excluded.sort((a, b) => lexical(a.key, b.key) || lexical(a.recordId, b.recordId))
  conflicts.sort((a, b) => lexical(a.key, b.key) || lexical(a.recordIds.join('\u0000'), b.recordIds.join('\u0000')))
  const guidance: BehaviorGuidance = {}
  const mapping: Record<PreferenceKey, keyof BehaviorGuidance> = { 'interaction.response_detail': 'responseDetail', 'interaction.directness': 'directness', 'interaction.initiative': 'initiative', 'interaction.interruption_policy': 'interruptionPolicy', 'work.approval_style': 'approvalStyle', 'work.verification_depth': 'verificationDepth', 'companion.support_style': 'supportStyle' }
  for (const item of applied) (guidance as Record<string, unknown>)[mapping[item.key]] = item.preference.value
  return { guidance, applied, excluded, conflicts }
}

function lexical(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
function score(record: PreferenceRecord): number { return scopeSpecificity(record.scope) * 10 + authorityPriority(record.authority) }
