import type {
  AdapterProjectionStatus,
  AuditEvent,
  AuditQuery,
  CandidateStatus,
  ConfirmCandidateCommand,
  ConnectionSettings,
  ContentFreePolicyDecision,
  CreateExplicitPreferenceCommand,
  DeleteCandidateCommand,
  DeleteEvidenceCommand,
  DeleteEvidenceResult,
  EvidenceProvenance,
  IdentityContext,
  InteractionEvidence,
  PendingCandidateProposal,
  PreferenceCandidate,
  PreferenceIdentity,
  PreferenceRecord,
  PreferenceScope,
  ProjectionPolicy,
  ProposeCandidateCommand,
  RejectCandidateCommand,
  ReportProjectionStatusCommand,
  RevisePreferenceCommand,
  RevokePreferenceCommand,
  SuppressCandidateCommand,
  UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'

/** Repository-only processing state. It is deliberately not a wire contract. */
export type EvidenceProcessingState =
  | 'available'
  | 'leased'
  | 'completed'
  | 'failed'

export type EvidenceClaimRef = Readonly<{
  evidenceId: string
  workerId: string
  claimToken: string
  leaseVersion: number
}>

export type EvidenceClaim = EvidenceClaimRef & Readonly<{
  evidence: InteractionEvidence
  leaseUntil: string
  settingsRevision: number
}>

export type CandidateInsertion = Readonly<{
  candidateId: string
  proposal: PendingCandidateProposal
  auditEventId: string
}>

export type CompleteEvidenceProcessing = Readonly<{
  claim: EvidenceClaimRef
  expectedSettingsRevision: number
  candidates: readonly CandidateInsertion[]
  auditEventId: string
  occurredAt: string
}>

export type EvidenceDiscardReasonCode =
  | 'stale-settings-revision'
  | 'late-result-discarded'

/**
 * Atomically terminalizes a still-valid claim without creating candidates.
 * `expectedSettingsRevision` fences the current canonical connection settings,
 * rather than the policy snapshot captured on the evidence.
 */
export type DiscardEvidenceProcessing = Readonly<{
  claim: EvidenceClaimRef
  expectedSettingsRevision: number
  reasonCode: EvidenceDiscardReasonCode
  auditEventId: string
  occurredAt: string
}>

/** Internal, content-free replay fence for a completed worker command. */
export type EvidenceCompletionReplay = Readonly<{
  evidenceId: string
  workerId: string
  claimToken: string
  leaseVersion: number
  expectedSettingsRevision: number
  candidateIdempotencyDigests: readonly string[]
  occurredAt: string
}>

export type CandidateSuppression = Readonly<{
  schemaVersion: 1
  id: string
  identity: PreferenceIdentity
  preferenceKey: PreferenceCandidate['preference']['key']
  scope: PreferenceScope
  projection: ProjectionPolicy
  createdAt: string
}>

export type IngestEvidenceResult = 'inserted' | 'duplicate'

export class StaleClaimError extends Error {
  readonly name = 'StaleClaimError'
  readonly code = 'STALE_CLAIM' as const
}

export class ActivePreferenceSlotOccupiedError extends Error {
  readonly name = 'ActivePreferenceSlotOccupiedError'
  readonly code = 'ACTIVE_PREFERENCE_SLOT_OCCUPIED' as const
}

export class CandidateIdempotencyConflictError extends Error {
  readonly name = 'CandidateIdempotencyConflictError'
  readonly code = 'CANDIDATE_IDEMPOTENCY_CONFLICT' as const
}

export interface PreferenceRepository {
  ingestEvidenceAtomically(evidence: InteractionEvidence): Promise<IngestEvidenceResult>
  claimNextEvidence(workerId: string, leaseUntil: string, now: string): Promise<EvidenceClaim | undefined>
  renewEvidenceClaim(claim: EvidenceClaimRef, leaseUntil: string, now: string): Promise<void>
  releaseEvidenceClaim(claim: EvidenceClaimRef): Promise<void>
  completeEvidenceProcessingAtomically(command: CompleteEvidenceProcessing): Promise<void>
  discardEvidenceProcessingAtomically(command: DiscardEvidenceProcessing): Promise<void>
  getEvidenceProvenance(id: string): Promise<EvidenceProvenance | undefined>
  listEvidenceProvenance(identity: IdentityContext): Promise<EvidenceProvenance[]>
  proposeCandidateAtomically(command: ProposeCandidateCommand): Promise<PreferenceCandidate>
  getCandidate(id: string): Promise<PreferenceCandidate | undefined>
  listCandidates(status?: CandidateStatus): Promise<PreferenceCandidate[]>
  confirmCandidateAtomically(command: ConfirmCandidateCommand): Promise<PreferenceRecord>
  rejectCandidateAtomically(command: RejectCandidateCommand): Promise<void>
  deleteCandidateAtomically(command: DeleteCandidateCommand): Promise<void>
  suppressCandidateAtomically(command: SuppressCandidateCommand): Promise<void>
  listCandidateSuppressions(identity: IdentityContext): Promise<CandidateSuppression[]>
  createExplicitPreferenceAtomically(command: CreateExplicitPreferenceCommand): Promise<PreferenceRecord>
  revisePreferenceAtomically(command: RevisePreferenceCommand): Promise<PreferenceRecord>
  revokePreferenceAtomically(command: RevokePreferenceCommand): Promise<PreferenceRecord>
  getPreference(id: string): Promise<PreferenceRecord | undefined>
  listActivePreferences(identity: IdentityContext): Promise<PreferenceRecord[]>
  getConnectionSettings(identity: PreferenceIdentity, hostId: string): Promise<ConnectionSettings>
  updateConnectionSettingsAtomically(command: UpdateConnectionSettingsCommand): Promise<ConnectionSettings>
  reportAdapterProjectionStatusAtomically(command: ReportProjectionStatusCommand): Promise<AdapterProjectionStatus>
  recordPolicyDecisionAtomically(decision: ContentFreePolicyDecision): Promise<void>
  listAuditEvents(query: AuditQuery): Promise<AuditEvent[]>
  deleteEvidenceAtomically(command: DeleteEvidenceCommand): Promise<DeleteEvidenceResult>
}
