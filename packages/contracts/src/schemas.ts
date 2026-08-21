import * as v from 'valibot'

export type Domain = 'work' | 'companion'

export type HostSourceKind =
  | 'chat-turn'
  | 'explicit-form'
  | 'reference-host-turn'

export type ContentCategory =
  | 'ordinary-conversation'
  | 'code'
  | 'terminal'
  | 'tool-trace'

export type TypedHostSource = {
  kind: HostSourceKind
  contentCategory: ContentCategory
}

export type IdentityContext = {
  userId: string
  companionId: string
  relationshipId: string
  hostId: string
  sessionId: string
  domain: Domain
}

export type CollectionPolicy = {
  allowedSources: TypedHostSource[]
  retainContent: boolean
}

export type OutboundInferenceMode =
  | 'disabled'
  | 'local-only'
  | 'allow-configured-remote'

export type OutboundInferencePolicy =
  | { mode: 'disabled' }
  | { mode: 'local-only'; allowedSources: TypedHostSource[] }
  | {
      mode: 'allow-configured-remote'
      allowedSources: TypedHostSource[]
    }

export type ProjectionPolicy = {
  allowedHosts: string[]
  allowedDomains: Domain[]
}

export type EvidenceConsent = {
  purpose: 'preference-learning'
  policyVersion: string
}

export type EvidenceLearningPayload = {
  userText: string
  assistantText?: string
}

export type EvidencePolicySnapshot = {
  collection: CollectionPolicy
  outboundInference: OutboundInferencePolicy
  projection: ProjectionPolicy
  settingsRevision: number
}

export type InteractionEvidence = {
  schemaVersion: 1
  id: string
  identity: IdentityContext
  occurredAt: string
  sourceRef: string
  source: TypedHostSource
  consent: EvidenceConsent
  learningPayload: EvidenceLearningPayload
  policySnapshot: EvidencePolicySnapshot
}

/**
 * Canonical field representation for the host-namespaced evidence dedup key.
 * Repositories compare all five fields; sourceRef is never globally unique.
 */
export type EvidenceDeduplicationIdentity = {
  userId: string
  companionId: string
  relationshipId: string
  hostId: string
  sourceRef: string
}

export type LiveEvidenceProvenance = {
  state: 'live'
  evidence: InteractionEvidence
}

export type DeletedEvidenceTombstone = {
  state: 'deleted-tombstone'
  evidenceId: string
  deletedAt: string
  reasonCode: string
}

export type EvidenceProvenance =
  | LiveEvidenceProvenance
  | DeletedEvidenceTombstone

export const DomainSchema = v.picklist(['work', 'companion'])

export const HostSourceKindSchema = v.picklist([
  'chat-turn',
  'explicit-form',
  'reference-host-turn',
])

export const ContentCategorySchema = v.picklist([
  'ordinary-conversation',
  'code',
  'terminal',
  'tool-trace',
])

export const TypedHostSourceSchema = v.strictObject({
  kind: HostSourceKindSchema,
  contentCategory: ContentCategorySchema,
})

export const IdentityContextSchema = v.strictObject({
  userId: v.pipe(v.string(), v.nonEmpty()),
  companionId: v.pipe(v.string(), v.nonEmpty()),
  relationshipId: v.pipe(v.string(), v.nonEmpty()),
  hostId: v.pipe(v.string(), v.nonEmpty()),
  sessionId: v.pipe(v.string(), v.nonEmpty()),
  domain: DomainSchema,
})

export const CollectionPolicySchema = v.strictObject({
  allowedSources: v.array(TypedHostSourceSchema),
  retainContent: v.boolean(),
})

export const OutboundInferenceModeSchema = v.picklist([
  'disabled',
  'local-only',
  'allow-configured-remote',
])

export const OutboundInferencePolicySchema = v.variant('mode', [
  v.strictObject({ mode: v.literal('disabled') }),
  v.strictObject({
    mode: v.literal('local-only'),
    allowedSources: v.array(TypedHostSourceSchema),
  }),
  v.strictObject({
    mode: v.literal('allow-configured-remote'),
    allowedSources: v.array(TypedHostSourceSchema),
  }),
])

export const ProjectionPolicySchema = v.strictObject({
  allowedHosts: v.array(v.pipe(v.string(), v.nonEmpty())),
  allowedDomains: v.array(DomainSchema),
})

// T2B RED: the low-tier implementer replaces only these TODO schema bodies.
// The public types and behavioral oracle are frozen by the high tier.
export const EvidenceConsentSchema = v.strictObject({
  purpose: v.literal('preference-learning'),
  policyVersion: v.pipe(v.string(), v.nonEmpty()),
})

