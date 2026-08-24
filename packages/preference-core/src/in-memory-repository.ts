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
  CandidateSuppression, CompleteEvidenceProcessing, DiscardEvidenceProcessing,
  EvidenceClaim, EvidenceClaimRef,
  IngestEvidenceResult, PreferenceRepository,
} from './repository.js'
import { ActivePreferenceSlotOccupiedError, CandidateIdempotencyConflictError } from './repository.js'
import { ActionPayloadConflictError, InvalidTransitionError, RevisionConflictError } from './lifecycle.js'

export type RepositoryAtomicStep =
  | 'after-state' | 'after-audit' | 'after-receipt' | 'before-commit'
export type RepositoryOperation =
  | 'ingest-evidence' | 'complete-evidence' | 'discard-evidence'
  | 'propose-candidate' | 'confirm-candidate'
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
type Lease = { workerId: string; token: string; until: string; version: number }
type State = {
  evidence: Record<string, { evidence: InteractionEvidence; state: string; lease: Lease | undefined }>
  candidates: Record<string, PreferenceCandidate>; preferences: Record<string, PreferenceRecord>
  suppressions: CandidateSuppression[]; receipts: Record<string, {
    actionId: string; mutation: string; payloadHash: string; result: unknown; recordedAt: string
  }>
  audits: AuditEvent[]; completions: Record<string, CompletionProjection>
  discards?: Record<string, DiscardProjection>
  settings?: Record<string, ConnectionSettings>
  evidenceTombstones?: Record<string, EvidenceProvenance>
  policyDecisionDigests?: Record<string, string>
  tombstoneActionDigests?: Record<string, string>
}
type CompletionProjection = {
  evidenceId: string; workerId: string; claimToken: string; leaseVersion: number
  expectedSettingsRevision: number; candidateIdempotencyDigests: string[]; occurredAt: string
}
type DiscardProjection = {
  evidenceId: string; workerId: string; claimToken: string; leaseVersion: number
  expectedSettingsRevision: number
  reasonCode: DiscardEvidenceProcessing['reasonCode']; occurredAt: string
}
const clone = <T>(v: T): T => structuredClone(v)
const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const keys = Object.keys(v as object)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
}
const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const auditIdentity = (i: { userId: string; companionId: string; relationshipId: string }) => ({ userId: i.userId, companionId: i.companionId, relationshipId: i.relationshipId })
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
      : { evidence: {}, candidates: {}, preferences: {}, suppressions: [], receipts: {}, audits: [], completions: {} }
    this.state.completions ??= {}
    this.state.discards ??= {}
  this.state.preferences ??= {}; this.state.suppressions ??= []; this.state.receipts ??= {}
    this.state.settings ??= {}; this.state.evidenceTombstones ??= {}
    this.state.policyDecisionDigests ??= {}; this.state.tombstoneActionDigests ??= {}
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
  discardEvidenceProcessingAtomically(c: DiscardEvidenceProcessing): Promise<void> {
    return Promise.resolve().then(() => this.atomic('discard-evidence', () => {
      const projection: DiscardProjection = {
        evidenceId: c.claim.evidenceId,
        workerId: c.claim.workerId,
        claimToken: c.claim.claimToken,
        leaseVersion: c.claim.leaseVersion,
        expectedSettingsRevision: c.expectedSettingsRevision,
        reasonCode: c.reasonCode,
        occurredAt: c.occurredAt,
      }
      const key = canonical({
        evidenceId: c.claim.evidenceId,
        workerId: c.claim.workerId,
        claimToken: c.claim.claimToken,
        leaseVersion: c.claim.leaseVersion,
      })
      const replay = this.state.discards![key]
      if (replay) {
        if (canonical(replay) !== canonical(projection)) {
          throw new ActionPayloadConflictError(`discard:${key}`)
        }
        return
      }

      const record = this.stale(c.claim, c.occurredAt)
      const identity = auditIdentity(record.evidence.identity)
      const settings = this.state.settings![this.settingsKey(
        identity,
        record.evidence.identity.hostId,
      )] ?? this.defaultSettings(identity, record.evidence.identity.hostId)
      if (c.expectedSettingsRevision !== settings.revision) {
        throw new RevisionConflictError(c.expectedSettingsRevision, settings.revision)
      }

      record.state = 'failed'
      record.lease = undefined
      this.options.failAt?.('discard-evidence', 'after-state')
      this.state.audits.push({
        schemaVersion: 1,
        id: c.auditEventId,
        identity,
        actor: 'observer',
        kind: 'evidence-processing-completed',
        reasonCode: c.reasonCode,
        entity: { kind: 'evidence', evidenceId: record.evidence.id },
        settingsRevision: c.expectedSettingsRevision,
        occurredAt: c.occurredAt,
      })
      this.options.failAt?.('discard-evidence', 'after-audit')
      this.state.discards![key] = clone(projection)
      this.options.failAt?.('discard-evidence', 'after-receipt')
      this.options.failAt?.('discard-evidence', 'before-commit')
    }, true, true))
  }
  getEvidenceProvenance(id: string): Promise<EvidenceProvenance | undefined> {
    const record = this.state.evidence[id]
    return Promise.resolve(record ? clone({ state: 'live', evidence: record.evidence } as EvidenceProvenance) : clone(this.state.evidenceTombstones?.[id]))
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
  private govern<T>(op: RepositoryOperation, c: { actionId: string; occurredAt?: string }, fn: () => T): Promise<T> {
    return Promise.resolve().then(() => this.atomic(op, () => {
      const payloadHash = digest(c); const old = this.state.receipts[c.actionId]
      if (old) {
        if (old.payloadHash !== payloadHash) throw new ActionPayloadConflictError(c.actionId)
        const summary = old.result as { kind: string; candidateId?: string; preferenceId?: string; revision?: number }
        if (summary.kind === 'candidate') {
          const candidate = Object.values(this.state.candidates).find((item) => item.id === summary.candidateId)
          if (!candidate) return undefined as T
          const historical = clone(candidate)
          historical.status = 'pending_confirmation'; historical.revision = summary.revision ?? 0
          historical.updatedAt = candidate.createdAt
          return historical as T
        }
        if (summary.kind === 'preference') {
          const record = this.state.preferences[summary.preferenceId!]
          if (!record) return undefined as T
          const historical = clone(record) as PreferenceRecord
          historical.revision = summary.revision ?? historical.revision
          historical.updatedAt = old.recordedAt
          if (op === 'revoke-preference') historical.status = 'revoked'
          else {
            historical.status = 'active'
            delete historical.supersededBy
          }
          return historical as T
        }
        return undefined as T
      }
      const auditCount = this.state.audits.length
      const result = fn()
      const stagedAudits = this.state.audits.splice(auditCount)
      this.options.failAt?.(op, 'after-state')
      this.state.audits.push(...stagedAudits)
      const summary = result && typeof result === 'object' && 'id' in (result as object)
          ? ('authority' in (result as object)
          ? { kind: 'preference', preferenceId: (result as unknown as PreferenceRecord).id,
            revision: (result as unknown as PreferenceRecord).revision }
          : { kind: 'candidate', candidateId: (result as unknown as PreferenceCandidate).id,
            revision: (result as unknown as PreferenceCandidate).revision })
        : { kind: 'none' }
      this.options.failAt?.(op, 'after-audit')
      this.state.receipts[c.actionId] = { actionId: c.actionId, mutation: op, payloadHash, result: clone(summary), recordedAt: c.occurredAt ?? '' }
      this.options.failAt?.(op, 'after-receipt'); this.options.failAt?.(op, 'before-commit'); return clone(result)
    }, true, true))
  }
  private candidate(id: string, rev: number, pending = false) {
    const x = Object.values(this.state.candidates).find((c) => c.id === id)
    if (!x) throw new InvalidTransitionError('candidate-id-mismatch', 'candidate not found')
    if (pending && x.status !== 'pending_confirmation') {
      throw new InvalidTransitionError('candidate-not-pending', 'candidate is not pending')
    }
    if (x.revision !== rev) throw new RevisionConflictError(rev, x.revision)
    return x
  }
  proposeCandidateAtomically(c: ProposeCandidateCommand): Promise<PreferenceCandidate> {
    return this.govern('propose-candidate', c, () => {
      const existing = Object.values(this.state.candidates).find(
        (item) => item.idempotencyKey.digest === c.idempotencyKey.digest,
      )
      const record: PreferenceCandidate = {
        schemaVersion: 1, id: c.candidateId, identity: clone(c.identity),
        preference: clone(c.preference), scope: clone(c.scope), projection: clone(c.projection),
        provenance: clone(c.provenance), evidenceIds: clone(c.evidenceIds),
        counterEvidenceIds: clone(c.counterEvidenceIds), confidence: c.confidence,
        riskCategory: c.riskCategory, status: 'pending_confirmation',
        idempotencyKey: clone(c.idempotencyKey), revision: 0,
        createdAt: c.occurredAt, updatedAt: c.occurredAt,
        ...(c.expiresAt === undefined ? {} : { expiresAt: c.expiresAt }),
      }
      if (existing) {
        const proposal = (item: PreferenceCandidate) => {
          const { id: _id, status: _status, revision: _revision, createdAt: _created,
            updatedAt: _updated, ...rest } = item
          return rest
        }
        if (canonical(proposal(existing)) !== canonical(proposal(record))) {
          throw new CandidateIdempotencyConflictError()
        }
        return existing
      }
      if (Object.values(this.state.candidates).some((item) => item.id === c.candidateId)) {
        throw new CandidateIdempotencyConflictError()
      }
      this.state.candidates[c.idempotencyKey.digest] = record
      this.state.audits.push({ schemaVersion: 1, id: this.options.auditEventIdFactory(),
        identity: auditIdentity(c.identity), actor: c.provenance.channel === 'mcp' ? 'mcp-agent' : 'user',
        kind: 'candidate-proposed', reasonCode: 'accepted',
        entity: { kind: 'candidate', candidateId: c.candidateId }, actionId: c.actionId,
        revision: 0, occurredAt: c.occurredAt } as AuditEvent)
      return record
    })
  }
  confirmCandidateAtomically(c: ConfirmCandidateCommand): Promise<PreferenceRecord> {
    return this.govern('confirm-candidate', c, () => {
    const x = this.candidate(c.candidateId, c.expectedCandidateRevision, true)
    const active = Object.values(this.state.preferences).find((p) =>
      p.status === 'active' &&
      sameAuditIdentity(p.identity, x.identity) &&
      canonical(p.preference.key) === canonical(c.preference.key) &&
      canonical(p.scope) === canonical(c.scope),
    )
    if (active && (
      !c.supersedesPreference ||
      c.supersedesPreference.preferenceId !== active.id ||
      c.supersedesPreference.expectedRevision !== active.revision
    )) throw new ActivePreferenceSlotOccupiedError()
    if (!active && c.supersedesPreference) throw new ActivePreferenceSlotOccupiedError()
    if (Object.values(this.state.preferences).some((p) => p.id === c.preferenceId)) throw new ActivePreferenceSlotOccupiedError()
    if (active) {
      active.status = 'superseded'
      active.supersededBy = c.preferenceId
      active.revision++
      active.updatedAt = c.occurredAt
    }
    x.status = 'confirmed'; x.revision++; x.updatedAt = c.occurredAt
    const p: PreferenceRecord = {
      schemaVersion: 1, id: c.preferenceId, identity: clone(x.identity),
      preference: clone(c.preference), scope: clone(c.scope), projection: clone(c.projection),
      authority: 'user-confirmed', revision: 1, status: 'active',
      ...(active ? { supersedes: active.id } : {}), evidenceIds: clone(x.evidenceIds),
      createdAt: c.occurredAt, updatedAt: c.occurredAt,
      ...(x.expiresAt === undefined ? {} : { expiresAt: x.expiresAt }),
    }
    this.state.preferences[p.id] = p
    const identity = auditIdentity(x.identity)
    this.state.audits.push({
      schemaVersion: 1, id: this.options.auditEventIdFactory(), identity, actor: 'user',
      kind: 'candidate-confirmed', reasonCode: 'accepted',
      entity: { kind: 'candidate', candidateId: x.id }, actionId: c.actionId,
      revision: x.revision, occurredAt: c.occurredAt,
    } as AuditEvent)
    if (active) {
      this.state.audits.push(...[
        { schemaVersion: 1, id: this.options.auditEventIdFactory(), identity, actor: 'user',
          kind: 'preference-revised', reasonCode: 'superseded',
          entity: { kind: 'preference', preferenceId: active.id }, actionId: c.actionId,
          revision: active.revision, occurredAt: c.occurredAt },
        { schemaVersion: 1, id: this.options.auditEventIdFactory(), identity, actor: 'user',
          kind: 'preference-revised', reasonCode: 'superseded',
          entity: { kind: 'preference', preferenceId: p.id }, actionId: c.actionId,
          revision: p.revision, occurredAt: c.occurredAt },
      ] as AuditEvent[])
    }
    return p
    })
  }
  rejectCandidateAtomically(c: RejectCandidateCommand): Promise<void> {
    return this.govern('reject-candidate', c, () => {
      const x = this.candidate(c.candidateId, c.expectedCandidateRevision, true)
      x.status = 'rejected'; x.revision++; x.updatedAt = c.occurredAt
      this.state.audits.push({
        schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(x.identity),
        actor: 'user', kind: 'candidate-rejected', reasonCode: c.reasonCode ?? 'user-requested',
        entity: { kind: 'candidate', candidateId: x.id }, actionId: c.actionId,
        revision: x.revision, occurredAt: c.occurredAt,
      } as AuditEvent)
      return undefined
    })
  }
  deleteCandidateAtomically(c: DeleteCandidateCommand): Promise<void> {
    return this.govern('delete-candidate', c, () => {
      const x = this.candidate(c.candidateId, c.expectedCandidateRevision, true)
      x.status = 'deleted'; x.revision++; x.updatedAt = c.occurredAt
      this.state.audits.push({
        schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(x.identity),
        actor: 'user', kind: 'candidate-deleted', reasonCode: 'user-requested',
        entity: { kind: 'candidate', candidateId: x.id }, actionId: c.actionId,
        revision: x.revision, occurredAt: c.occurredAt,
      } as AuditEvent)
      return undefined
    })
  }
  suppressCandidateAtomically(c: SuppressCandidateCommand): Promise<void> {
    return this.govern('suppress-candidate', c, () => {
      const x = this.candidate(c.candidateId, c.expectedCandidateRevision, true)
      x.status = 'rejected'; x.revision++; x.updatedAt = c.occurredAt
      this.state.suppressions.push({
        schemaVersion: 1, id: c.suppressionId, identity: clone(x.identity),
        preferenceKey: x.preference.key, scope: clone(x.scope), projection: clone(x.projection),
        createdAt: c.occurredAt,
      })
      this.state.audits.push({
        schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(x.identity),
        actor: 'user', kind: 'candidate-suppressed', reasonCode: 'do-not-suggest-again',
        entity: { kind: 'candidate', candidateId: x.id }, actionId: c.actionId,
        revision: x.revision, occurredAt: c.occurredAt,
      } as AuditEvent)
      return undefined
    })
  }
  listCandidateSuppressions(i: IdentityContext): Promise<CandidateSuppression[]> {
    return Promise.resolve(this.state.suppressions
      .filter((s) => sameAuditIdentity(s.identity, i))
      .sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id))
      .map(clone))
  }
  createExplicitPreferenceAtomically(c: CreateExplicitPreferenceCommand): Promise<PreferenceRecord> {
    return this.govern('create-explicit-preference', c, () => {
      const occupied = Object.values(this.state.preferences).some((p) =>
        p.status === 'active' && sameAuditIdentity(p.identity, c.identity) &&
        canonical(p.preference.key) === canonical(c.preference.key) &&
        canonical(p.scope) === canonical(c.scope))
      if (occupied) throw new ActivePreferenceSlotOccupiedError()
      if (Object.values(this.state.preferences).some((p) => p.id === c.preferenceId)) {
        throw new ActivePreferenceSlotOccupiedError()
      }
      const p: PreferenceRecord = {
        schemaVersion: 1, id: c.preferenceId, identity: clone(c.identity),
        preference: clone(c.preference), scope: clone(c.scope), projection: clone(c.projection),
        authority: 'user-set', revision: 1, status: 'active', evidenceIds: clone(c.evidenceIds),
        createdAt: c.occurredAt, updatedAt: c.occurredAt,
        ...(c.expiresAt ? { expiresAt: c.expiresAt } : {}),
      }
      this.state.preferences[p.id] = p
      this.state.audits.push({
        schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(c.identity),
        actor: 'user', kind: 'preference-created', reasonCode: 'accepted',
        entity: { kind: 'preference', preferenceId: p.id }, actionId: c.actionId,
        revision: p.revision, occurredAt: c.occurredAt,
      } as AuditEvent)
      return p
    })
  }
  revisePreferenceAtomically(c: RevisePreferenceCommand): Promise<PreferenceRecord> {
    return this.govern('revise-preference', c, () => {
      const old = this.state.preferences[c.preferenceId]
      if (!old || old.status !== 'active') {
        throw new InvalidTransitionError('preference-not-active', 'preference is not active')
      }
      if (old.revision !== c.expectedPreferenceRevision) {
        throw new RevisionConflictError(c.expectedPreferenceRevision, old.revision)
      }
      if (this.state.preferences[c.replacementPreferenceId]) {
        throw new ActivePreferenceSlotOccupiedError()
      }
      const p: PreferenceRecord = {
        ...old, id: c.replacementPreferenceId, preference: clone(c.preference),
        scope: clone(c.scope), projection: clone(c.projection), status: 'active', revision: 1,
        supersedes: old.id, evidenceIds: clone(c.evidenceIds), createdAt: c.occurredAt,
        updatedAt: c.occurredAt,
        ...(c.expiresAt === undefined ? {} : { expiresAt: c.expiresAt }),
      }
      if (c.expiresAt === undefined) delete p.expiresAt
      old.status = 'superseded'; old.supersededBy = p.id; old.revision++; old.updatedAt = c.occurredAt
      this.state.preferences[p.id] = p
      const identity = auditIdentity(old.identity)
      this.state.audits.push(...[
        { schemaVersion: 1, id: this.options.auditEventIdFactory(), identity, actor: 'user',
          kind: 'preference-revised', reasonCode: 'superseded',
          entity: { kind: 'preference', preferenceId: old.id }, actionId: c.actionId,
          revision: old.revision, occurredAt: c.occurredAt },
        { schemaVersion: 1, id: this.options.auditEventIdFactory(), identity, actor: 'user',
          kind: 'preference-revised', reasonCode: 'superseded',
          entity: { kind: 'preference', preferenceId: p.id }, actionId: c.actionId,
          revision: p.revision, occurredAt: c.occurredAt },
      ] as AuditEvent[])
      return p
    })
  }
  revokePreferenceAtomically(c: RevokePreferenceCommand): Promise<PreferenceRecord> {
    return this.govern('revoke-preference', c, () => {
      const p = this.state.preferences[c.preferenceId]
      if (!p || p.status !== 'active') {
        throw new InvalidTransitionError('preference-not-active', 'preference is not active')
      }
      if (p.revision !== c.expectedPreferenceRevision) {
        throw new RevisionConflictError(c.expectedPreferenceRevision, p.revision)
      }
      p.status = 'revoked'; p.revision++; p.updatedAt = c.occurredAt
      this.state.audits.push({
        schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(p.identity),
        actor: 'user', kind: 'preference-revoked', reasonCode: 'user-requested',
        entity: { kind: 'preference', preferenceId: p.id }, actionId: c.actionId,
        revision: p.revision, occurredAt: c.occurredAt,
      } as AuditEvent)
      return p
    })
  }
  getPreference(id: string): Promise<PreferenceRecord | undefined> { return Promise.resolve(this.state.preferences[id] ? clone(this.state.preferences[id]) : undefined) }
  listActivePreferences(i: IdentityContext): Promise<PreferenceRecord[]> {
    return Promise.resolve(Object.values(this.state.preferences)
      .filter((p) => p.status === 'active' && sameAuditIdentity(p.identity, i))
      .sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id))
      .map(clone))
  }
  private settingsKey(i: PreferenceIdentity, h: string) { return canonical({ identity: i, hostId: h }) }
  private defaultSettings(i: PreferenceIdentity, h: string): ConnectionSettings { return {
    schemaVersion: 1, identity: clone(i), hostId: h,
    collectionPolicy: { allowedSources: [], retainContent: false },
    outboundInferencePolicy: { mode: 'disabled' }, projectionPolicy: { allowedHosts: [], allowedDomains: [] },
    observeEnabled: false, learnEnabled: false, applyEnabled: false, revision: 0,
    updatedAt: '1970-01-01T00:00:00.000Z',
  } }
  getConnectionSettings(i: PreferenceIdentity, h: string): Promise<ConnectionSettings> {
    return Promise.resolve(clone(this.state.settings![this.settingsKey(i, h)] ?? this.defaultSettings(i, h)))
  }
  updateConnectionSettingsAtomically(c: UpdateConnectionSettingsCommand): Promise<ConnectionSettings> {
    return Promise.resolve().then(() => this.atomic('update-connection-settings', () => {
    const key = this.settingsKey(c.identity, c.hostId), old = this.state.receipts[c.actionId], hash = digest(c)
    if (old) { if (old.payloadHash !== hash) throw new ActionPayloadConflictError(c.actionId); return clone(old.result) as ConnectionSettings }
    const current = this.state.settings![key] ?? this.defaultSettings(c.identity, c.hostId)
    if (current.revision !== c.expectedSettingsRevision) throw new RevisionConflictError(c.expectedSettingsRevision, current.revision)
    const next = { ...current, ...clone(c.patch), identity: clone(c.identity), revision: current.revision + 1, updatedAt: c.occurredAt } as ConnectionSettings
    this.state.settings![key] = next
    this.options.failAt?.('update-connection-settings', 'after-state')
    this.state.audits.push({ schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(c.identity), actor: 'user',
      kind: 'connection-settings-updated', reasonCode: 'accepted',
      entity: { kind: 'connection', hostId: c.hostId }, actionId: c.actionId,
      settingsRevision: next.revision, occurredAt: c.occurredAt } as AuditEvent)
    this.options.failAt?.('update-connection-settings', 'after-audit')
    this.state.receipts[c.actionId] = { actionId: c.actionId, mutation: 'update-connection-settings', payloadHash: hash, result: clone(next), recordedAt: c.occurredAt }
    this.options.failAt?.('update-connection-settings', 'after-receipt')
    this.options.failAt?.('update-connection-settings', 'before-commit')
    return clone(next)
    }, true, true))
  }
  reportAdapterProjectionStatusAtomically(c: ReportProjectionStatusCommand): Promise<AdapterProjectionStatus> {
    return Promise.resolve().then(() => this.atomic('report-projection-status', () => {
    const key = this.settingsKey(c.identity, c.hostId), old = this.state.receipts[c.actionId], hash = digest(c)
    if (old) { if (old.payloadHash !== hash) throw new ActionPayloadConflictError(c.actionId); return clone(old.result) as AdapterProjectionStatus }
    const settings = this.state.settings![key]
    if (!settings || settings.revision !== c.expectedSettingsRevision) throw new RevisionConflictError(c.expectedSettingsRevision, settings?.revision ?? 0)
    const status = clone({ ...c, schemaVersion: 1, settingsRevision: c.expectedSettingsRevision, reportedAt: c.occurredAt })
    delete (status as any).actionId; delete (status as any).occurredAt; delete (status as any).expectedSettingsRevision
    if (c.state === 'tombstone-locally-written' || c.state === 'verified-guidance-absent') delete (status as any).lastGuidanceHash
    ;(status as any).reportedAt = c.occurredAt
    settings.projectionStatus = status as AdapterProjectionStatus
    this.options.failAt?.('report-projection-status', 'after-state')
    const reason = c.state === 'error' ? c.detailCode : 'accepted'
    this.state.audits.push({ schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(c.identity), actor: 'adapter',
      kind: 'projection-status-reported', reasonCode: reason,
      entity: { kind: 'connection', hostId: c.hostId }, actionId: c.actionId,
      settingsRevision: c.expectedSettingsRevision, occurredAt: c.occurredAt } as AuditEvent)
    this.options.failAt?.('report-projection-status', 'after-audit')
    this.state.receipts[c.actionId] = { actionId: c.actionId, mutation: 'report-projection-status', payloadHash: hash, result: clone(status), recordedAt: c.occurredAt }
    this.options.failAt?.('report-projection-status', 'after-receipt')
    this.options.failAt?.('report-projection-status', 'before-commit')
    return clone(status as AdapterProjectionStatus)
    }, true, true))
  }
  recordPolicyDecisionAtomically(d: ContentFreePolicyDecision): Promise<void> {
    return Promise.resolve().then(() => this.atomic('record-policy-decision', () => {
    const payload = { schemaVersion: d.schemaVersion, decisionId: d.decisionId, identity: d.identity,
      hostId: d.hostId, domain: d.domain, settingsRevision: d.settingsRevision, stage: d.stage,
      outcome: d.outcome, reasonCode: d.reasonCode, occurredAt: d.occurredAt }
    const hash = digest(payload), old = this.state.policyDecisionDigests![d.decisionId]
    if (old) {
      if (old !== hash) throw new ActionPayloadConflictError(d.decisionId)
      return
    }
    const settings = this.state.settings![this.settingsKey(d.identity, d.hostId)] ?? this.defaultSettings(d.identity, d.hostId)
    if (d.settingsRevision > settings.revision) throw new RevisionConflictError(d.settingsRevision, settings.revision)
    this.state.audits.push({ schemaVersion: 1, id: d.decisionId, identity: clone(d.identity), actor: 'runtime', kind: 'policy-decision-recorded', reasonCode: d.reasonCode,
      entity: { kind: 'policy-decision', decisionId: d.decisionId }, settingsRevision: d.settingsRevision, occurredAt: d.occurredAt } as AuditEvent)
    this.state.policyDecisionDigests![d.decisionId] = hash
    this.options.failAt?.('record-policy-decision', 'after-state')
    this.options.failAt?.('record-policy-decision', 'after-audit')
    this.options.failAt?.('record-policy-decision', 'before-commit')
    }, false, true))
  }
  deleteEvidenceAtomically(c: DeleteEvidenceCommand): Promise<DeleteEvidenceResult> {
    return Promise.resolve().then(() => this.atomic('delete-evidence', () => {
    const hash = digest(c), old = this.state.receipts[c.actionId]
    if (old) { if (old.payloadHash !== hash) throw new ActionPayloadConflictError(c.actionId); return clone(old.result) as DeleteEvidenceResult }
    const rec = this.state.evidence[c.evidenceId]
    if (!rec) {
      const tombstone = this.state.evidenceTombstones![c.evidenceId]
      if (!tombstone) {
        const e = new Error('evidence not found'); Object.assign(e, { code: 'EVIDENCE_NOT_FOUND' }); throw e
      }
      const result: DeleteEvidenceResult = { kind: 'evidence-deletion', evidenceId: c.evidenceId, disposition: 'already-deleted',
        tombstoneCreated: false, deletedPendingCandidateIds: [], revokedPreferenceIds: [] }
      this.state.tombstoneActionDigests![c.actionId] = hash
      this.options.failAt?.('delete-evidence', 'after-state')
      this.state.audits.push({ schemaVersion: 1, id: c.auditEventId, identity: auditIdentity(c.identity), actor: 'user', kind: 'evidence-deleted',
        reasonCode: 'user-requested', entity: { kind: 'evidence', evidenceId: c.evidenceId }, actionId: c.actionId, occurredAt: c.occurredAt } as AuditEvent)
      this.options.failAt?.('delete-evidence', 'after-audit')
      this.state.receipts[c.actionId] = { actionId: c.actionId, mutation: 'delete-evidence', payloadHash: hash, result, recordedAt: c.occurredAt }
      this.options.failAt?.('delete-evidence', 'after-receipt'); this.options.failAt?.('delete-evidence', 'before-commit')
      return clone(result)
    }
    if (!same(rec.evidence.identity, c.identity)) {
      const e = new Error('evidence not found'); Object.assign(e, { code: 'EVIDENCE_NOT_FOUND' }); throw e
    }
    delete this.state.evidence[c.evidenceId]
    this.state.evidenceTombstones![c.evidenceId] = { state: 'deleted-tombstone', evidenceId: c.evidenceId,
      deletedAt: c.occurredAt, reasonCode: 'user-requested' } as EvidenceProvenance
    const deletedPendingCandidateIds: string[] = []
    for (const [k, x] of Object.entries(this.state.candidates)) {
      const inEvidence = x.evidenceIds.includes(c.evidenceId)
      const inCounter = x.counterEvidenceIds.includes(c.evidenceId)
      const inProvenance = x.provenance.kind === 'observer-evidence' && x.provenance.evidenceIds.includes(c.evidenceId)
      if (!inEvidence && !inCounter && !inProvenance) continue
      if (x.status === 'pending_confirmation' && x.evidenceIds.length === 1) {
        deletedPendingCandidateIds.push(x.id); delete this.state.candidates[k]; continue
      }
      x.evidenceIds = x.evidenceIds.filter((id) => id !== c.evidenceId)
      x.counterEvidenceIds = x.counterEvidenceIds.filter((id) => id !== c.evidenceId)
      if (x.provenance.kind === 'observer-evidence') x.provenance.evidenceIds = x.provenance.evidenceIds.filter((id) => id !== c.evidenceId)
    }
    const revokedPreferenceIds: string[] = []
    if (c.revokeDependentPreferences) for (const p of Object.values(this.state.preferences)) {
      if (p.status !== 'active' || !p.evidenceIds.includes(c.evidenceId)) continue
      p.status = 'revoked'; p.revision++; p.updatedAt = c.occurredAt; revokedPreferenceIds.push(p.id)
      this.state.audits.push({ schemaVersion: 1, id: this.options.auditEventIdFactory(), identity: auditIdentity(p.identity), actor: 'user',
        kind: 'preference-revoked', reasonCode: 'user-requested', entity: { kind: 'preference', preferenceId: p.id },
        actionId: c.actionId, revision: p.revision, occurredAt: c.occurredAt } as AuditEvent)
    }
    deletedPendingCandidateIds.sort(); revokedPreferenceIds.sort()
    const result = { kind: 'evidence-deletion', evidenceId: c.evidenceId, disposition: 'deleted', tombstoneCreated: true,
      deletedPendingCandidateIds, revokedPreferenceIds } as DeleteEvidenceResult
    this.options.failAt?.('delete-evidence', 'after-state')
    this.state.audits.push({ schemaVersion: 1, id: c.auditEventId, identity: auditIdentity(c.identity), actor: 'user', kind: 'evidence-deleted',
      reasonCode: 'user-requested', entity: { kind: 'evidence', evidenceId: c.evidenceId }, actionId: c.actionId, occurredAt: c.occurredAt } as AuditEvent)
    this.options.failAt?.('delete-evidence', 'after-audit')
    this.state.receipts[c.actionId] = { actionId: c.actionId, mutation: 'delete-evidence', payloadHash: hash, result, recordedAt: c.occurredAt }
    this.options.failAt?.('delete-evidence', 'after-receipt'); this.options.failAt?.('delete-evidence', 'before-commit')
    return clone(result)
  }, true, true)) }
}
