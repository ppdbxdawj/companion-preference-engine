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
