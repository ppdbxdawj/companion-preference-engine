import type {
  BehaviorGuidance,
  EffectiveProfileQuery,
  Preference,
  PreferenceScope,
} from '@companion-preference/contracts'

export const evaluationCategories = [
  'work-explicit-or-repeated',
  'temporary-state',
  'conflict-or-change',
  'ambiguous-abstention',
  'cross-domain-counterfactual',
] as const
export type EvaluationCategory = (typeof evaluationCategories)[number]

export const preferenceKeys = [
  'interaction.response_detail',
  'interaction.directness',
  'interaction.initiative',
  'interaction.interruption_policy',
  'work.approval_style',
  'work.verification_depth',
  'companion.support_style',
] as const satisfies readonly Preference['key'][]

export type EvaluationTurn = Readonly<{
  sourceRef: string
  role: 'user' | 'assistant'
  text: string
}>

export type ExpectedCandidate = Readonly<{
  preference: Preference
  scope: PreferenceScope
  evidenceSourceRefs: readonly string[]
  counterEvidenceSourceRefs: readonly string[]
}>

export type DevelopmentEvaluationCase = Readonly<{
  schemaVersion: 1
  id: string
  category: EvaluationCategory
  counterfactualPairId?: string
  turns: readonly EvaluationTurn[]
  expectedCandidates: readonly ExpectedCandidate[]
  forbiddenKeys: readonly Preference['key'][]
  queryContext: EffectiveProfileQuery
  expectedGuidance: Readonly<BehaviorGuidance>
}>

export type HeldOutEvaluationInput = Readonly<{
  schemaVersion: 1
  id: string
  category: EvaluationCategory
  counterfactualPairId?: string
  turns: readonly EvaluationTurn[]
  queryContext: EffectiveProfileQuery
}>

export type DatasetManifestEntry = Readonly<{
  path: string
  kind: 'development' | 'held-out-input'
  caseCount: number
  sha256: string
}>

export type DatasetManifest = Readonly<{
  schemaVersion: 1
  frozenAt: string
  datasets: readonly DatasetManifestEntry[]
  externalHeldOutLabels: Readonly<{
    caseCount: number
    sha256: string
    storage: 'external-high-tier-only'
  }>
  labelChangePolicy: 'new-manifest-version-and-reviewed-gold-correction'
}>

/** Runtime validators in load.ts must enforce these exact v1 invariants. */
export const evaluationSchemaV1 = Object.freeze({
  stableIdPattern: '^[a-z0-9][a-z0-9-]+$',
  sha256Pattern: '^[0-9a-f]{64}$',
  rejectUnknownFields: true,
  rejectBlankJsonlLines: true,
  uniqueTurnSourceRefsPerCase: true,
  candidateEvidenceRefsMustExistInCase: true,
  crossDomainPairIdRequiredOnlyForCrossDomainCategory: true,
} as const)
