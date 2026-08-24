import type {
  AuditEvent,
  AuditQuery,
  CandidateStatus,
  ConfirmCandidateCommand,
  ConnectionSettings,
  ContentFreePolicyDecision,
  ContentFreePolicyReasonCode,
  CreateExplicitPreferenceCommand,
  DeleteCandidateCommand,
  DeleteEvidenceCommand,
  DeleteEvidenceResult,
  EffectiveProfileQuery,
  EvidenceProvenance,
  IdentityContext,
  InteractionEvidence,
  PreferenceCandidate,
  PreferenceIdentity,
  PreferenceRecord,
  ProposeCandidateCommand,
  RejectCandidateCommand,
  ReportProjectionStatusCommand,
  RevisePreferenceCommand,
  RevokePreferenceCommand,
  SuppressCandidateCommand,
  UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import {
  resolveEffectiveProfile,
  type EffectiveProfileResolution,
  type PreferenceRepository,
} from '@companion-preference/preference-core'

import {
  collectionAdmission,
  isStricterSettingsRevision,
  replaceEvidencePolicySnapshot,
} from './settings.js'

export type EvidenceIngestResult =
  | Readonly<{
      disposition: 'inserted' | 'duplicate'
      settingsRevision: number
    }>
  | Readonly<{
      disposition: 'discarded'
      reasonCode: Extract<ContentFreePolicyReasonCode, 'observe-disabled' | 'collection-disabled'>
      settingsRevision: number
    }>

export type EffectiveProfileResult = EffectiveProfileResolution & Readonly<{
  settingsRevision: number
}>

export type PreferenceDataExport = Readonly<{
  evidence: readonly EvidenceProvenance[]
  candidates: readonly PreferenceCandidate[]
  activePreferences: readonly PreferenceRecord[]
  connectionSettings: ConnectionSettings
  auditEvents: readonly AuditEvent[]
}>

export type PreferenceApplicationOptions = Readonly<{
  repository: PreferenceRepository
  decisionIdFactory: () => string
  onSettingsChanged?: (
    previous: ConnectionSettings,
    current: ConnectionSettings,
  ) => void | Promise<void>
  onEvidenceDeleted?: (evidenceId: string) => void | Promise<void>
}>

const profileIdentity = (identity: IdentityContext): PreferenceIdentity => ({
  userId: identity.userId,
  companionId: identity.companionId,
  relationshipId: identity.relationshipId,
})

const sameIdentity = (
  left: PreferenceIdentity,
  right: PreferenceIdentity,
): boolean => left.userId === right.userId
  && left.companionId === right.companionId
  && left.relationshipId === right.relationshipId

/**
 * Transport-free application service for governed preference operations.
 * Database ownership, workers, process locks, reset, and adapters live outside
 * this class.
 */
export class PreferenceApplication {
  private readonly repository: PreferenceRepository
  private readonly decisionIdFactory: () => string
  private readonly onSettingsChanged?: PreferenceApplicationOptions['onSettingsChanged']
  private readonly onEvidenceDeleted?: PreferenceApplicationOptions['onEvidenceDeleted']

  constructor(options: PreferenceApplicationOptions) {
    this.repository = options.repository
    this.decisionIdFactory = options.decisionIdFactory
    this.onSettingsChanged = options.onSettingsChanged
    this.onEvidenceDeleted = options.onEvidenceDeleted
  }

  async ingestEvidence(evidence: InteractionEvidence): Promise<EvidenceIngestResult> {
    const identity = profileIdentity(evidence.identity)
    const settings = await this.repository.getConnectionSettings(
      identity,
      evidence.identity.hostId,
    )
    const admission = collectionAdmission(settings, evidence)
    if (!admission.allowed) {
      const reasonCode = admission.reasonCode === 'observe-disabled'
        ? 'observe-disabled'
        : 'collection-disabled'
      await this.recordContentFreeDecision({
        evidence,
        settingsRevision: settings.revision,
        stage: 'collection',
        reasonCode,
      })
      return {
        disposition: 'discarded',
        reasonCode,
        settingsRevision: settings.revision,
      }
    }

    const canonicalEvidence = replaceEvidencePolicySnapshot(evidence, settings)
    const disposition = await this.repository.ingestEvidenceAtomically(canonicalEvidence)
    return { disposition, settingsRevision: settings.revision }
  }

  proposeCandidate(command: ProposeCandidateCommand): Promise<PreferenceCandidate> {
    return this.repository.proposeCandidateAtomically(command)
  }

  listPendingCandidates(): Promise<PreferenceCandidate[]> {
    return this.repository.listCandidates('pending_confirmation')
  }

  listCandidates(status?: CandidateStatus): Promise<PreferenceCandidate[]> {
    return this.repository.listCandidates(status)
  }

  confirmCandidate(command: ConfirmCandidateCommand): Promise<PreferenceRecord> {
    return this.repository.confirmCandidateAtomically(command)
  }

  rejectCandidate(command: RejectCandidateCommand): Promise<void> {
    return this.repository.rejectCandidateAtomically(command)
  }

  deleteCandidate(command: DeleteCandidateCommand): Promise<void> {
    return this.repository.deleteCandidateAtomically(command)
  }

  suppressCandidate(command: SuppressCandidateCommand): Promise<void> {
    return this.repository.suppressCandidateAtomically(command)
  }

  createExplicitPreference(command: CreateExplicitPreferenceCommand): Promise<PreferenceRecord> {
    return this.repository.createExplicitPreferenceAtomically(command)
  }

  revisePreference(command: RevisePreferenceCommand): Promise<PreferenceRecord> {
    return this.repository.revisePreferenceAtomically(command)
  }

  revokePreference(command: RevokePreferenceCommand): Promise<PreferenceRecord> {
    return this.repository.revokePreferenceAtomically(command)
  }

  async getEffectiveProfile(query: EffectiveProfileQuery): Promise<EffectiveProfileResult> {
    const identity: IdentityContext = {
      ...query,
      sessionId: '',
    }
    const settings = await this.repository.getConnectionSettings(
      profileIdentity(identity),
      query.hostId,
    )
    const records = await this.repository.listActivePreferences(identity)
    const resolution = resolveEffectiveProfile(records, query)
    const projectionAllowed = settings.projectionPolicy.allowedHosts.includes(query.hostId)
      && settings.projectionPolicy.allowedDomains.includes(query.domain)

    if (!settings.applyEnabled || !projectionAllowed) {
      return { ...resolution, guidance: {}, settingsRevision: settings.revision }
    }
    return { ...resolution, settingsRevision: settings.revision }
  }

  listActivePreferences(identity: IdentityContext): Promise<PreferenceRecord[]> {
    return this.repository.listActivePreferences(identity)
  }

  getConnectionSettings(identity: PreferenceIdentity, hostId: string): Promise<ConnectionSettings> {
    return this.repository.getConnectionSettings(identity, hostId)
  }

  async updateConnectionSettings(command: UpdateConnectionSettingsCommand): Promise<ConnectionSettings> {
    const previous = await this.repository.getConnectionSettings(command.identity, command.hostId)
    const current = await this.repository.updateConnectionSettingsAtomically(command)
    if (this.onSettingsChanged && isStricterSettingsRevision(previous, current)) {
      await this.onSettingsChanged(previous, current)
    }
    return current
  }

  reportAdapterProjectionStatus(command: ReportProjectionStatusCommand) {
    return this.repository.reportAdapterProjectionStatusAtomically(command)
  }

  recordPolicyDecision(decision: ContentFreePolicyDecision): Promise<void> {
    return this.repository.recordPolicyDecisionAtomically(decision)
  }

  listAuditEvents(query: AuditQuery): Promise<AuditEvent[]> {
    return this.repository.listAuditEvents(query)
  }

  async exportData(identity: IdentityContext): Promise<PreferenceDataExport> {
    const owner = profileIdentity(identity)
    const [evidence, candidates, activePreferences, connectionSettings, auditEvents] = await Promise.all([
      this.repository.listEvidenceProvenance(identity),
      this.repository.listCandidates(),
      this.repository.listActivePreferences(identity),
      this.repository.getConnectionSettings(owner, identity.hostId),
      this.repository.listAuditEvents({ identity: owner }),
    ])
    return {
      evidence,
      candidates: candidates.filter((candidate) => sameIdentity(candidate.identity, owner)),
      activePreferences,
      connectionSettings,
      auditEvents,
    }
  }

  async deleteEvidence(command: DeleteEvidenceCommand): Promise<DeleteEvidenceResult> {
    const result = await this.repository.deleteEvidenceAtomically(command)
    await this.onEvidenceDeleted?.(command.evidenceId)
    return result
  }

  private recordContentFreeDecision(input: Readonly<{
    evidence: InteractionEvidence
    settingsRevision: number
    stage: ContentFreePolicyDecision['stage']
    reasonCode: ContentFreePolicyDecision['reasonCode']
  }>): Promise<void> {
    return this.repository.recordPolicyDecisionAtomically({
      schemaVersion: 1,
      decisionId: this.decisionIdFactory(),
      identity: profileIdentity(input.evidence.identity),
      hostId: input.evidence.identity.hostId,
      domain: input.evidence.identity.domain,
      settingsRevision: input.settingsRevision,
      stage: input.stage,
      outcome: 'discarded',
      reasonCode: input.reasonCode,
      occurredAt: input.evidence.occurredAt,
    })
  }
}