export const EvidenceLearningPayloadSchema = v.strictObject({
  userText: v.pipe(v.string(), v.nonEmpty()),
  assistantText: v.optional(v.pipe(v.string(), v.nonEmpty())),
})

export const EvidencePolicySnapshotSchema = v.strictObject({
  collection: CollectionPolicySchema,
  outboundInference: OutboundInferencePolicySchema,
  projection: ProjectionPolicySchema,
  settingsRevision: v.pipe(v.number(), v.integer(), v.minValue(0), v.safeInteger()),
})

export const InteractionEvidenceSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    id: v.pipe(v.string(), v.nonEmpty()),
    identity: IdentityContextSchema,
    occurredAt: v.pipe(v.string(), v.isoTimestamp()),
    sourceRef: v.pipe(v.string(), v.nonEmpty()),
    source: TypedHostSourceSchema,
    consent: EvidenceConsentSchema,
    learningPayload: EvidenceLearningPayloadSchema,
    policySnapshot: EvidencePolicySnapshotSchema,
  }),
  v.check(
    (input) =>
      input.policySnapshot.collection.retainContent &&
      input.policySnapshot.collection.allowedSources.some(
        (allowed) =>
          allowed.kind === input.source.kind &&
          allowed.contentCategory === input.source.contentCategory,
      ),
    'Evidence source must be explicitly collection-authorized with content retention enabled',
  ),
)

export const EvidenceDeduplicationIdentitySchema = v.strictObject({
  userId: v.pipe(v.string(), v.nonEmpty()),
  companionId: v.pipe(v.string(), v.nonEmpty()),
  relationshipId: v.pipe(v.string(), v.nonEmpty()),
  hostId: v.pipe(v.string(), v.nonEmpty()),
  sourceRef: v.pipe(v.string(), v.nonEmpty()),
})

export const LiveEvidenceProvenanceSchema = v.strictObject({
  state: v.literal('live'),
  evidence: InteractionEvidenceSchema,
})

export const DeletedEvidenceTombstoneSchema = v.strictObject({
  state: v.literal('deleted-tombstone'),
  evidenceId: v.pipe(v.string(), v.nonEmpty()),
  deletedAt: v.pipe(v.string(), v.isoTimestamp()),
  reasonCode: v.pipe(v.string(), v.nonEmpty()),
})

export const EvidenceProvenanceSchema = v.variant('state', [
  LiveEvidenceProvenanceSchema,
  DeletedEvidenceTombstoneSchema,
])

export type Preference =
  | {
      key: 'interaction.response_detail'
      value: 'concise' | 'balanced' | 'detailed'
    }
  | {
      key: 'interaction.directness'
      value: 'gentle' | 'balanced' | 'direct'
    }
  | {
      key: 'interaction.initiative'
      value: 'ask_first' | 'low_risk_auto' | 'proactive'
    }
  | {
      key: 'interaction.interruption_policy'
      value: 'never_interrupt' | 'important_only' | 'allowed'
    }
  | {
      key: 'work.approval_style'
      value: 'always_ask' | 'risk_based' | 'review_after'
    }
  | {
      key: 'work.verification_depth'
      value: 'minimal' | 'targeted' | 'exhaustive'
    }
  | {
      key: 'companion.support_style'
      value: 'listen_first' | 'acknowledge_then_act' | 'direct_action'
    }

export type PreferenceScope =
  | { kind: 'task'; taskId: string }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'host'; hostId: string }
  | { kind: 'domain'; domain: Domain }
  | { kind: 'global' }

export type CandidateStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'superseded'
  | 'deleted'

export type PreferenceStatus =
  | 'active'
  | 'superseded'
  | 'revoked'
  | 'deleted'

export type PreferenceAuthority = 'user-set' | 'user-confirmed'

export type PreferenceRiskCategory = 'standard' | 'sensitive'

/**
 * Canonical profile ownership. Host, session, and domain are applicability
 * context and therefore belong to scope/projection/query rather than identity.
 */
export type PreferenceIdentity = {
  userId: string
  companionId: string
  relationshipId: string
}

export type ObserverEvidenceProvenance = {
  kind: 'observer-evidence'
  evidenceIds: string[]
}

/**
 * Provenance for an agent or adapter that can propose, but never confirm, a
 * preference. MCP identity/capability binding is deliberately outside T2C1.
 */
export type ExternalProposalProvenance = {
  kind: 'external-proposal'
  channel: 'runtime-client' | 'mcp'
  proposerId: string
  proposalRef: string
}

