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
  /** Mutable optimistic-concurrency revision, independent of lineage. */
  revision: number
  status: PreferenceStatus
  /** Prior record replaced by this record, only for a real lineage edge. */
  supersedes?: string
  /** Replacement record, present only after this record is superseded. */
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

/**
 * Explicit destructive governance action. Evidence has no mutable revision, so
 * action-receipt replay is its fence; settings revisions must not block erasure.
 */
export type DeleteEvidenceCommand = {
  actionId: string
  evidenceId: string
  identity: PreferenceIdentity
  occurredAt: string
  auditEventId: string
  revokeDependentPreferences: boolean
}

/** Content-free outcome safe for mutation receipts and HTTP responses. */
export type DeleteEvidenceResult = {
  kind: 'evidence-deletion'
  evidenceId: string
  disposition: 'deleted' | 'already-deleted'
  tombstoneCreated: boolean
  deletedPendingCandidateIds: string[]
  revokedPreferenceIds: string[]
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
  | 'update-connection-settings'
  | 'report-projection-status'
  | 'delete-evidence'

export type MutationReceiptResult =
  | { kind: 'candidate'; candidateId: string; revision: number }
  | { kind: 'preference'; preferenceId: string; revision: number }
  | { kind: 'none' }
  | DeleteEvidenceResult

export type MutationReceipt = {
  actionId: string
  mutation: GovernanceMutationKind
  payloadHash: string
  result: MutationReceiptResult
  recordedAt: string
}

export type AdapterConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export type ProjectionDeliveryState =
  | 'locally-written'
  | 'verified-applied'
  | 'tombstone-locally-written'
  | 'verified-guidance-absent'
  | 'error'

export type ProjectionDetailCode =
  | 'guidance-local-write-completed'
  | 'guidance-snapshot-verified'
  | 'tombstone-local-write-completed'
  | 'guidance-absence-snapshot-verified'
  | 'guidance-absence-manually-verified'
  | 'transport-write-failed'
  | 'verification-failed'
  | 'transport-disconnected'
  | 'runtime-unavailable'

type AdapterProjectionStatusBase = {
  schemaVersion: 1
  identity: PreferenceIdentity
  hostId: string
  domain: Domain
  settingsRevision: number
  connectionState: AdapterConnectionState
  lastAttemptAt: string
  detailCode: ProjectionDetailCode
  reportedAt: string
}

/**
 * Adapter-reported delivery truth for one profile owner, host, and domain.
 * A local write is deliberately distinct from verified application, and a
 * blank tombstone write is deliberately distinct from verified absence.
 */
export type AdapterProjectionStatus = AdapterProjectionStatusBase &
  (
    | {
        state: 'locally-written' | 'verified-applied'
        lastGuidanceHash: string
      }
    | {
        state:
          | 'tombstone-locally-written'
          | 'verified-guidance-absent'
        lastGuidanceHash?: never
      }
    | { state: 'error'; lastGuidanceHash?: string }
  )

/**
 * Canonical connection settings are owned by the stable profile identity plus
 * host. Session and domain are event/query applicability, not connection
 * ownership. A retained projection status may lag, but never lead, revision.
 */
export type ConnectionSettings = {
  schemaVersion: 1
  identity: PreferenceIdentity
  hostId: string
  collectionPolicy: CollectionPolicy
  outboundInferencePolicy: OutboundInferencePolicy
  projectionPolicy: ProjectionPolicy
  observeEnabled: boolean
  learnEnabled: boolean
  applyEnabled: boolean
  revision: number
  projectionStatus?: AdapterProjectionStatus
  updatedAt: string
}

export type UpdateConnectionSettingsCommand = {
  actionId: string
  identity: PreferenceIdentity
  hostId: string
  expectedSettingsRevision: number
  patch: {
    collectionPolicy?: CollectionPolicy
    outboundInferencePolicy?: OutboundInferencePolicy
    projectionPolicy?: ProjectionPolicy
    observeEnabled?: boolean
    learnEnabled?: boolean
    applyEnabled?: boolean
  }
  occurredAt: string
}

type ProjectionStatusReportBase = {
  actionId: string
  identity: PreferenceIdentity
  hostId: string
  domain: Domain
  expectedSettingsRevision: number
  connectionState: AdapterConnectionState
  lastAttemptAt: string
  detailCode: ProjectionDetailCode
  occurredAt: string
}

export type ReportProjectionStatusCommand = ProjectionStatusReportBase &
  (
    | {
        state: 'locally-written' | 'verified-applied'
        lastGuidanceHash: string
      }
    | {
        state:
          | 'tombstone-locally-written'
          | 'verified-guidance-absent'
        lastGuidanceHash?: never
      }
    | { state: 'error'; lastGuidanceHash?: string }
  )

export type ContentFreePolicyStage =
  | 'collection'
  | 'learning'
  | 'outbound-inference'
  | 'projection'

export type ContentFreePolicyOutcome = 'denied' | 'discarded'

export type ContentFreePolicyReasonCode =
  | 'observe-disabled'
  | 'collection-disabled'
  | 'learning-disabled'
  | 'outbound-inference-disabled'
  | 'outbound-source-not-allowed'
  | 'projection-disabled'
  | 'projection-scope-not-allowed'
  | 'stale-settings-revision'
  | 'late-result-discarded'

/**
 * A deliberately content-free audit input. It identifies only the connection,
 * domain, canonical settings revision, decision class, and fixed reason code.
 */
export type ContentFreePolicyDecision = {
  schemaVersion: 1
  decisionId: string
  identity: PreferenceIdentity
  hostId: string
  domain: Domain
  settingsRevision: number
  stage: ContentFreePolicyStage
  outcome: ContentFreePolicyOutcome
  reasonCode: ContentFreePolicyReasonCode
  occurredAt: string
}

export type McpOperation =
  | 'read-effective-profile'
  | 'explain-preference'
  | 'list-pending-candidates'
  | 'propose-pending-candidate'

export type McpCapability = {
  allowedDomains: Domain[]
  allowedOperations: McpOperation[]
}

/** Configured by the MCP process; never accepted from tool arguments. */
export type McpPrincipal = {
  schemaVersion: 1
  principalId: string
  identity: PreferenceIdentity
  hostId: string
  capability: McpCapability
}

/** Causal initiator of a transition; never merely the audit-row writer. */
export type AuditActor =
  | 'user'
  | 'observer'
  | 'runtime'
  | 'adapter'
  | 'mcp-agent'

export type AuditEventKind =
  | 'evidence-ingested'
  | 'evidence-processing-completed'
  | 'evidence-deleted'
  | 'candidate-proposed'
  | 'candidate-confirmed'
  | 'candidate-rejected'
  | 'candidate-deleted'
  | 'candidate-suppressed'
  | 'preference-created'
  | 'preference-revised'
  | 'preference-revoked'
  | 'connection-settings-updated'
  | 'projection-status-reported'
  | 'policy-decision-recorded'
  | 'processing-failed'

export type AuditReasonCode =
  | 'accepted'
  | 'duplicate'
  | 'user-requested'
  | 'not-a-preference'
  | 'do-not-suggest-again'
  | 'superseded'
  | 'observe-disabled'
  | 'collection-disabled'
  | 'learning-disabled'
  | 'outbound-inference-disabled'
  | 'outbound-source-not-allowed'
  | 'projection-disabled'
  | 'projection-scope-not-allowed'
  | 'stale-settings-revision'
  | 'late-result-discarded'
  | 'invalid-observer-output'
  | 'retry-exhausted'
  | 'transport-write-failed'
  | 'verification-failed'
  | 'transport-disconnected'
  | 'runtime-unavailable'

export type AuditEntityReference =
  | { kind: 'evidence'; evidenceId: string }
  | { kind: 'candidate'; candidateId: string }
  | { kind: 'preference'; preferenceId: string }
  | { kind: 'connection'; hostId: string }
  | { kind: 'policy-decision'; decisionId: string }

type AuditEventBase = {
  schemaVersion: 1
  id: string
  identity: PreferenceIdentity
  actor: AuditActor
  occurredAt: string
}

/**
 * `actor` is the causal initiator of the transition, not the Runtime process
 * that persists the audit row. The union is append-only, content-free, and
 * closed over valid actor/kind/entity/reason/fence combinations.
 */
export type AuditEvent = AuditEventBase &
  (
    | {
        actor: 'adapter'
        kind: 'evidence-ingested'
        reasonCode: 'accepted' | 'duplicate'
        entity: Extract<AuditEntityReference, { kind: 'evidence' }>
      }
    | {
        actor: 'observer'
        kind: 'evidence-processing-completed'
        reasonCode: 'accepted' | 'stale-settings-revision' | 'late-result-discarded'
        entity: Extract<AuditEntityReference, { kind: 'evidence' }>
        settingsRevision: number
      }
    | {
        actor: 'user'
        kind: 'evidence-deleted'
        reasonCode: 'user-requested'
        entity: Extract<AuditEntityReference, { kind: 'evidence' }>
        actionId: string
      }
    | {
        actor: 'observer' | 'runtime'
        kind: 'processing-failed'
        reasonCode: 'invalid-observer-output' | 'retry-exhausted'
        entity: Extract<AuditEntityReference, { kind: 'evidence' }>
        settingsRevision: number
      }
    | {
        actor: 'observer'
        kind: 'candidate-proposed'
        reasonCode: 'accepted' | 'duplicate'
        entity: Extract<AuditEntityReference, { kind: 'candidate' }>
        revision: number
      }
    | {
        actor: 'mcp-agent' | 'user'
        kind: 'candidate-proposed'
        reasonCode: 'accepted' | 'duplicate'
        entity: Extract<AuditEntityReference, { kind: 'candidate' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'candidate-confirmed'
        reasonCode: 'accepted'
        entity: Extract<AuditEntityReference, { kind: 'candidate' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'candidate-rejected'
        reasonCode: 'not-a-preference' | 'user-requested'
        entity: Extract<AuditEntityReference, { kind: 'candidate' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'candidate-deleted'
        reasonCode: 'user-requested'
        entity: Extract<AuditEntityReference, { kind: 'candidate' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'candidate-suppressed'
        reasonCode: 'do-not-suggest-again'
        entity: Extract<AuditEntityReference, { kind: 'candidate' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'preference-created'
        reasonCode: 'accepted'
        entity: Extract<AuditEntityReference, { kind: 'preference' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'preference-revised'
        reasonCode: 'superseded'
        entity: Extract<AuditEntityReference, { kind: 'preference' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'preference-revoked'
        reasonCode: 'user-requested'
        entity: Extract<AuditEntityReference, { kind: 'preference' }>
        actionId: string
        revision: number
      }
    | {
        actor: 'user'
        kind: 'connection-settings-updated'
        reasonCode: 'accepted'
        entity: Extract<AuditEntityReference, { kind: 'connection' }>
        actionId: string
        settingsRevision: number
      }
    | {
        actor: 'adapter'
        kind: 'projection-status-reported'
        reasonCode:
          | 'accepted'
          | 'transport-write-failed'
          | 'verification-failed'
          | 'transport-disconnected'
          | 'runtime-unavailable'
        entity: Extract<AuditEntityReference, { kind: 'connection' }>
        actionId: string
        settingsRevision: number
      }
    | {
        actor: 'adapter' | 'runtime'
        kind: 'policy-decision-recorded'
        reasonCode: ContentFreePolicyReasonCode
        entity: Extract<AuditEntityReference, { kind: 'policy-decision' }>
        settingsRevision: number
      }
  )

export type AuditQuery = {
  identity: PreferenceIdentity
  actors?: AuditActor[]
  kinds?: AuditEventKind[]
  entity?: AuditEntityReference
  occurredAtOrAfter?: string
  occurredBefore?: string
  limit?: number
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
// Record revision is independent from the optional lineage edge.
export const PreferenceRecordSchema = v.pipe(v.strictObject({schemaVersion:v.literal(1),id,identity:PreferenceIdentitySchema,preference:PreferenceSchema,scope:PreferenceScopeSchema,projection:ProjectionPolicySchema,authority:PreferenceAuthoritySchema,revision:rev1,status:PreferenceStatusSchema,supersedes:v.optional(id),supersededBy:v.optional(id),evidenceIds:v.array(id),createdAt:iso,updatedAt:iso,expiresAt:v.optional(iso)}),v.check(x => x.supersedes!==x.id && (x.status==='superseded' ? x.supersededBy!==undefined && x.supersededBy!==x.id : x.supersededBy===undefined)))
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
export const DeleteEvidenceCommandSchema = v.strictObject({
  ...baseCommand,
  evidenceId: id,
  identity: PreferenceIdentitySchema,
  auditEventId: id,
  revokeDependentPreferences: v.boolean(),
}) as v.GenericSchema<DeleteEvidenceCommand>
const deleteEvidenceResultSchema = v.strictObject({
  kind: v.literal('evidence-deletion'),
  evidenceId: id,
  disposition: v.picklist(['deleted', 'already-deleted']),
  tombstoneCreated: v.boolean(),
  deletedPendingCandidateIds: v.pipe(v.array(id), v.check(values => new Set(values).size === values.length)),
  revokedPreferenceIds: v.pipe(v.array(id), v.check(values => new Set(values).size === values.length)),
})
export const DeleteEvidenceResultSchema = deleteEvidenceResultSchema as v.GenericSchema<DeleteEvidenceResult>
export const GovernanceMutationKindSchema = v.picklist(['propose-candidate','confirm-candidate','reject-candidate','delete-candidate','suppress-candidate','create-explicit-preference','revise-preference','revoke-preference','update-connection-settings','report-projection-status','delete-evidence']) as unknown as v.GenericSchema<GovernanceMutationKind>
export const MutationReceiptResultSchema = v.variant('kind',[v.strictObject({kind:v.literal('candidate'),candidateId:id,revision:rev0}),v.strictObject({kind:v.literal('preference'),preferenceId:id,revision:rev1}),v.strictObject({kind:v.literal('none')}),deleteEvidenceResultSchema]) as unknown as v.GenericSchema<MutationReceiptResult>
export const MutationReceiptSchema = v.strictObject({actionId:id,mutation:GovernanceMutationKindSchema,payloadHash:v.pipe(v.string(),v.regex(/^[0-9a-f]{64}$/)),result:MutationReceiptResultSchema,recordedAt:iso}) as v.GenericSchema<MutationReceipt>

// TODO(T2C2A): the low-tier implementer replaces only the schema bodies in this
// region. Public types, fixtures, and behavioral RED oracles are high-tier
// owned.
const sha256 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))
export const AdapterConnectionStateSchema = v.picklist(['connecting', 'connected', 'disconnected', 'reconnecting', 'error']) as v.GenericSchema<AdapterConnectionState>
export const ProjectionDeliveryStateSchema = v.picklist([
  'locally-written',
  'verified-applied',
  'tombstone-locally-written',
  'verified-guidance-absent',
  'error',
]) as v.GenericSchema<ProjectionDeliveryState>
export const ProjectionDetailCodeSchema = v.picklist([
  'guidance-local-write-completed',
  'guidance-snapshot-verified',
  'tombstone-local-write-completed',
  'guidance-absence-snapshot-verified',
  'guidance-absence-manually-verified',
  'transport-write-failed',
  'verification-failed',
  'transport-disconnected',
  'runtime-unavailable',
]) as v.GenericSchema<ProjectionDetailCode>
export const AdapterProjectionStatusSchema = v.union([
  v.strictObject({
    schemaVersion: v.literal(1),
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.literal('guidance-local-write-completed'),
    reportedAt: iso,
    state: v.literal('locally-written'),
    lastGuidanceHash: sha256,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.literal('guidance-snapshot-verified'),
    reportedAt: iso,
    state: v.literal('verified-applied'),
    lastGuidanceHash: sha256,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.literal('tombstone-local-write-completed'),
    reportedAt: iso,
    state: v.literal('tombstone-locally-written'),
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.picklist(['guidance-absence-snapshot-verified', 'guidance-absence-manually-verified']),
    reportedAt: iso,
    state: v.literal('verified-guidance-absent'),
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.picklist(['transport-write-failed', 'verification-failed', 'transport-disconnected', 'runtime-unavailable']),
    reportedAt: iso,
    state: v.literal('error'),
    lastGuidanceHash: v.optional(sha256),
  }),
]) as v.GenericSchema<AdapterProjectionStatus>
export const ConnectionSettingsSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    identity: PreferenceIdentitySchema,
    hostId: id,
    collectionPolicy: CollectionPolicySchema,
    outboundInferencePolicy: OutboundInferencePolicySchema,
    projectionPolicy: ProjectionPolicySchema,
    observeEnabled: v.boolean(),
    learnEnabled: v.boolean(),
    applyEnabled: v.boolean(),
    revision: rev0,
    projectionStatus: v.optional(AdapterProjectionStatusSchema),
    updatedAt: iso,
  }),
  v.check((input) => {
    if (!input.projectionStatus) return true
    return (
      input.projectionStatus.identity.userId === input.identity.userId &&
      input.projectionStatus.identity.companionId === input.identity.companionId &&
      input.projectionStatus.identity.relationshipId === input.identity.relationshipId &&
      input.projectionStatus.hostId === input.hostId &&
      input.projectionStatus.settingsRevision <= input.revision
    )
  }),
) as v.GenericSchema<ConnectionSettings>
export const UpdateConnectionSettingsCommandSchema = v.strictObject({
  actionId: id,
  identity: PreferenceIdentitySchema,
  hostId: id,
  expectedSettingsRevision: rev0,
  patch: v.pipe(
    v.strictObject({
      collectionPolicy: v.optional(CollectionPolicySchema),
      outboundInferencePolicy: v.optional(OutboundInferencePolicySchema),
      projectionPolicy: v.optional(ProjectionPolicySchema),
      observeEnabled: v.optional(v.boolean()),
      learnEnabled: v.optional(v.boolean()),
      applyEnabled: v.optional(v.boolean()),
    }),
    v.check((patch) => Object.keys(patch).length > 0),
  ),
  occurredAt: iso,
}) as v.GenericSchema<UpdateConnectionSettingsCommand>
export const ReportProjectionStatusCommandSchema = v.union([
  v.strictObject({
    actionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    expectedSettingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.literal('guidance-local-write-completed'),
    occurredAt: iso,
    state: v.literal('locally-written'),
    lastGuidanceHash: sha256,
  }),
  v.strictObject({
    actionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    expectedSettingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.literal('guidance-snapshot-verified'),
    occurredAt: iso,
    state: v.literal('verified-applied'),
    lastGuidanceHash: sha256,
  }),
  v.strictObject({
    actionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    expectedSettingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.literal('tombstone-local-write-completed'),
    occurredAt: iso,
    state: v.literal('tombstone-locally-written'),
  }),
  v.strictObject({
    actionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    expectedSettingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.picklist(['guidance-absence-snapshot-verified', 'guidance-absence-manually-verified']),
    occurredAt: iso,
    state: v.literal('verified-guidance-absent'),
  }),
  v.strictObject({
    actionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    expectedSettingsRevision: rev0,
    connectionState: AdapterConnectionStateSchema,
    lastAttemptAt: iso,
    detailCode: v.picklist(['transport-write-failed', 'verification-failed', 'transport-disconnected', 'runtime-unavailable']),
    occurredAt: iso,
    state: v.literal('error'),
    lastGuidanceHash: v.optional(sha256),
  }),
]) as v.GenericSchema<ReportProjectionStatusCommand>
export const ContentFreePolicyStageSchema = v.picklist(['collection', 'learning', 'outbound-inference', 'projection']) as v.GenericSchema<ContentFreePolicyStage>
export const ContentFreePolicyOutcomeSchema = v.picklist(['denied', 'discarded']) as v.GenericSchema<ContentFreePolicyOutcome>
export const ContentFreePolicyReasonCodeSchema = v.picklist([
  'observe-disabled',
  'collection-disabled',
  'learning-disabled',
  'outbound-inference-disabled',
  'outbound-source-not-allowed',
  'projection-disabled',
  'projection-scope-not-allowed',
  'stale-settings-revision',
  'late-result-discarded',
]) as v.GenericSchema<ContentFreePolicyReasonCode>
export const ContentFreePolicyDecisionSchema = v.union([
  v.strictObject({
    schemaVersion: v.literal(1),
    decisionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    stage: v.literal('collection'),
    outcome: v.literal('denied'),
    reasonCode: v.picklist(['observe-disabled', 'collection-disabled']),
    occurredAt: iso,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    decisionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    stage: v.literal('learning'),
    outcome: v.literal('denied'),
    reasonCode: v.literal('learning-disabled'),
    occurredAt: iso,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    decisionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    stage: v.literal('outbound-inference'),
    outcome: v.literal('denied'),
    reasonCode: v.picklist(['outbound-inference-disabled', 'outbound-source-not-allowed']),
    occurredAt: iso,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    decisionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    stage: v.literal('outbound-inference'),
    outcome: v.literal('discarded'),
    reasonCode: v.picklist(['stale-settings-revision', 'late-result-discarded']),
    occurredAt: iso,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    decisionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    stage: v.literal('projection'),
    outcome: v.literal('denied'),
    reasonCode: v.picklist(['projection-disabled', 'projection-scope-not-allowed']),
    occurredAt: iso,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    decisionId: id,
    identity: PreferenceIdentitySchema,
    hostId: id,
    domain: DomainSchema,
    settingsRevision: rev0,
    stage: v.literal('projection'),
    outcome: v.literal('discarded'),
    reasonCode: v.literal('stale-settings-revision'),
    occurredAt: iso,
  }),
]) as v.GenericSchema<ContentFreePolicyDecision>

// TODO(T2C2B): Spark replaces only the schema bodies in this region. Public
// types, fixtures, and strict RED oracles are frozen by the high tier.
export const McpOperationSchema = v.picklist([
  'read-effective-profile',
  'explain-preference',
  'list-pending-candidates',
  'propose-pending-candidate',
]) as v.GenericSchema<McpOperation>

const uniqueValues = <T>(values: T[]) => new Set(values).size === values.length

export const McpCapabilitySchema = v.pipe(
  v.strictObject({
    allowedDomains: v.pipe(
      v.array(DomainSchema),
      v.minLength(1),
      v.check(uniqueValues),
    ),
    allowedOperations: v.pipe(
      v.array(McpOperationSchema),
      v.minLength(1),
      v.check(uniqueValues),
    ),
  }),
) as v.GenericSchema<McpCapability>

export const McpPrincipalSchema = v.strictObject({
  schemaVersion: v.literal(1),
  principalId: id,
  identity: PreferenceIdentitySchema,
  hostId: id,
  capability: McpCapabilitySchema,
}) as v.GenericSchema<McpPrincipal>

export const AuditActorSchema = v.picklist([
  'user',
  'observer',
  'runtime',
  'adapter',
  'mcp-agent',
]) as v.GenericSchema<AuditActor>

export const AuditEventKindSchema = v.picklist([
  'evidence-ingested',
  'evidence-processing-completed',
  'evidence-deleted',
  'candidate-proposed',
  'candidate-confirmed',
  'candidate-rejected',
  'candidate-deleted',
  'candidate-suppressed',
  'preference-created',
  'preference-revised',
  'preference-revoked',
  'connection-settings-updated',
  'projection-status-reported',
  'policy-decision-recorded',
  'processing-failed',
]) as v.GenericSchema<AuditEventKind>

export const AuditReasonCodeSchema = v.picklist([
  'accepted',
  'duplicate',
  'user-requested',
  'not-a-preference',
  'do-not-suggest-again',
  'superseded',
  'observe-disabled',
  'collection-disabled',
  'learning-disabled',
  'outbound-inference-disabled',
  'outbound-source-not-allowed',
  'projection-disabled',
  'projection-scope-not-allowed',
  'stale-settings-revision',
  'late-result-discarded',
  'invalid-observer-output',
  'retry-exhausted',
  'transport-write-failed',
  'verification-failed',
  'transport-disconnected',
  'runtime-unavailable',
]) as v.GenericSchema<AuditReasonCode>

export const AuditEntityReferenceSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('evidence'), evidenceId: id }),
  v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
  v.strictObject({ kind: v.literal('preference'), preferenceId: id }),
  v.strictObject({ kind: v.literal('connection'), hostId: id }),
  v.strictObject({ kind: v.literal('policy-decision'), decisionId: id }),
]) as unknown as v.GenericSchema<AuditEntityReference>

