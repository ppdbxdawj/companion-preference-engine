import { createHash } from 'node:crypto'
import type {
  AdapterProjectionStatus, AuditEvent, AuditQuery, CandidateStatus,
  ConfirmCandidateCommand, ConnectionSettings, ContentFreePolicyDecision,
  CreateExplicitPreferenceCommand, DeleteCandidateCommand, DeleteEvidenceCommand,
  DeleteEvidenceResult, EvidenceProvenance, IdentityContext, InteractionEvidence,
  PreferenceCandidate, PreferenceIdentity, PreferenceRecord, ProposeCandidateCommand,
  RejectCandidateCommand, ReportProjectionStatusCommand, RevisePreferenceCommand,
  RevokePreferenceCommand, SuppressCandidateCommand, UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import type {
  CandidateSuppression, CompleteEvidenceProcessing, EvidenceClaim, EvidenceClaimRef,
  IngestEvidenceResult, PreferenceRepository,
} from './repository.js'

export type RepositoryAtomicStep =
  | 'after-state' | 'after-audit' | 'after-receipt' | 'before-commit'
export type RepositoryOperation =
  | 'ingest-evidence' | 'complete-evidence' | 'propose-candidate' | 'confirm-candidate'
  | 'reject-candidate' | 'delete-candidate' | 'suppress-candidate'
  | 'create-explicit-preference' | 'revise-preference' | 'revoke-preference'
  | 'update-connection-settings' | 'report-projection-status' | 'record-policy-decision'
  | 'delete-evidence'
export type InMemoryRepositoryOptions = Readonly<{
  claimTokenFactory: () => string
  auditEventIdFactory: () => string
  failAt?: (operation: RepositoryOperation, step: RepositoryAtomicStep) => void
  snapshot?: InMemoryRepositorySnapshot
}>
export type InMemoryRepositorySnapshot = Readonly<{ schemaVersion: 1; state: unknown }>
const todo = (): never => { throw new Error('TODO(T5B): implement frozen in-memory repository contract') }
type Lease = { workerId: string; token: string; until: string; version: number }
type State = {
  evidence: Record<string, { evidence: InteractionEvidence; state: string; lease: Lease | undefined }>
  candidates: Record<string, PreferenceCandidate>; audits: AuditEvent[]; completions: Record<string, CompletionProjection>
}
type CompletionProjection = {
  evidenceId: string; workerId: string; claimToken: string; leaseVersion: number
  expectedSettingsRevision: number; candidateIdempotencyDigests: string[]; occurredAt: string
}
const clone = <T>(v: T): T => structuredClone(v)
const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
}
const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const auditIdentity = (i: IdentityContext) => ({ userId: i.userId, companionId: i.companionId, relationshipId: i.relationshipId })
const sameAuditIdentity = (a: { userId: string; companionId: string; relationshipId: string }, b: { userId: string; companionId: string; relationshipId: string }) =>
  a.userId === b.userId && a.companionId === b.companionId && a.relationshipId === b.relationshipId
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const completionProjection = (c: CompleteEvidenceProcessing): CompletionProjection => ({
  evidenceId: c.claim.evidenceId, workerId: c.claim.workerId, claimToken: c.claim.claimToken,
  leaseVersion: c.claim.leaseVersion, expectedSettingsRevision: c.expectedSettingsRevision,
  candidateIdempotencyDigests: c.candidates.map((item) => item.proposal.idempotencyKey?.digest ?? digest(item.proposal)),
  occurredAt: c.occurredAt,
})
const same = (
  a: { userId: string; companionId: string; relationshipId: string; hostId?: string },
  b: { userId: string; companionId: string; relationshipId: string; hostId?: string },
) =>
  a.userId === b.userId && a.companionId === b.companionId &&
  a.relationshipId === b.relationshipId &&
  (b.hostId === undefined || a.hostId === b.hostId)