export type CandidateProvenance =
  | ObserverEvidenceProvenance
  | ExternalProposalProvenance

/**
 * Stable persisted representation of a candidate idempotency key. The digest
 * is SHA-256 over canonical version-1 JSON containing normalized provenance,
 * preference, scope, and projection fields. Derivation is implemented later.
 */
export type CandidateIdempotencyKey = {
  version: 1
  algorithm: 'sha256'
  digest: string
}

export type PreferenceCandidate = {
  schemaVersion: 1
  id: string
  identity: PreferenceIdentity
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  provenance: CandidateProvenance
  evidenceIds: string[]
  counterEvidenceIds: string[]
  confidence: number
  riskCategory: PreferenceRiskCategory
  status: CandidateStatus
  idempotencyKey: CandidateIdempotencyKey
  revision: number
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export type PendingCandidateProposal = Omit<
  PreferenceCandidate,
  'id' | 'schemaVersion' | 'status' | 'revision' | 'createdAt' | 'updatedAt'
> & {
  status: 'pending_confirmation'
}

export type PreferenceRecord = {
  schemaVersion: 1
  id: string
  identity: PreferenceIdentity
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  authority: PreferenceAuthority
  revision: number
  status: PreferenceStatus
  supersedes?: string
  supersededBy?: string
  evidenceIds: string[]
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export type EffectiveProfileQuery = {
  userId: string
  companionId: string
  relationshipId: string
  hostId: string
  domain: Domain
  workspaceId?: string
  taskId?: string
  now: string
}

export type BehaviorGuidance = {
  responseDetail?: 'concise' | 'balanced' | 'detailed'
  directness?: 'gentle' | 'balanced' | 'direct'
  initiative?: 'ask_first' | 'low_risk_auto' | 'proactive'
  interruptionPolicy?: 'never_interrupt' | 'important_only' | 'allowed'
  approvalStyle?: 'always_ask' | 'risk_based' | 'review_after'
  verificationDepth?: 'minimal' | 'targeted' | 'exhaustive'
  supportStyle?: 'listen_first' | 'acknowledge_then_act' | 'direct_action'
  avoid?: 'generic_reassurance'[]
}

export type SupersededPreferenceExpectation = {
  preferenceId: string
  expectedRevision: number
}

export type ProposeCandidateCommand = {
  actionId: string
  candidateId: string
  identity: PreferenceIdentity
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  provenance: ExternalProposalProvenance
  evidenceIds: string[]
  counterEvidenceIds: string[]
  confidence: number
  riskCategory: PreferenceRiskCategory
  idempotencyKey: CandidateIdempotencyKey
  occurredAt: string
  expiresAt?: string
}

export type ConfirmCandidateCommand = {
  actionId: string
  candidateId: string
  expectedCandidateRevision: number
  preferenceId: string
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  supersedesPreference?: SupersededPreferenceExpectation
  occurredAt: string
}

export type RejectCandidateCommand = {
  actionId: string
  candidateId: string
  expectedCandidateRevision: number
  occurredAt: string
  reasonCode?: string
}

export type DeleteCandidateCommand = {
  actionId: string
  candidateId: string
  expectedCandidateRevision: number
  occurredAt: string
  reasonCode: string
}

export type SuppressCandidateCommand = {
  actionId: string
  candidateId: string
  expectedCandidateRevision: number
  suppressionId: string
  occurredAt: string
  reasonCode?: string
}

export type CreateExplicitPreferenceCommand = {
  actionId: string
  preferenceId: string
  identity: PreferenceIdentity
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  expectedNoActivePreference: true
  evidenceIds: string[]
  occurredAt: string
  expiresAt?: string
}

export type RevisePreferenceCommand = {
  actionId: string
  preferenceId: string
  expectedPreferenceRevision: number
  replacementPreferenceId: string
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  evidenceIds: string[]
  occurredAt: string
  expiresAt?: string
}

export type RevokePreferenceCommand = {
  actionId: string
  preferenceId: string
  expectedPreferenceRevision: number
  occurredAt: string
  reasonCode?: string
}

export type GovernanceMutationKind =
  | 'propose-candidate'
  | 'confirm-candidate'
  | 'reject-candidate'
  | 'delete-candidate'
  | 'suppress-candidate'
  | 'create-explicit-preference'
  | 'revise-preference'
  | 'revoke-preference'

export type MutationReceiptResult =
  | { kind: 'candidate'; candidateId: string; revision: number }
  | { kind: 'preference'; preferenceId: string; revision: number }
  | { kind: 'none' }

export type MutationReceipt = {
  actionId: string
  mutation: GovernanceMutationKind
  payloadHash: string
  result: MutationReceiptResult
  recordedAt: string
}

// TODO(T2C1): replace only these compile-valid permissive schema bodies. The
// public types and behavioral RED oracles are owned and frozen by the high tier.
const id = v.pipe(v.string(), v.nonEmpty())
const iso = v.pipe(v.string(), v.isoTimestamp())
const rev0 = v.pipe(v.number(), v.integer(), v.minValue(0), v.safeInteger())
const rev1 = v.pipe(v.number(), v.integer(), v.minValue(1), v.safeInteger())
const finite01 = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1))
const nonemptyIds = v.array(id)
const PreferenceKeySchema = v.picklist(['interaction.response_detail','interaction.directness','interaction.initiative','interaction.interruption_policy','work.approval_style','work.verification_depth','companion.support_style'])
const PreferenceValueSchemas = {
  'interaction.response_detail': v.picklist(['concise','balanced','detailed']),
  'interaction.directness': v.picklist(['gentle','balanced','direct']),
  'interaction.initiative': v.picklist(['ask_first','low_risk_auto','proactive']),
  'interaction.interruption_policy': v.picklist(['never_interrupt','important_only','allowed']),
  'work.approval_style': v.picklist(['always_ask','risk_based','review_after']),
  'work.verification_depth': v.picklist(['minimal','targeted','exhaustive']),
  'companion.support_style': v.picklist(['listen_first','acknowledge_then_act','direct_action']),
} as const
export const PreferenceSchema = v.variant('key', Object.entries(PreferenceValueSchemas).map(([key,value]) => v.strictObject({key:v.literal(key),value})) as any) as unknown as v.GenericSchema<Preference>
export const PreferenceScopeSchema = v.variant('kind', [v.strictObject({kind:v.literal('task'),taskId:id}),v.strictObject({kind:v.literal('workspace'),workspaceId:id}),v.strictObject({kind:v.literal('host'),hostId:id}),v.strictObject({kind:v.literal('domain'),domain:DomainSchema}),v.strictObject({kind:v.literal('global')})]) as unknown as v.GenericSchema<PreferenceScope>
export const CandidateStatusSchema = v.picklist(['pending_confirmation','confirmed','rejected','superseded','deleted'])
export const PreferenceStatusSchema = v.picklist(['active','superseded','revoked','deleted'])
export const PreferenceAuthoritySchema = v.picklist(['user-set','user-confirmed'])
export const PreferenceRiskCategorySchema = v.picklist(['standard','sensitive'])
export const PreferenceIdentitySchema = v.strictObject({userId:id,companionId:id,relationshipId:id})
export const ObserverEvidenceProvenanceSchema = v.strictObject({kind:v.literal('observer-evidence'),evidenceIds:v.pipe(v.array(id),v.minLength(1))})
export const ExternalProposalProvenanceSchema = v.strictObject({kind:v.literal('external-proposal'),channel:v.picklist(['runtime-client','mcp']),proposerId:id,proposalRef:id})
export const CandidateProvenanceSchema = v.variant('kind',[ObserverEvidenceProvenanceSchema,ExternalProposalProvenanceSchema])
export const CandidateIdempotencyKeySchema = v.strictObject({version:v.literal(1),algorithm:v.literal('sha256'),digest:v.pipe(v.string(),v.regex(/^[0-9a-f]{64}$/))})
export const PreferenceCandidateSchema = v.pipe(v.strictObject({schemaVersion:v.literal(1),id,identity:PreferenceIdentitySchema,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,provenance:CandidateProvenanceSchema,evidenceIds:nonemptyIds,counterEvidenceIds:nonemptyIds,confidence:finite01,riskCategory:PreferenceRiskCategorySchema,status:CandidateStatusSchema,idempotencyKey:CandidateIdempotencyKeySchema,revision:rev0,createdAt:iso,updatedAt:iso,expiresAt:v.optional(iso)}),v.check(x => x.provenance.kind !== 'observer-evidence' || JSON.stringify(x.evidenceIds) === JSON.stringify(x.provenance.evidenceIds)))
export const PendingCandidateProposalSchema = v.strictObject({preference:PreferenceSchema,identity:PreferenceIdentitySchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,provenance:CandidateProvenanceSchema,evidenceIds:nonemptyIds,counterEvidenceIds:nonemptyIds,confidence:finite01,riskCategory:PreferenceRiskCategorySchema,idempotencyKey:CandidateIdempotencyKeySchema,status:v.literal('pending_confirmation')}) as unknown as v.GenericSchema<PendingCandidateProposal>
export const PreferenceRecordSchema = v.pipe(v.strictObject({schemaVersion:v.literal(1),id,identity:PreferenceIdentitySchema,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,authority:PreferenceAuthoritySchema,revision:rev1,status:PreferenceStatusSchema,supersedes:v.optional(id),supersededBy:v.optional(id),evidenceIds:v.array(id),createdAt:iso,updatedAt:iso,expiresAt:v.optional(iso)}),v.check(x => (x.revision===1 ? x.supersedes===undefined : x.supersedes!==undefined && x.supersedes!==x.id) && (x.status==='superseded' ? x.supersededBy!==undefined && x.supersededBy!==x.id : x.supersededBy===undefined)))
export const EffectiveProfileQuerySchema = v.strictObject({userId:id,companionId:id,relationshipId:id,hostId:id,domain:DomainSchema,workspaceId:v.optional(id),taskId:v.optional(id),now:iso})
export const BehaviorGuidanceSchema = v.strictObject({responseDetail:v.optional(PreferenceValueSchemas['interaction.response_detail']),directness:v.optional(PreferenceValueSchemas['interaction.directness']),initiative:v.optional(PreferenceValueSchemas['interaction.initiative']),interruptionPolicy:v.optional(PreferenceValueSchemas['interaction.interruption_policy']),approvalStyle:v.optional(PreferenceValueSchemas['work.approval_style']),verificationDepth:v.optional(PreferenceValueSchemas['work.verification_depth']),supportStyle:v.optional(PreferenceValueSchemas['companion.support_style']),avoid:v.optional(v.array(v.literal('generic_reassurance')))})
export const SupersededPreferenceExpectationSchema = v.strictObject({preferenceId:id,expectedRevision:rev1})
const baseCommand = {actionId:id,occurredAt:iso}
export const ProposeCandidateCommandSchema = v.strictObject({...baseCommand,candidateId:id,identity:PreferenceIdentitySchema,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,provenance:ExternalProposalProvenanceSchema,evidenceIds:v.array(id),counterEvidenceIds:v.array(id),confidence:finite01,riskCategory:PreferenceRiskCategorySchema,idempotencyKey:CandidateIdempotencyKeySchema,expiresAt:v.optional(iso)})
export const ConfirmCandidateCommandSchema = v.strictObject({...baseCommand,candidateId:id,expectedCandidateRevision:rev0,preferenceId:id,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,supersedesPreference:v.optional(SupersededPreferenceExpectationSchema)})
export const RejectCandidateCommandSchema = v.strictObject({...baseCommand,candidateId:id,expectedCandidateRevision:rev0,reasonCode:v.optional(id)})
export const DeleteCandidateCommandSchema = v.strictObject({...baseCommand,candidateId:id,expectedCandidateRevision:rev0,reasonCode:id})
export const SuppressCandidateCommandSchema = v.strictObject({...baseCommand,candidateId:id,expectedCandidateRevision:rev0,suppressionId:id,reasonCode:v.optional(id)})
export const CreateExplicitPreferenceCommandSchema = v.strictObject({...baseCommand,preferenceId:id,identity:PreferenceIdentitySchema,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,expectedNoActivePreference:v.literal(true),evidenceIds:v.array(id),expiresAt:v.optional(iso)})
export const RevisePreferenceCommandSchema = v.pipe(v.strictObject({...baseCommand,preferenceId:id,expectedPreferenceRevision:rev1,replacementPreferenceId:id,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,evidenceIds:v.array(id),expiresAt:v.optional(iso)}),v.check(x=>x.replacementPreferenceId!==x.preferenceId))
export const RevokePreferenceCommandSchema = v.strictObject({...baseCommand,preferenceId:id,expectedPreferenceRevision:rev1,reasonCode:v.optional(id)})
export const GovernanceMutationKindSchema = v.picklist(['propose-candidate','confirm-candidate','reject-candidate','delete-candidate','suppress-candidate','create-explicit-preference','revise-preference','revoke-preference'])
export const MutationReceiptResultSchema = v.variant('kind',[v.strictObject({kind:v.literal('candidate'),candidateId:id,revision:rev0}),v.strictObject({kind:v.literal('preference'),preferenceId:id,revision:rev1}),v.strictObject({kind:v.literal('none')})])
export const MutationReceiptSchema = v.strictObject({actionId:id,mutation:GovernanceMutationKindSchema,payloadHash:v.pipe(v.string(),v.regex(/^[0-9a-f]{64}$/)),result:MutationReceiptResultSchema,recordedAt:iso})