export const AuditEventSchema = v.union([
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('adapter'),
    occurredAt: iso,
    kind: v.literal('evidence-ingested'),
    reasonCode: v.picklist(['accepted', 'duplicate']),
    entity: v.strictObject({ kind: v.literal('evidence'), evidenceId: id }),
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('observer'),
    occurredAt: iso,
    kind: v.literal('evidence-processing-completed'),
    reasonCode: v.picklist(['accepted', 'stale-settings-revision', 'late-result-discarded']),
    entity: v.strictObject({ kind: v.literal('evidence'), evidenceId: id }),
    settingsRevision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('evidence-deleted'),
    reasonCode: v.literal('user-requested'),
    entity: v.strictObject({ kind: v.literal('evidence'), evidenceId: id }),
    actionId: id,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.union([v.literal('observer'), v.literal('runtime')]),
    occurredAt: iso,
    kind: v.literal('processing-failed'),
    reasonCode: v.picklist(['invalid-observer-output', 'retry-exhausted']),
    entity: v.strictObject({ kind: v.literal('evidence'), evidenceId: id }),
    settingsRevision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('observer'),
    occurredAt: iso,
    kind: v.literal('candidate-proposed'),
    reasonCode: v.picklist(['accepted', 'duplicate']),
    entity: v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.union([v.literal('user'), v.literal('mcp-agent')]),
    occurredAt: iso,
    kind: v.literal('candidate-proposed'),
    reasonCode: v.picklist(['accepted', 'duplicate']),
    entity: v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('candidate-confirmed'),
    reasonCode: v.literal('accepted'),
    entity: v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('candidate-rejected'),
    reasonCode: v.picklist(['not-a-preference', 'user-requested']),
    entity: v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('candidate-deleted'),
    reasonCode: v.literal('user-requested'),
    entity: v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('candidate-suppressed'),
    reasonCode: v.literal('do-not-suggest-again'),
    entity: v.strictObject({ kind: v.literal('candidate'), candidateId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('preference-created'),
    reasonCode: v.literal('accepted'),
    entity: v.strictObject({ kind: v.literal('preference'), preferenceId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('preference-revised'),
    reasonCode: v.literal('superseded'),
    entity: v.strictObject({ kind: v.literal('preference'), preferenceId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('preference-revoked'),
    reasonCode: v.literal('user-requested'),
    entity: v.strictObject({ kind: v.literal('preference'), preferenceId: id }),
    actionId: id,
    revision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('user'),
    occurredAt: iso,
    kind: v.literal('connection-settings-updated'),
    reasonCode: v.literal('accepted'),
    entity: v.strictObject({ kind: v.literal('connection'), hostId: id }),
    actionId: id,
    settingsRevision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.literal('adapter'),
    occurredAt: iso,
    kind: v.literal('projection-status-reported'),
    reasonCode: v.picklist([
      'accepted',
      'transport-write-failed',
      'verification-failed',
      'transport-disconnected',
      'runtime-unavailable',
    ]),
    entity: v.strictObject({ kind: v.literal('connection'), hostId: id }),
    actionId: id,
    settingsRevision: rev0,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    id,
    identity: PreferenceIdentitySchema,
    actor: v.union([v.literal('adapter'), v.literal('runtime')]),
    occurredAt: iso,
    kind: v.literal('policy-decision-recorded'),
    reasonCode: ContentFreePolicyReasonCodeSchema,
    entity: v.strictObject({ kind: v.literal('policy-decision'), decisionId: id }),
    settingsRevision: rev0,
  }),
]) as unknown as v.GenericSchema<AuditEvent>

export const AuditQuerySchema = v.pipe(
  v.strictObject({
    identity: PreferenceIdentitySchema,
    actors: v.optional(
      v.pipe(
        v.array(AuditActorSchema),
        v.minLength(1),
        v.check(uniqueValues),
      ),
    ),
    kinds: v.optional(
      v.pipe(
        v.array(AuditEventKindSchema),
        v.minLength(1),
        v.check(uniqueValues),
      ),
    ),
    entity: v.optional(AuditEntityReferenceSchema),
    occurredAtOrAfter: v.optional(iso),
    occurredBefore: v.optional(iso),
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000), v.safeInteger())),
  }),
  v.check((query) => {
    const { occurredAtOrAfter, occurredBefore } = query
    if (!occurredAtOrAfter || !occurredBefore) return true
    return occurredAtOrAfter <= occurredBefore
  }),
) as v.GenericSchema<AuditQuery>

// T2C2C HTTP DTO freeze. HTTP only projects the commands and queries above.
// Runtime derives this principal from bearer-token configuration; request
// bodies never supply or override it.
export type HttpPrincipal = { schemaVersion: 1; principalId: string; identity: PreferenceIdentity; hostId: string }
export type HttpErrorCode = 'bad-request' | 'unauthorized' | 'forbidden' | 'not-found' | 'revision-conflict' | 'action-payload-conflict' | 'settings-revision-conflict' | 'reset-in-progress' | 'internal-error'
export type HttpErrorDetail = { code: HttpErrorCode; message: string; retryable: boolean; currentRevision?: number }
export type HttpSuccessResponse<T> = { ok: true; requestId: string; data: T }
export type HttpErrorResponse = { ok: false; requestId: string; error: HttpErrorDetail }
export type HttpResponse<T> = HttpSuccessResponse<T> | HttpErrorResponse

export type IngestEvidenceHttpRequest = { evidence: InteractionEvidence; expectedSettingsRevision: number }
export type EffectiveProfileHttpRequest = { query: EffectiveProfileQuery }
export type CandidateListHttpRequest = { identity: PreferenceIdentity; statuses?: CandidateStatus[] }
export type PreferenceListHttpRequest = { identity: PreferenceIdentity; statuses?: PreferenceStatus[] }
export type ConnectionSettingsHttpRequest = { identity: PreferenceIdentity; hostId: string }
export type AuditHttpRequest = { query: AuditQuery }
export type GovernanceMutationCommand = ProposeCandidateCommand | ConfirmCandidateCommand | RejectCandidateCommand | DeleteCandidateCommand | SuppressCandidateCommand | CreateExplicitPreferenceCommand | RevisePreferenceCommand | RevokePreferenceCommand | UpdateConnectionSettingsCommand | ReportProjectionStatusCommand | DeleteEvidenceCommand
export type GovernanceMutationHttpRequest = { command: GovernanceMutationCommand }

export type IngestEvidenceHttpResult = { evidenceId: string; disposition: 'accepted' | 'duplicate'; settingsRevision: number }
export type EffectiveProfileHttpResult = { guidance: BehaviorGuidance; profileRevision: number; settingsRevision: number }
export type CandidateListHttpResult = { candidates: PreferenceCandidate[] }
export type PreferenceListHttpResult = { preferences: PreferenceRecord[] }
export type AuditHttpResult = { events: AuditEvent[] }

// Strict runtime schemas for the frozen T2C2C HTTP DTO contract.
export const HttpPrincipalSchema = v.strictObject({
  schemaVersion: v.literal(1),
  principalId: v.pipe(v.string(), v.nonEmpty()),
  identity: PreferenceIdentitySchema,
  hostId: v.pipe(v.string(), v.nonEmpty()),
}) as v.GenericSchema<HttpPrincipal>

export const HttpErrorCodeSchema = v.picklist([
  'bad-request',
  'unauthorized',
  'forbidden',
  'not-found',
  'revision-conflict',
  'action-payload-conflict',
  'settings-revision-conflict',
  'reset-in-progress',
  'internal-error',
]) as v.GenericSchema<HttpErrorCode>

export const HttpErrorDetailSchema = v.strictObject({
  code: HttpErrorCodeSchema,
  message: v.pipe(v.string(), v.nonEmpty()),
  retryable: v.boolean(),
  currentRevision: v.optional(rev0),
}) as v.GenericSchema<HttpErrorDetail>

export const HttpErrorResponseSchema = v.strictObject({
  ok: v.literal(false),
  requestId: v.pipe(v.string(), v.nonEmpty()),
  error: HttpErrorDetailSchema,
}) as v.GenericSchema<HttpErrorResponse>

export const IngestEvidenceHttpRequestSchema = v.strictObject({
  evidence: InteractionEvidenceSchema,
  expectedSettingsRevision: rev0,
}) as v.GenericSchema<IngestEvidenceHttpRequest>

export const EffectiveProfileHttpRequestSchema = v.strictObject({
  query: EffectiveProfileQuerySchema,
}) as v.GenericSchema<EffectiveProfileHttpRequest>

export const CandidateListHttpRequestSchema = v.strictObject({
  identity: PreferenceIdentitySchema,
  statuses: v.optional(
    v.pipe(v.array(CandidateStatusSchema), v.minLength(1), v.check(uniqueValues)),
  ),
}) as v.GenericSchema<CandidateListHttpRequest>

export const PreferenceListHttpRequestSchema = v.strictObject({
  identity: PreferenceIdentitySchema,
  statuses: v.optional(
    v.pipe(v.array(PreferenceStatusSchema), v.minLength(1), v.check(uniqueValues)),
  ),
}) as v.GenericSchema<PreferenceListHttpRequest>

export const ConnectionSettingsHttpRequestSchema = v.strictObject({
  identity: PreferenceIdentitySchema,
  hostId: v.pipe(v.string(), v.nonEmpty()),
}) as v.GenericSchema<ConnectionSettingsHttpRequest>

export const AuditHttpRequestSchema = v.strictObject({
  query: AuditQuerySchema,
}) as v.GenericSchema<AuditHttpRequest>

export const GovernanceMutationCommandSchema = v.union([
  ProposeCandidateCommandSchema,
  ConfirmCandidateCommandSchema,
  RejectCandidateCommandSchema,
  DeleteCandidateCommandSchema,
  SuppressCandidateCommandSchema,
  CreateExplicitPreferenceCommandSchema,
  RevisePreferenceCommandSchema,
  RevokePreferenceCommandSchema,
  DeleteEvidenceCommandSchema,
  UpdateConnectionSettingsCommandSchema,
  ReportProjectionStatusCommandSchema,
]) as unknown as v.GenericSchema<GovernanceMutationCommand>

export const GovernanceMutationHttpRequestSchema = v.strictObject({
  command: GovernanceMutationCommandSchema,
}) as v.GenericSchema<GovernanceMutationHttpRequest>

export const IngestEvidenceHttpResultSchema = v.strictObject({
  evidenceId: v.pipe(v.string(), v.nonEmpty()),
  disposition: v.picklist(['accepted', 'duplicate']),
  settingsRevision: rev0,
}) as v.GenericSchema<IngestEvidenceHttpResult>

export const EffectiveProfileHttpResultSchema = v.strictObject({
  guidance: BehaviorGuidanceSchema,
  profileRevision: rev0,
  settingsRevision: rev0,
}) as v.GenericSchema<EffectiveProfileHttpResult>

export const CandidateListHttpResultSchema = v.strictObject({
  candidates: v.array(PreferenceCandidateSchema),
}) as v.GenericSchema<CandidateListHttpResult>

export const PreferenceListHttpResultSchema = v.strictObject({
  preferences: v.array(PreferenceRecordSchema),
}) as v.GenericSchema<PreferenceListHttpResult>

export const AuditHttpResultSchema = v.strictObject({
  events: v.array(AuditEventSchema),
}) as v.GenericSchema<AuditHttpResult>

export const HttpSuccessResponseSchema = <T>(
  data: v.GenericSchema<T>,
) => v.strictObject({
  ok: v.literal(true),
  requestId: v.pipe(v.string(), v.nonEmpty()),
  data,
}) as v.GenericSchema<HttpSuccessResponse<T>>

export const HttpResponseSchema = <T>(data: v.GenericSchema<T>) =>
  v.union([
    HttpSuccessResponseSchema(data),
    HttpErrorResponseSchema,
  ]) as v.GenericSchema<HttpResponse<T>>