export class InMemoryPreferenceRepository implements PreferenceRepository {
  private state: State
  constructor(readonly options: InMemoryRepositoryOptions) {
    this.state = options.snapshot
      ? clone(options.snapshot.state as State)
      : { evidence: {}, candidates: {}, audits: [], completions: {} }
    this.state.completions ??= {}
  }
  private atomic<T>(op: RepositoryOperation, fn: () => T, receipt = true, staged = false): T {
    const before = clone(this.state)
    try {
      const result = fn()
      if (staged) return result
      const steps = receipt
        ? ['after-state', 'after-audit', 'after-receipt', 'before-commit'] as const
        : ['after-state', 'after-audit', 'before-commit'] as const
      for (const step of steps) {
        this.options.failAt?.(op, step)
      }
      return result
    } catch (error) { this.state = before; throw error }
  }
  private stale(c: EvidenceClaimRef, now?: string) {
    const record = this.state.evidence[c.evidenceId]
    const invalid = !record || record.state !== 'leased' || !record.lease ||
      record.lease.workerId !== c.workerId || record.lease.token !== c.claimToken ||
      record.lease.version !== c.leaseVersion ||
      (now !== undefined && record.lease.until <= now)
    if (invalid) { const error = new Error('stale claim'); error.name = 'StaleClaimError'; Object.assign(error, { code: 'STALE_CLAIM' }); throw error }
    return record
  }
  exportSnapshot(): InMemoryRepositorySnapshot { return { schemaVersion: 1, state: clone(this.state) } }
  ingestEvidenceAtomically(e: InteractionEvidence): Promise<IngestEvidenceResult> {
    return Promise.resolve().then(() => this.atomic('ingest-evidence', () => {
      const evidence = clone(e)
      const duplicate = Object.values(this.state.evidence).some((record) => {
        const existing = record.evidence
        return existing.identity.userId === evidence.identity.userId &&
          existing.identity.companionId === evidence.identity.companionId &&
          existing.identity.relationshipId === evidence.identity.relationshipId &&
          existing.identity.hostId === evidence.identity.hostId &&
          existing.sourceRef === evidence.sourceRef
      })
      if (!duplicate) {
        this.state.evidence[evidence.id] = { evidence, state: 'available', lease: undefined }
        this.options.failAt?.('ingest-evidence', 'after-state')
        this.state.audits.push({ schemaVersion: 1, id: this.options.auditEventIdFactory(),
          identity: auditIdentity(evidence.identity), actor: 'adapter', kind: 'evidence-ingested',
          reasonCode: 'accepted', entity: { kind: 'evidence', evidenceId: evidence.id },
          occurredAt: evidence.occurredAt } as AuditEvent)
        this.options.failAt?.('ingest-evidence', 'after-audit')
      }
      this.options.failAt?.('ingest-evidence', 'before-commit')
      return duplicate ? 'duplicate' : 'inserted'
    }, false, true))
  }
  claimNextEvidence(workerId: string, leaseUntil: string, now: string): Promise<EvidenceClaim | undefined> {
    const record = Object.values(this.state.evidence)
      .filter((item) => item.state === 'available' || (item.state === 'leased' && !!item.lease && item.lease.until <= now))
      .sort((a, b) => compare(a.evidence.occurredAt, b.evidence.occurredAt) || compare(a.evidence.id, b.evidence.id))[0]
    if (!record) return Promise.resolve(undefined)
    const version = (record.lease?.version ?? 0) + 1
    const token = this.options.claimTokenFactory()
    record.state = 'leased'
    record.lease = { workerId, token, until: leaseUntil, version }
    return Promise.resolve({
      evidence: clone(record.evidence), evidenceId: record.evidence.id, workerId,
      claimToken: token, leaseVersion: version, leaseUntil,
      settingsRevision: record.evidence.policySnapshot.settingsRevision,
    })
  }
  renewEvidenceClaim(c: EvidenceClaimRef, leaseUntil: string, now: string): Promise<void> {
    return Promise.resolve().then(() => { this.stale(c, now).lease!.until = leaseUntil })
  }
  releaseEvidenceClaim(c: EvidenceClaimRef): Promise<void> {
    return Promise.resolve().then(() => { const record = this.stale(c); record.state = 'available'; record.lease = undefined })
  }
  completeEvidenceProcessingAtomically(c: CompleteEvidenceProcessing): Promise<void> {
    return Promise.resolve().then(() => this.atomic('complete-evidence', () => {
      const projection = completionProjection(c); const payload = canonical(projection)
      const key = canonical({ evidenceId: c.claim.evidenceId, workerId: c.claim.workerId,
        claimToken: c.claim.claimToken, leaseVersion: c.claim.leaseVersion })
      if (this.state.completions[key]) {
        if (canonical(this.state.completions[key]) !== payload) throw new Error('completion payload conflict')
        return
      }
      const record = this.stale(c.claim, c.occurredAt)
      if (c.expectedSettingsRevision !== record.evidence.policySnapshot.settingsRevision) throw new Error('STALE_SETTINGS_REVISION')
      const inserted: typeof c.candidates[number][] = []
      for (const item of c.candidates) {
        const candidateKey = item.proposal.idempotencyKey?.digest ?? digest(item.proposal)
        const existing = this.state.candidates[candidateKey]
        if (existing) {
          const expected = { ...item.proposal, id: existing.id, schemaVersion: 1,
            status: 'pending_confirmation', revision: 0, createdAt: existing.createdAt,
            updatedAt: existing.updatedAt }
          if (canonical(existing) !== canonical(expected)) throw new Error('candidate idempotency conflict')
          continue
        }
        this.state.candidates[candidateKey] = { ...clone(item.proposal), id: item.candidateId,
          schemaVersion: 1, status: 'pending_confirmation', revision: 0,
          createdAt: c.occurredAt, updatedAt: c.occurredAt } as PreferenceCandidate
        inserted.push(item)
      }
      record.state = 'completed'; record.lease = undefined
      this.options.failAt?.('complete-evidence', 'after-state')
      for (const item of inserted) this.state.audits.push({ schemaVersion: 1, id: item.auditEventId,
        identity: auditIdentity(record.evidence.identity), actor: 'observer', kind: 'candidate-proposed',
        reasonCode: 'accepted', entity: { kind: 'candidate', candidateId: item.candidateId },
        occurredAt: c.occurredAt, revision: 0 } as AuditEvent)
      this.state.audits.push({ schemaVersion: 1, id: c.auditEventId,
        identity: auditIdentity(record.evidence.identity), actor: 'observer',
        kind: 'evidence-processing-completed', reasonCode: 'accepted',
        entity: { kind: 'evidence', evidenceId: record.evidence.id },
        settingsRevision: c.expectedSettingsRevision, occurredAt: c.occurredAt } as AuditEvent)
      this.options.failAt?.('complete-evidence', 'after-audit')
      this.state.completions[key] = clone(projection)
      this.options.failAt?.('complete-evidence', 'after-receipt')
      this.options.failAt?.('complete-evidence', 'before-commit')
    }, true, true))
  }
  getEvidenceProvenance(id: string): Promise<EvidenceProvenance | undefined> {
    const record = this.state.evidence[id]
    return Promise.resolve(record ? clone({ state: 'live', evidence: record.evidence } as EvidenceProvenance) : undefined)
  }
  listEvidenceProvenance(i: IdentityContext): Promise<EvidenceProvenance[]> {
    return Promise.resolve(Object.values(this.state.evidence)
      .filter((record) => same(record.evidence.identity, i))
      .sort((a, b) => compare(a.evidence.occurredAt, b.evidence.occurredAt) || compare(a.evidence.id, b.evidence.id))
      .map((record) => clone({ state: 'live', evidence: record.evidence } as EvidenceProvenance)))
  }
  getCandidate(id: string): Promise<PreferenceCandidate | undefined> {
    const candidate = Object.values(this.state.candidates).find((item) => item.id === id)
    return Promise.resolve(candidate ? clone(candidate) : undefined)
  }
  listCandidates(s?: CandidateStatus): Promise<PreferenceCandidate[]> {
    return Promise.resolve(Object.values(this.state.candidates)
      .filter((candidate) => !s || candidate.status === s)
      .sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id))
      .map(clone))
  }
  listAuditEvents(q: AuditQuery): Promise<AuditEvent[]> {
    return Promise.resolve(this.state.audits
      .filter((audit) => sameAuditIdentity(audit.identity, q.identity))
      .filter((audit) => !q.actors || q.actors.includes(audit.actor))
      .filter((audit) => !q.kinds || q.kinds.includes(audit.kind))
      .filter((audit) => !q.entity || canonical(audit.entity) === canonical(q.entity))
      .filter((audit) => !q.occurredAtOrAfter || audit.occurredAt >= q.occurredAtOrAfter)
      .filter((audit) => !q.occurredBefore || audit.occurredAt < q.occurredBefore)
      .sort((a, b) => compare(a.occurredAt, b.occurredAt) || compare(a.id, b.id))
      .slice(0, q.limit ?? Number.POSITIVE_INFINITY)
      .map(clone))
  }
  proposeCandidateAtomically(_c: ProposeCandidateCommand): Promise<PreferenceCandidate> { return Promise.reject(todo()) }
  confirmCandidateAtomically(_c: ConfirmCandidateCommand): Promise<PreferenceRecord> { return Promise.reject(todo()) }
  rejectCandidateAtomically(_c: RejectCandidateCommand): Promise<void> { return Promise.reject(todo()) }
  deleteCandidateAtomically(_c: DeleteCandidateCommand): Promise<void> { return Promise.reject(todo()) }
  suppressCandidateAtomically(_c: SuppressCandidateCommand): Promise<void> { return Promise.reject(todo()) }
  listCandidateSuppressions(_i: IdentityContext): Promise<CandidateSuppression[]> { return Promise.reject(todo()) }
  createExplicitPreferenceAtomically(_c: CreateExplicitPreferenceCommand): Promise<PreferenceRecord> { return Promise.reject(todo()) }
  revisePreferenceAtomically(_c: RevisePreferenceCommand): Promise<PreferenceRecord> { return Promise.reject(todo()) }
  revokePreferenceAtomically(_c: RevokePreferenceCommand): Promise<PreferenceRecord> { return Promise.reject(todo()) }
  getPreference(_id: string): Promise<PreferenceRecord | undefined> { return Promise.reject(todo()) }
  listActivePreferences(_i: IdentityContext): Promise<PreferenceRecord[]> { return Promise.reject(todo()) }
  getConnectionSettings(_i: PreferenceIdentity, _h: string): Promise<ConnectionSettings> { return Promise.reject(todo()) }
  updateConnectionSettingsAtomically(_c: UpdateConnectionSettingsCommand): Promise<ConnectionSettings> { return Promise.reject(todo()) }
  reportAdapterProjectionStatusAtomically(_c: ReportProjectionStatusCommand): Promise<AdapterProjectionStatus> { return Promise.reject(todo()) }
  recordPolicyDecisionAtomically(_d: ContentFreePolicyDecision): Promise<void> { return Promise.reject(todo()) }
  deleteEvidenceAtomically(_c: DeleteEvidenceCommand): Promise<DeleteEvidenceResult> { return Promise.reject(todo()) }
}
