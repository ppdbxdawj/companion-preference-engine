import { createHash } from 'node:crypto'

import {
  AdapterProjectionStatusSchema,
  AuditEventSchema,
  ConnectionSettingsSchema,
  EvidenceProvenanceSchema,
  InteractionEvidenceSchema,
  PreferenceCandidateSchema,
  PreferenceIdentitySchema,
  PreferenceRecordSchema,
  PreferenceScopeSchema,
  ProjectionPolicySchema,
} from '@companion-preference/contracts'
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
  ProposeCandidateCommand,
  RejectCandidateCommand,
  ReportProjectionStatusCommand,
  RevisePreferenceCommand,
  RevokePreferenceCommand,
  SuppressCandidateCommand,
  UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import {
  ActionPayloadConflictError,
  InvalidTransitionError,
  RevisionConflictError,
} from '@companion-preference/preference-core'
import {
  ActivePreferenceSlotOccupiedError,
  CandidateIdempotencyConflictError,
  StaleClaimError,
} from '@companion-preference/preference-core'
import type {
  CandidateSuppression,
  CompleteEvidenceProcessing,
  DiscardEvidenceProcessing,
  EvidenceClaim,
  EvidenceClaimRef,
  IngestEvidenceResult,
  PreferenceRepository,
} from '@companion-preference/preference-core'
import type {
  RepositoryAtomicStep,
  RepositoryOperation,
} from '@companion-preference/preference-core'
import * as v from 'valibot'

import { migrateSqliteDatabase } from './database.js'
import type { SqliteDatabase } from './database.js'

export type SqlitePreferenceRepositoryOptions = Readonly<{
  database: SqliteDatabase
  claimTokenFactory: () => string
  auditEventIdFactory: () => string
  failAt?: (operation: RepositoryOperation, step: RepositoryAtomicStep) => void
}>

type Lease = {
  workerId: string
  token: string
  until: string
  version: number
}

type EvidenceState = {
  evidence: InteractionEvidence
  state: 'available' | 'leased' | 'completed' | 'failed'
  lease?: Lease
}

type Receipt = {
  actionId: string
  mutation: string
  payloadHash: string
  result: unknown
  recordedAt: string
}

type StoredCandidateSuppression = CandidateSuppression & {
  candidateId: string
}

type StoredEvidenceTombstone = {
  provenance: EvidenceProvenance
  identity: PreferenceIdentity
}

type State = {
  evidence: Map<string, EvidenceState>
  tombstones: Map<string, StoredEvidenceTombstone>
  candidates: Map<string, PreferenceCandidate>
  suppressions: StoredCandidateSuppression[]
  preferences: Map<string, PreferenceRecord>
  settings: Map<string, ConnectionSettings>
  receipts: Map<string, Receipt>
  audits: AuditEvent[]
}

type Row = Record<string, unknown>

const clone = <T>(value: T): T => structuredClone(value)

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  const keys = Object.keys(object).filter((key) => object[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

const digest = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex')

const parseJson = (value: unknown, label: string): unknown => {
  if (typeof value !== 'string') throw new Error(`Corrupt SQLite ${label}`)
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    throw new Error(`Corrupt SQLite ${label}`)
  }
}

const parseContract = <T>(schema: v.GenericSchema<unknown>, value: unknown, label: string): T => {
  try {
    return v.parse(schema, value) as T
  }
  catch {
    throw new Error(`Corrupt SQLite ${label}`)
  }
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

const auditIdentity = (
  identity: { userId: string, companionId: string, relationshipId: string },
) => ({
  userId: identity.userId,
  companionId: identity.companionId,
  relationshipId: identity.relationshipId,
})

const sameIdentity = (
  left: { userId: string, companionId: string, relationshipId: string },
  right: { userId: string, companionId: string, relationshipId: string },
): boolean =>
  left.userId === right.userId
  && left.companionId === right.companionId
  && left.relationshipId === right.relationshipId

const sameContext = (
  left: { userId: string, companionId: string, relationshipId: string, hostId?: string },
  right: { userId: string, companionId: string, relationshipId: string, hostId?: string },
): boolean => sameIdentity(left, right) && (right.hostId === undefined || left.hostId === right.hostId)

const settingsKey = (identity: PreferenceIdentity, hostId: string): string =>
  canonical({ identity, hostId })

const defaultSettings = (
  identity: PreferenceIdentity,
  hostId: string,
): ConnectionSettings => ({
  schemaVersion: 1,
  identity: clone(identity),
  hostId,
  collectionPolicy: { allowedSources: [], retainContent: false },
  outboundInferencePolicy: { mode: 'disabled' },
  projectionPolicy: { allowedHosts: [], allowedDomains: [] },
  observeEnabled: false,
  learnEnabled: false,
  applyEnabled: false,
  revision: 0,
  updatedAt: '1970-01-01T00:00:00.000Z',
})

const noneResult = { kind: 'none' } as const

export class SqlitePreferenceRepository implements PreferenceRepository {
  readonly database: SqliteDatabase

  constructor(readonly options: SqlitePreferenceRepositoryOptions) {
    this.database = options.database
    migrateSqliteDatabase(this.database)
  }

  private rows(sql: string, ...parameters: unknown[]): Row[] {
    return this.database.prepare(sql).all(...parameters) as Row[]
  }

  private loadState(): State {
    const state: State = {
      evidence: new Map(),
      tombstones: new Map(),
      candidates: new Map(),
      suppressions: [],
      preferences: new Map(),
      settings: new Map(),
      receipts: new Map(),
      audits: [],
    }

    for (const row of this.rows('SELECT * FROM evidence')) {
      const evidence = parseContract<InteractionEvidence>(InteractionEvidenceSchema, {
        schemaVersion: 1,
        id: row.id,
        identity: {
          userId: row.user_id,
          companionId: row.companion_id,
          relationshipId: row.relationship_id,
          hostId: row.host_id,
          sessionId: row.session_id,
          domain: row.domain,
        },
        occurredAt: row.occurred_at,
        sourceRef: row.source_ref,
        source: {
          kind: row.source_kind,
          contentCategory: row.source_content_category,
        },
        consent: parseJson(row.consent_json, 'evidence consent'),
        learningPayload: parseJson(row.learning_payload_json, 'evidence learning payload'),
        policySnapshot: parseJson(row.policy_snapshot_json, 'evidence policy snapshot'),
      }, 'evidence')
      const processingState = row.processing_state
      if (!['available', 'leased', 'completed', 'failed'].includes(String(processingState))) {
        throw new Error('Corrupt SQLite evidence processing state')
      }
      const lease = processingState === 'leased'
        ? {
            workerId: String(row.worker_id),
            token: String(row.claim_token),
            until: String(row.lease_until),
            version: Number(row.lease_version),
          }
        : undefined
      state.evidence.set(evidence.id, {
        evidence,
        state: processingState as EvidenceState['state'],
        ...(lease === undefined ? {} : { lease }),
      })
    }

    for (const row of this.rows('SELECT * FROM evidence_tombstones')) {
      const tombstone = parseContract<EvidenceProvenance>(EvidenceProvenanceSchema, {
        state: 'deleted-tombstone',
        evidenceId: row.evidence_id,
        deletedAt: row.deleted_at,
        reasonCode: row.reason_code,
      }, 'evidence tombstone')
      state.tombstones.set(String(row.evidence_id), {
        provenance: tombstone,
        identity: parseContract<PreferenceIdentity>(PreferenceIdentitySchema, {
          userId: String(row.user_id),
          companionId: String(row.companion_id),
          relationshipId: String(row.relationship_id),
        }, 'evidence tombstone identity'),
      })
    }

    for (const row of this.rows('SELECT * FROM candidates')) {
      const candidate = parseContract<PreferenceCandidate>(PreferenceCandidateSchema, {
        schemaVersion: 1,
        id: row.id,
        identity: {
          userId: row.user_id,
          companionId: row.companion_id,
          relationshipId: row.relationship_id,
        },
        preference: { key: row.preference_key, value: row.preference_value },
        scope: parseJson(row.scope_json, 'candidate scope'),
        projection: parseJson(row.projection_json, 'candidate projection'),
        provenance: parseJson(row.provenance_json, 'candidate provenance'),
        sourceHostIds: parseJson(row.source_host_ids_json, 'candidate source hosts'),
        evidenceIds: parseJson(row.evidence_ids_json, 'candidate evidence IDs'),
        counterEvidenceIds: parseJson(row.counter_evidence_ids_json, 'candidate counter-evidence IDs'),
        confidence: row.confidence,
        riskCategory: row.risk_category,
        status: row.status,
        idempotencyKey: {
          version: row.idempotency_version,
          algorithm: row.idempotency_algorithm,
          digest: row.idempotency_digest,
        },
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
      }, 'candidate')
      state.candidates.set(candidate.id, candidate)
    }

    for (const row of this.rows('SELECT * FROM candidate_suppressions')) {
      const scope = parseContract<CandidateSuppression['scope']>(PreferenceScopeSchema, parseJson(row.scope_json, 'suppression scope'), 'suppression scope')
      const projection = parseContract<CandidateSuppression['projection']>(ProjectionPolicySchema, parseJson(row.projection_json, 'suppression projection'), 'suppression projection')
      state.suppressions.push({
        schemaVersion: 1,
        id: String(row.id),
        candidateId: String(row.candidate_id),
        identity: {
          userId: String(row.user_id),
          companionId: String(row.companion_id),
          relationshipId: String(row.relationship_id),
        },
        preferenceKey: row.preference_key as CandidateSuppression['preferenceKey'],
        scope,
        projection,
        createdAt: String(row.created_at),
      })
    }

    for (const row of this.rows('SELECT * FROM preferences')) {
      const preference = parseContract<PreferenceRecord>(PreferenceRecordSchema, {
        schemaVersion: 1,
        id: row.id,
        identity: {
          userId: row.user_id,
          companionId: row.companion_id,
          relationshipId: row.relationship_id,
        },
        preference: { key: row.preference_key, value: row.preference_value },
        scope: parseJson(row.scope_json, 'preference scope'),
        projection: parseJson(row.projection_json, 'preference projection'),
        authority: row.authority,
        revision: row.revision,
        status: row.status,
        ...(row.supersedes === null ? {} : { supersedes: row.supersedes }),
        ...(row.superseded_by === null ? {} : { supersededBy: row.superseded_by }),
        evidenceIds: parseJson(row.evidence_ids_json, 'preference evidence IDs'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
      }, 'preference')
      state.preferences.set(preference.id, preference)
    }

    for (const row of this.rows('SELECT * FROM connection_settings')) {
      const settings = parseContract<ConnectionSettings>(ConnectionSettingsSchema, {
        schemaVersion: 1,
        identity: {
          userId: row.user_id,
          companionId: row.companion_id,
          relationshipId: row.relationship_id,
        },
        hostId: row.host_id,
        collectionPolicy: parseJson(row.collection_policy_json, 'collection policy'),
        outboundInferencePolicy: parseJson(row.outbound_inference_policy_json, 'outbound policy'),
        projectionPolicy: parseJson(row.projection_policy_json, 'projection policy'),
        observeEnabled: row.observe_enabled === 1,
        learnEnabled: row.learn_enabled === 1,
        applyEnabled: row.apply_enabled === 1,
        revision: row.revision,
        ...(row.projection_status_json === null
          ? {}
          : { projectionStatus: parseJson(row.projection_status_json, 'projection status') }),
        updatedAt: row.updated_at,
      }, 'connection settings')
      state.settings.set(settingsKey(settings.identity, settings.hostId), settings)
    }

    for (const row of this.rows('SELECT * FROM mutation_receipts')) {
      const receipt: Receipt = {
        actionId: String(row.action_id),
        mutation: String(row.mutation),
        payloadHash: String(row.payload_hash),
        result: parseJson(row.result_json, 'mutation receipt result'),
        recordedAt: String(row.recorded_at),
      }
      if (!/^[0-9a-f]{64}$/.test(receipt.payloadHash)) {
        throw new Error('Corrupt SQLite mutation receipt hash')
      }
      state.receipts.set(receipt.actionId, receipt)
    }

    for (const row of this.rows('SELECT * FROM audit_events')) {
      const stored = parseJson(row.entity_json, 'audit entity') as {
        entity?: unknown
        actionId?: unknown
      }
      const audit = parseContract<AuditEvent>(AuditEventSchema, {
        schemaVersion: 1,
        id: row.id,
        identity: {
          userId: row.user_id,
          companionId: row.companion_id,
          relationshipId: row.relationship_id,
        },
        actor: row.actor,
        kind: row.kind,
        reasonCode: row.reason_code,
        entity: stored.entity,
        ...(stored.actionId === undefined ? {} : { actionId: stored.actionId }),
        ...(row.settings_revision === null ? {} : { settingsRevision: row.settings_revision }),
        occurredAt: row.occurred_at,
        ...(row.revision === null ? {} : { revision: row.revision }),
      }, 'audit event')
      state.audits.push(audit)
    }

    return state
  }

  private saveState(state: State): void {
    this.database.exec(`
      DELETE FROM audit_events;
      DELETE FROM candidate_suppressions;
      DELETE FROM candidates;
      DELETE FROM connection_settings;
      DELETE FROM preferences;
      DELETE FROM evidence_tombstones;
      DELETE FROM evidence;
      DELETE FROM mutation_receipts;
    `)

    const insertEvidence = this.database.prepare(`
      INSERT INTO evidence (
        id, user_id, companion_id, relationship_id, host_id, session_id, domain,
        occurred_at, source_ref, source_kind, source_content_category, consent_json,
        learning_payload_json, policy_snapshot_json, processing_state, worker_id,
        claim_token, lease_version, lease_until, settings_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const record of state.evidence.values()) {
      const evidence = record.evidence
      insertEvidence.run(
        evidence.id,
        evidence.identity.userId,
        evidence.identity.companionId,
        evidence.identity.relationshipId,
        evidence.identity.hostId,
        evidence.identity.sessionId,
        evidence.identity.domain,
        evidence.occurredAt,
        evidence.sourceRef,
        evidence.source.kind,
        evidence.source.contentCategory,
        canonical(evidence.consent),
        canonical(evidence.learningPayload),
        canonical(evidence.policySnapshot),
        record.state,
        record.lease?.workerId ?? null,
        record.lease?.token ?? null,
        record.lease?.version ?? 0,
        record.lease?.until ?? null,
        evidence.policySnapshot.settingsRevision,
      )
    }

    const insertTombstone = this.database.prepare(`
      INSERT INTO evidence_tombstones (
        evidence_id, user_id, companion_id, relationship_id, deleted_at, reason_code
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const stored of state.tombstones.values()) {
      const { identity, provenance: tombstone } = stored
      if (tombstone.state !== 'deleted-tombstone') throw new Error('Invalid evidence tombstone')
      insertTombstone.run(
        tombstone.evidenceId,
        identity.userId,
        identity.companionId,
        identity.relationshipId,
        tombstone.deletedAt,
        tombstone.reasonCode,
      )
    }

    const insertCandidate = this.database.prepare(`
      INSERT INTO candidates (
        id, user_id, companion_id, relationship_id, preference_key, preference_value,
        scope_json, projection_json, provenance_json, source_host_ids_json, evidence_ids_json,
        counter_evidence_ids_json, confidence, risk_category, status,
        idempotency_version, idempotency_algorithm, idempotency_digest, revision,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const candidate of state.candidates.values()) {
      parseContract<PreferenceCandidate>(PreferenceCandidateSchema, candidate, 'candidate write')
      insertCandidate.run(
        candidate.id,
        candidate.identity.userId,
        candidate.identity.companionId,
        candidate.identity.relationshipId,
        candidate.preference.key,
        candidate.preference.value,
        canonical(candidate.scope),
        canonical(candidate.projection),
        canonical(candidate.provenance),
        canonical(candidate.sourceHostIds),
        canonical(candidate.evidenceIds),
        canonical(candidate.counterEvidenceIds),
        candidate.confidence,
        candidate.riskCategory,
        candidate.status,
        candidate.idempotencyKey.version,
        candidate.idempotencyKey.algorithm,
        candidate.idempotencyKey.digest,
        candidate.revision,
        candidate.createdAt,
        candidate.updatedAt,
        candidate.expiresAt ?? null,
      )
    }

    const insertSuppression = this.database.prepare(`
      INSERT INTO candidate_suppressions (
        id, candidate_id, user_id, companion_id, relationship_id, preference_key,
        scope_json, projection_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const suppression of state.suppressions) {
      insertSuppression.run(
        suppression.id,
        suppression.candidateId,
        suppression.identity.userId,
        suppression.identity.companionId,
        suppression.identity.relationshipId,
        suppression.preferenceKey,
        canonical(suppression.scope),
        canonical(suppression.projection),
        suppression.createdAt,
      )
    }

    const insertPreference = this.database.prepare(`
      INSERT INTO preferences (
        id, user_id, companion_id, relationship_id, preference_key, preference_value,
        scope_json, projection_json, authority, revision, status, supersedes,
        superseded_by, evidence_ids_json, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const preference of state.preferences.values()) {
      parseContract<PreferenceRecord>(PreferenceRecordSchema, preference, 'preference write')
      insertPreference.run(
        preference.id,
        preference.identity.userId,
        preference.identity.companionId,
        preference.identity.relationshipId,
        preference.preference.key,
        preference.preference.value,
        canonical(preference.scope),
        canonical(preference.projection),
        preference.authority,
        preference.revision,
        preference.status,
        preference.supersedes ?? null,
        preference.supersededBy ?? null,
        canonical(preference.evidenceIds),
        preference.createdAt,
        preference.updatedAt,
        preference.expiresAt ?? null,
      )
    }

    const insertSettings = this.database.prepare(`
      INSERT INTO connection_settings (
        user_id, companion_id, relationship_id, host_id, collection_policy_json,
        outbound_inference_policy_json, projection_policy_json, observe_enabled,
        learn_enabled, apply_enabled, revision, projection_status_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const settings of state.settings.values()) {
      parseContract<ConnectionSettings>(ConnectionSettingsSchema, settings, 'connection settings write')
      insertSettings.run(
        settings.identity.userId,
        settings.identity.companionId,
        settings.identity.relationshipId,
        settings.hostId,
        canonical(settings.collectionPolicy),
        canonical(settings.outboundInferencePolicy),
        canonical(settings.projectionPolicy),
        settings.observeEnabled ? 1 : 0,
        settings.learnEnabled ? 1 : 0,
        settings.applyEnabled ? 1 : 0,
        settings.revision,
        settings.projectionStatus === undefined ? null : canonical(settings.projectionStatus),
        settings.updatedAt,
      )
    }

    const insertReceipt = this.database.prepare(`
      INSERT INTO mutation_receipts (
        action_id, mutation, payload_hash, result_json, recorded_at
      ) VALUES (?, ?, ?, ?, ?)
    `)
    for (const receipt of state.receipts.values()) {
      insertReceipt.run(
        receipt.actionId,
        receipt.mutation,
        receipt.payloadHash,
        canonical(receipt.result),
        receipt.recordedAt,
      )
    }

    const insertAudit = this.database.prepare(`
      INSERT INTO audit_events (
        id, user_id, companion_id, relationship_id, actor, kind, reason_code,
        entity_json, settings_revision, occurred_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const audit of state.audits) {
      parseContract<AuditEvent>(AuditEventSchema, audit, 'audit write')
      const auditMetadata = audit as AuditEvent & {
        actionId?: string
        revision?: number
        settingsRevision?: number
      }
      insertAudit.run(
        audit.id,
        audit.identity.userId,
        audit.identity.companionId,
        audit.identity.relationshipId,
        audit.actor,
        audit.kind,
        audit.reasonCode,
        canonical({
          entity: audit.entity,
          ...(auditMetadata.actionId === undefined ? {} : { actionId: auditMetadata.actionId }),
        }),
        auditMetadata.settingsRevision ?? null,
        audit.occurredAt,
        auditMetadata.revision ?? null,
      )
    }
  }

  private transact<T>(mutate: (state: State) => T): T {
    return this.database.transaction(() => {
      const state = this.loadState()
      const result = mutate(state)
      this.saveState(state)
      return clone(result)
    })()
  }

  private fail(operation: RepositoryOperation, step: RepositoryAtomicStep): void {
    this.options.failAt?.(operation, step)
  }

  private stale(state: State, claim: EvidenceClaimRef, now?: string): EvidenceState {
    const record = state.evidence.get(claim.evidenceId)
    const invalid = !record
      || record.state !== 'leased'
      || record.lease === undefined
      || record.lease.workerId !== claim.workerId
      || record.lease.token !== claim.claimToken
      || record.lease.version !== claim.leaseVersion
      || (now !== undefined && record.lease.until <= now)
    if (invalid) throw new StaleClaimError('stale claim')
    return record
  }

  private candidate(
    state: State,
    id: string,
    revision: number,
    pending = false,
  ): PreferenceCandidate {
    const candidate = state.candidates.get(id)
    if (!candidate) {
      throw new InvalidTransitionError('candidate-id-mismatch', 'candidate not found')
    }
    if (pending && candidate.status !== 'pending_confirmation') {
      throw new InvalidTransitionError('candidate-not-pending', 'candidate is not pending')
    }
    if (candidate.revision !== revision) {
      throw new RevisionConflictError(revision, candidate.revision)
    }
    return candidate
  }

  private audit(state: State, event: AuditEvent): void {
    state.audits.push(parseContract<AuditEvent>(AuditEventSchema, clone(event), 'new audit event'))
  }

  private receiptReplay<T>(
    state: State,
    operation: string,
    actionId: string,
    payload: unknown,
    parseResult: (value: unknown) => T,
  ): T | undefined {
    const receipt = state.receipts.get(actionId)
    if (!receipt) return undefined
    if (receipt.mutation !== operation || receipt.payloadHash !== digest(payload)) {
      throw new ActionPayloadConflictError(actionId)
    }
    return parseResult(clone(receipt.result))
  }

  private recordReceipt(
    state: State,
    operation: string,
    actionId: string,
    payload: unknown,
    result: unknown,
    recordedAt: string,
  ): void {
    state.receipts.set(actionId, {
      actionId,
      mutation: operation,
      payloadHash: digest(payload),
      result: clone(result),
      recordedAt,
    })
  }

  private governed<T>(
    operation: RepositoryOperation,
    command: { actionId: string, occurredAt: string },
    parseReplay: (value: unknown) => T,
    mutate: (state: State) => T,
  ): Promise<T> {
    return Promise.resolve().then(() => this.transact((state) => {
      const replay = this.receiptReplay(state, operation, command.actionId, command, parseReplay)
      if (state.receipts.has(command.actionId)) return replay as T
      const result = mutate(state)
      this.fail(operation, 'after-state')
      this.fail(operation, 'after-audit')
      this.recordReceipt(state, operation, command.actionId, command, result ?? noneResult, command.occurredAt)
      this.fail(operation, 'after-receipt')
      this.fail(operation, 'before-commit')
      return result
    }))
  }

  ingestEvidenceAtomically(evidence: InteractionEvidence): Promise<IngestEvidenceResult> {
    return Promise.resolve().then(() => this.transact((state) => {
      const validated = parseContract<InteractionEvidence>(InteractionEvidenceSchema, clone(evidence), 'evidence input')
      const duplicate = [...state.evidence.values()].some((record) => {
        const existing = record.evidence
        return existing.identity.userId === validated.identity.userId
          && existing.identity.companionId === validated.identity.companionId
          && existing.identity.relationshipId === validated.identity.relationshipId
          && existing.identity.hostId === validated.identity.hostId
          && existing.sourceRef === validated.sourceRef
      })
      if (duplicate) return 'duplicate'
      state.evidence.set(validated.id, { evidence: validated, state: 'available' })
      this.fail('ingest-evidence', 'after-state')
      this.audit(state, {
        schemaVersion: 1,
        id: this.options.auditEventIdFactory(),
        identity: auditIdentity(validated.identity),
        actor: 'adapter',
        kind: 'evidence-ingested',
        reasonCode: 'accepted',
        entity: { kind: 'evidence', evidenceId: validated.id },
        occurredAt: validated.occurredAt,
      })
      this.fail('ingest-evidence', 'after-audit')
      this.fail('ingest-evidence', 'before-commit')
      return 'inserted'
    }))
  }

  claimNextEvidence(workerId: string, leaseUntil: string, now: string): Promise<EvidenceClaim | undefined> {
    return Promise.resolve().then(() => this.transact((state) => {
      const record = [...state.evidence.values()]
        .filter((item) => item.state === 'available'
          || (item.state === 'leased' && item.lease !== undefined && item.lease.until <= now))
        .sort((left, right) => compare(left.evidence.occurredAt, right.evidence.occurredAt)
          || compare(left.evidence.id, right.evidence.id))[0]
      if (!record) return undefined
      const version = (record.lease?.version ?? 0) + 1
      const token = this.options.claimTokenFactory()
      record.state = 'leased'
      record.lease = { workerId, token, until: leaseUntil, version }
      return {
        evidence: clone(record.evidence),
        evidenceId: record.evidence.id,
        workerId,
        claimToken: token,
        leaseVersion: version,
        leaseUntil,
        settingsRevision: record.evidence.policySnapshot.settingsRevision,
      }
    }))
  }

  renewEvidenceClaim(claim: EvidenceClaimRef, leaseUntil: string, now: string): Promise<void> {
    return Promise.resolve().then(() => this.transact((state) => {
      this.stale(state, claim, now).lease!.until = leaseUntil
    }))
  }

  releaseEvidenceClaim(claim: EvidenceClaimRef): Promise<void> {
    return Promise.resolve().then(() => this.transact((state) => {
      const record = this.stale(state, claim)
      record.state = 'available'
      delete record.lease
    }))
  }

  completeEvidenceProcessingAtomically(command: CompleteEvidenceProcessing): Promise<void> {
    return Promise.resolve().then(() => this.transact((state) => {
      const completionProjection = {
        evidenceId: command.claim.evidenceId,
        workerId: command.claim.workerId,
        claimToken: command.claim.claimToken,
        leaseVersion: command.claim.leaseVersion,
        expectedSettingsRevision: command.expectedSettingsRevision,
        candidateIdempotencyDigests: command.candidates.map((candidate) =>
          candidate.proposal.idempotencyKey.digest),
        occurredAt: command.occurredAt,
      }
      const completionKey = `completion:${canonical({
        evidenceId: command.claim.evidenceId,
        workerId: command.claim.workerId,
        claimToken: command.claim.claimToken,
        leaseVersion: command.claim.leaseVersion,
      })}`
      const replay = this.receiptReplay(
        state,
        'complete-evidence',
        completionKey,
        completionProjection,
        () => undefined,
      )
      if (state.receipts.has(completionKey)) {
        replay
        return
      }
      const record = this.stale(state, command.claim, command.occurredAt)
      if (command.expectedSettingsRevision !== record.evidence.policySnapshot.settingsRevision) {
        throw new Error('STALE_SETTINGS_REVISION')
      }
      const evidenceIdentity = auditIdentity(record.evidence.identity)
      const currentSettings = state.settings.get(settingsKey(
        evidenceIdentity,
        record.evidence.identity.hostId,
      )) ?? defaultSettings(evidenceIdentity, record.evidence.identity.hostId)
      if (command.expectedSettingsRevision !== currentSettings.revision) {
        throw new RevisionConflictError(
          command.expectedSettingsRevision,
          currentSettings.revision,
        )
      }
      const inserted: typeof command.candidates[number][] = []
      for (const item of command.candidates) {
        const proposal = item.proposal
        const existingByDigest = [...state.candidates.values()].find((candidate) =>
          candidate.idempotencyKey.digest === proposal.idempotencyKey.digest)
        const expected: PreferenceCandidate = {
          ...clone(proposal),
          schemaVersion: 1,
          id: item.candidateId,
          status: 'pending_confirmation',
          revision: 0,
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
        }
        if (existingByDigest) {
          const stable = (candidate: PreferenceCandidate) => {
            const { id: _id, status: _status, revision: _revision, createdAt: _createdAt,
              updatedAt: _updatedAt, ...rest } = candidate
            return rest
          }
          if (canonical(stable(existingByDigest)) !== canonical(stable(expected))) {
            throw new CandidateIdempotencyConflictError()
          }
          continue
        }
        if (state.candidates.has(item.candidateId)) throw new CandidateIdempotencyConflictError()
        state.candidates.set(expected.id, parseContract<PreferenceCandidate>(PreferenceCandidateSchema, expected, 'completed candidate'))
        inserted.push(item)
      }
      record.state = 'completed'
      delete record.lease
      this.fail('complete-evidence', 'after-state')
      for (const item of inserted) {
        this.audit(state, {
          schemaVersion: 1,
          id: item.auditEventId,
          identity: auditIdentity(record.evidence.identity),
          actor: 'observer',
          kind: 'candidate-proposed',
          reasonCode: 'accepted',
          entity: { kind: 'candidate', candidateId: item.candidateId },
          occurredAt: command.occurredAt,
          revision: 0,
        })
      }
      this.audit(state, {
        schemaVersion: 1,
        id: command.auditEventId,
        identity: auditIdentity(record.evidence.identity),
        actor: 'observer',
        kind: 'evidence-processing-completed',
        reasonCode: 'accepted',
        entity: { kind: 'evidence', evidenceId: record.evidence.id },
        settingsRevision: command.expectedSettingsRevision,
        occurredAt: command.occurredAt,
      })
      this.fail('complete-evidence', 'after-audit')
      this.recordReceipt(
        state,
        'complete-evidence',
        completionKey,
        completionProjection,
        noneResult,
        command.occurredAt,
      )
      this.fail('complete-evidence', 'after-receipt')
      this.fail('complete-evidence', 'before-commit')
    }))
  }

  discardEvidenceProcessingAtomically(command: DiscardEvidenceProcessing): Promise<void> {
    return Promise.resolve().then(() => this.transact((state) => {
      const projection = {
        evidenceId: command.claim.evidenceId,
        workerId: command.claim.workerId,
        claimToken: command.claim.claimToken,
        leaseVersion: command.claim.leaseVersion,
        expectedSettingsRevision: command.expectedSettingsRevision,
        reasonCode: command.reasonCode,
        occurredAt: command.occurredAt,
      }
      const receiptKey = `discard:${canonical({
        evidenceId: command.claim.evidenceId,
        workerId: command.claim.workerId,
        claimToken: command.claim.claimToken,
        leaseVersion: command.claim.leaseVersion,
      })}`
      this.receiptReplay(
        state,
        'discard-evidence',
        receiptKey,
        projection,
        () => undefined,
      )
      if (state.receipts.has(receiptKey)) return

      const record = this.stale(state, command.claim, command.occurredAt)
      const identity = auditIdentity(record.evidence.identity)
      const currentSettings = state.settings.get(settingsKey(
        identity,
        record.evidence.identity.hostId,
      )) ?? defaultSettings(identity, record.evidence.identity.hostId)
      if (command.expectedSettingsRevision !== currentSettings.revision) {
        throw new RevisionConflictError(
          command.expectedSettingsRevision,
          currentSettings.revision,
        )
      }

      record.state = 'failed'
      delete record.lease
      this.fail('discard-evidence', 'after-state')
      this.audit(state, {
        schemaVersion: 1,
        id: command.auditEventId,
        identity,
        actor: 'observer',
        kind: 'evidence-processing-completed',
        reasonCode: command.reasonCode,
        entity: { kind: 'evidence', evidenceId: record.evidence.id },
        settingsRevision: command.expectedSettingsRevision,
        occurredAt: command.occurredAt,
      })
      this.fail('discard-evidence', 'after-audit')
      this.recordReceipt(
        state,
        'discard-evidence',
        receiptKey,
        projection,
        noneResult,
        command.occurredAt,
      )
      this.fail('discard-evidence', 'after-receipt')
      this.fail('discard-evidence', 'before-commit')
    }))
  }

  getEvidenceProvenance(id: string): Promise<EvidenceProvenance | undefined> {
    const state = this.loadState()
    const live = state.evidence.get(id)
    return Promise.resolve(live
      ? clone({ state: 'live', evidence: live.evidence } as EvidenceProvenance)
      : clone(state.tombstones.get(id)?.provenance))
  }

  listEvidenceProvenance(identity: IdentityContext): Promise<EvidenceProvenance[]> {
    const state = this.loadState()
    return Promise.resolve([...state.evidence.values()]
      .filter((record) => sameContext(record.evidence.identity, identity))
      .sort((left, right) => compare(left.evidence.occurredAt, right.evidence.occurredAt)
        || compare(left.evidence.id, right.evidence.id))
      .map((record) => clone({ state: 'live', evidence: record.evidence } as EvidenceProvenance)))
  }

  proposeCandidateAtomically(command: ProposeCandidateCommand): Promise<PreferenceCandidate> {
    return this.governed('propose-candidate', command,
      (value) => parseContract<PreferenceCandidate>(PreferenceCandidateSchema, value, 'candidate receipt'),
      (state) => {
        const record = parseContract<PreferenceCandidate>(PreferenceCandidateSchema, {
          schemaVersion: 1,
          id: command.candidateId,
          identity: clone(command.identity),
          preference: clone(command.preference),
          scope: clone(command.scope),
          projection: clone(command.projection),
          provenance: clone(command.provenance),
          sourceHostIds: clone(command.sourceHostIds),
          evidenceIds: clone(command.evidenceIds),
          counterEvidenceIds: clone(command.counterEvidenceIds),
          confidence: command.confidence,
          riskCategory: command.riskCategory,
          status: 'pending_confirmation',
          idempotencyKey: clone(command.idempotencyKey),
          revision: 0,
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
          ...(command.expiresAt === undefined ? {} : { expiresAt: command.expiresAt }),
        }, 'proposed candidate')
        const existing = [...state.candidates.values()].find((candidate) =>
          candidate.idempotencyKey.digest === command.idempotencyKey.digest)
        const stable = (candidate: PreferenceCandidate) => {
          const { id: _id, status: _status, revision: _revision,
            createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = candidate
          return rest
        }
        if (existing) {
          if (canonical(stable(existing)) !== canonical(stable(record))) {
            throw new CandidateIdempotencyConflictError()
          }
          return existing
        }
        if (state.candidates.has(command.candidateId)) throw new CandidateIdempotencyConflictError()
        state.candidates.set(record.id, record)
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity: auditIdentity(command.identity),
          actor: command.provenance.channel === 'mcp' ? 'mcp-agent' : 'user',
          kind: 'candidate-proposed',
          reasonCode: 'accepted',
          entity: { kind: 'candidate', candidateId: record.id },
          actionId: command.actionId,
          revision: 0,
          occurredAt: command.occurredAt,
        })
        return record
      })
  }

  getCandidate(id: string): Promise<PreferenceCandidate | undefined> {
    return Promise.resolve(clone(this.loadState().candidates.get(id)))
  }

  listCandidates(status?: CandidateStatus): Promise<PreferenceCandidate[]> {
    return Promise.resolve([...this.loadState().candidates.values()]
      .filter((candidate) => status === undefined || candidate.status === status)
      .sort((left, right) => compare(left.createdAt, right.createdAt) || compare(left.id, right.id))
      .map(clone))
  }

  confirmCandidateAtomically(command: ConfirmCandidateCommand): Promise<PreferenceRecord> {
    return this.governed('confirm-candidate', command,
      (value) => parseContract<PreferenceRecord>(PreferenceRecordSchema, value, 'preference receipt'),
      (state) => {
        const candidate = this.candidate(state, command.candidateId, command.expectedCandidateRevision, true)
        const active = [...state.preferences.values()].find((preference) =>
          preference.status === 'active'
          && sameIdentity(preference.identity, candidate.identity)
          && preference.preference.key === command.preference.key
          && canonical(preference.scope) === canonical(command.scope))
        if (active && (!command.supersedesPreference
          || command.supersedesPreference.preferenceId !== active.id
          || command.supersedesPreference.expectedRevision !== active.revision)) {
          throw new ActivePreferenceSlotOccupiedError()
        }
        if (!active && command.supersedesPreference) throw new ActivePreferenceSlotOccupiedError()
        if (state.preferences.has(command.preferenceId)) throw new ActivePreferenceSlotOccupiedError()
        if (active) {
          active.status = 'superseded'
          active.supersededBy = command.preferenceId
          active.revision++
          active.updatedAt = command.occurredAt
        }
        candidate.status = 'confirmed'
        candidate.revision++
        candidate.updatedAt = command.occurredAt
        const preference = parseContract<PreferenceRecord>(PreferenceRecordSchema, {
          schemaVersion: 1,
          id: command.preferenceId,
          identity: clone(candidate.identity),
          preference: clone(command.preference),
          scope: clone(command.scope),
          projection: clone(command.projection),
          authority: 'user-confirmed',
          revision: 1,
          status: 'active',
          ...(active ? { supersedes: active.id } : {}),
          evidenceIds: clone(candidate.evidenceIds),
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
          ...(candidate.expiresAt === undefined ? {} : { expiresAt: candidate.expiresAt }),
        }, 'confirmed preference')
        state.preferences.set(preference.id, preference)
        const identity = auditIdentity(candidate.identity)
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity,
          actor: 'user',
          kind: 'candidate-confirmed',
          reasonCode: 'accepted',
          entity: { kind: 'candidate', candidateId: candidate.id },
          actionId: command.actionId,
          revision: candidate.revision,
          occurredAt: command.occurredAt,
        })
        if (active) {
          this.audit(state, {
            schemaVersion: 1,
            id: this.options.auditEventIdFactory(),
            identity,
            actor: 'user',
            kind: 'preference-revised',
            reasonCode: 'superseded',
            entity: { kind: 'preference', preferenceId: active.id },
            actionId: command.actionId,
            revision: active.revision,
            occurredAt: command.occurredAt,
          })
          this.audit(state, {
            schemaVersion: 1,
            id: this.options.auditEventIdFactory(),
            identity,
            actor: 'user',
            kind: 'preference-revised',
            reasonCode: 'superseded',
            entity: { kind: 'preference', preferenceId: preference.id },
            actionId: command.actionId,
            revision: preference.revision,
            occurredAt: command.occurredAt,
          })
        }
        return preference
      })
  }

  rejectCandidateAtomically(command: RejectCandidateCommand): Promise<void> {
    return this.governed('reject-candidate', command, () => undefined, (state) => {
      const candidate = this.candidate(state, command.candidateId, command.expectedCandidateRevision, true)
      candidate.status = 'rejected'
      candidate.revision++
      candidate.updatedAt = command.occurredAt
      this.audit(state, {
        schemaVersion: 1,
        id: this.options.auditEventIdFactory(),
        identity: auditIdentity(candidate.identity),
        actor: 'user',
        kind: 'candidate-rejected',
        reasonCode: command.reasonCode === 'not-a-preference'
          ? 'not-a-preference'
          : 'user-requested',
        entity: { kind: 'candidate', candidateId: candidate.id },
        actionId: command.actionId,
        revision: candidate.revision,
        occurredAt: command.occurredAt,
      })
    })
  }

  deleteCandidateAtomically(command: DeleteCandidateCommand): Promise<void> {
    return this.governed('delete-candidate', command, () => undefined, (state) => {
      const candidate = this.candidate(state, command.candidateId, command.expectedCandidateRevision, true)
      candidate.status = 'deleted'
      candidate.revision++
      candidate.updatedAt = command.occurredAt
      this.audit(state, {
        schemaVersion: 1,
        id: this.options.auditEventIdFactory(),
        identity: auditIdentity(candidate.identity),
        actor: 'user',
        kind: 'candidate-deleted',
        reasonCode: 'user-requested',
        entity: { kind: 'candidate', candidateId: candidate.id },
        actionId: command.actionId,
        revision: candidate.revision,
        occurredAt: command.occurredAt,
      })
    })
  }

  suppressCandidateAtomically(command: SuppressCandidateCommand): Promise<void> {
    return this.governed('suppress-candidate', command, () => undefined, (state) => {
      const candidate = this.candidate(state, command.candidateId, command.expectedCandidateRevision, true)
      candidate.status = 'rejected'
      candidate.revision++
      candidate.updatedAt = command.occurredAt
      state.suppressions.push({
        schemaVersion: 1,
        id: command.suppressionId,
        candidateId: candidate.id,
        identity: clone(candidate.identity),
        preferenceKey: candidate.preference.key,
        scope: clone(candidate.scope),
        projection: clone(candidate.projection),
        createdAt: command.occurredAt,
      })
      this.audit(state, {
        schemaVersion: 1,
        id: this.options.auditEventIdFactory(),
        identity: auditIdentity(candidate.identity),
        actor: 'user',
        kind: 'candidate-suppressed',
        reasonCode: 'do-not-suggest-again',
        entity: { kind: 'candidate', candidateId: candidate.id },
        actionId: command.actionId,
        revision: candidate.revision,
        occurredAt: command.occurredAt,
      })
    })
  }

  listCandidateSuppressions(identity: IdentityContext): Promise<CandidateSuppression[]> {
    return Promise.resolve(this.loadState().suppressions
      .filter((suppression) => sameIdentity(suppression.identity, identity))
      .sort((left, right) => compare(left.createdAt, right.createdAt) || compare(left.id, right.id))
      .map(({ candidateId: _candidateId, ...suppression }) => clone(suppression)))
  }

  createExplicitPreferenceAtomically(command: CreateExplicitPreferenceCommand): Promise<PreferenceRecord> {
    return this.governed('create-explicit-preference', command,
      (value) => parseContract<PreferenceRecord>(PreferenceRecordSchema, value, 'preference receipt'),
      (state) => {
        const occupied = [...state.preferences.values()].some((preference) =>
          preference.status === 'active'
          && sameIdentity(preference.identity, command.identity)
          && preference.preference.key === command.preference.key
          && canonical(preference.scope) === canonical(command.scope))
        if (occupied || state.preferences.has(command.preferenceId)) {
          throw new ActivePreferenceSlotOccupiedError()
        }
        const preference = parseContract<PreferenceRecord>(PreferenceRecordSchema, {
          schemaVersion: 1,
          id: command.preferenceId,
          identity: clone(command.identity),
          preference: clone(command.preference),
          scope: clone(command.scope),
          projection: clone(command.projection),
          authority: 'user-set',
          revision: 1,
          status: 'active',
          evidenceIds: clone(command.evidenceIds),
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
          ...(command.expiresAt === undefined ? {} : { expiresAt: command.expiresAt }),
        }, 'explicit preference')
        state.preferences.set(preference.id, preference)
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity: auditIdentity(command.identity),
          actor: 'user',
          kind: 'preference-created',
          reasonCode: 'accepted',
          entity: { kind: 'preference', preferenceId: preference.id },
          actionId: command.actionId,
          revision: preference.revision,
          occurredAt: command.occurredAt,
        })
        return preference
      })
  }

  revisePreferenceAtomically(command: RevisePreferenceCommand): Promise<PreferenceRecord> {
    return this.governed('revise-preference', command,
      (value) => parseContract<PreferenceRecord>(PreferenceRecordSchema, value, 'preference receipt'),
      (state) => {
        const previous = state.preferences.get(command.preferenceId)
        if (!previous || previous.status !== 'active') {
          throw new InvalidTransitionError('preference-not-active', 'preference is not active')
        }
        if (previous.revision !== command.expectedPreferenceRevision) {
          throw new RevisionConflictError(command.expectedPreferenceRevision, previous.revision)
        }
        if (state.preferences.has(command.replacementPreferenceId)) {
          throw new ActivePreferenceSlotOccupiedError()
        }
        previous.status = 'superseded'
        previous.supersededBy = command.replacementPreferenceId
        previous.revision++
        previous.updatedAt = command.occurredAt
        const replacement = parseContract<PreferenceRecord>(PreferenceRecordSchema, {
          ...clone(previous),
          id: command.replacementPreferenceId,
          preference: clone(command.preference),
          scope: clone(command.scope),
          projection: clone(command.projection),
          status: 'active',
          revision: 1,
          supersedes: previous.id,
          supersededBy: undefined,
          evidenceIds: clone(command.evidenceIds),
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
          ...(command.expiresAt === undefined ? { expiresAt: undefined } : { expiresAt: command.expiresAt }),
        }, 'revised preference')
        state.preferences.set(replacement.id, replacement)
        const identity = auditIdentity(previous.identity)
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity,
          actor: 'user',
          kind: 'preference-revised',
          reasonCode: 'superseded',
          entity: { kind: 'preference', preferenceId: previous.id },
          actionId: command.actionId,
          revision: previous.revision,
          occurredAt: command.occurredAt,
        })
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity,
          actor: 'user',
          kind: 'preference-revised',
          reasonCode: 'superseded',
          entity: { kind: 'preference', preferenceId: replacement.id },
          actionId: command.actionId,
          revision: replacement.revision,
          occurredAt: command.occurredAt,
        })
        return replacement
      })
  }

  revokePreferenceAtomically(command: RevokePreferenceCommand): Promise<PreferenceRecord> {
    return this.governed('revoke-preference', command,
      (value) => parseContract<PreferenceRecord>(PreferenceRecordSchema, value, 'preference receipt'),
      (state) => {
        const preference = state.preferences.get(command.preferenceId)
        if (!preference || preference.status !== 'active') {
          throw new InvalidTransitionError('preference-not-active', 'preference is not active')
        }
        if (preference.revision !== command.expectedPreferenceRevision) {
          throw new RevisionConflictError(command.expectedPreferenceRevision, preference.revision)
        }
        preference.status = 'revoked'
        preference.revision++
        preference.updatedAt = command.occurredAt
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity: auditIdentity(preference.identity),
          actor: 'user',
          kind: 'preference-revoked',
          reasonCode: 'user-requested',
          entity: { kind: 'preference', preferenceId: preference.id },
          actionId: command.actionId,
          revision: preference.revision,
          occurredAt: command.occurredAt,
        })
        return preference
      })
  }

  getPreference(id: string): Promise<PreferenceRecord | undefined> {
    return Promise.resolve(clone(this.loadState().preferences.get(id)))
  }

  listActivePreferences(identity: IdentityContext): Promise<PreferenceRecord[]> {
    return Promise.resolve([...this.loadState().preferences.values()]
      .filter((preference) => preference.status === 'active' && sameIdentity(preference.identity, identity))
      .sort((left, right) => compare(left.createdAt, right.createdAt) || compare(left.id, right.id))
      .map(clone))
  }

  getConnectionSettings(identity: PreferenceIdentity, hostId: string): Promise<ConnectionSettings> {
    const current = this.loadState().settings.get(settingsKey(identity, hostId))
    return Promise.resolve(clone(current ?? defaultSettings(identity, hostId)))
  }

  listConnectionSettings(identity: PreferenceIdentity): Promise<ConnectionSettings[]> {
    return Promise.resolve([...this.loadState().settings.values()]
      .filter((settings) => sameIdentity(settings.identity, identity))
      .sort((left, right) => compare(left.hostId, right.hostId))
      .map(clone))
  }

  updateConnectionSettingsAtomically(command: UpdateConnectionSettingsCommand): Promise<ConnectionSettings> {
    return this.governed('update-connection-settings', command,
      (value) => parseContract<ConnectionSettings>(ConnectionSettingsSchema, value, 'connection settings receipt'),
      (state) => {
        const key = settingsKey(command.identity, command.hostId)
        const current = state.settings.get(key) ?? defaultSettings(command.identity, command.hostId)
        if (current.revision !== command.expectedSettingsRevision) {
          throw new RevisionConflictError(command.expectedSettingsRevision, current.revision)
        }
        const next = parseContract<ConnectionSettings>(ConnectionSettingsSchema, {
          ...clone(current),
          ...clone(command.patch),
          identity: clone(command.identity),
          hostId: command.hostId,
          revision: current.revision + 1,
          updatedAt: command.occurredAt,
        }, 'updated connection settings')
        state.settings.set(key, next)
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity: auditIdentity(command.identity),
          actor: 'user',
          kind: 'connection-settings-updated',
          reasonCode: 'accepted',
          entity: { kind: 'connection', hostId: command.hostId },
          actionId: command.actionId,
          settingsRevision: next.revision,
          occurredAt: command.occurredAt,
        })
        return next
      })
  }

  reportAdapterProjectionStatusAtomically(command: ReportProjectionStatusCommand): Promise<AdapterProjectionStatus> {
    return this.governed('report-projection-status', command,
      (value) => parseContract<AdapterProjectionStatus>(AdapterProjectionStatusSchema, value, 'projection status receipt'),
      (state) => {
        const key = settingsKey(command.identity, command.hostId)
        const settings = state.settings.get(key)
        if (!settings || settings.revision !== command.expectedSettingsRevision) {
          throw new RevisionConflictError(command.expectedSettingsRevision, settings?.revision ?? 0)
        }
        const raw = {
          schemaVersion: 1,
          identity: clone(command.identity),
          hostId: command.hostId,
          domain: command.domain,
          state: command.state,
          settingsRevision: command.expectedSettingsRevision,
          connectionState: command.connectionState,
          lastAttemptAt: command.lastAttemptAt,
          detailCode: command.detailCode,
          reportedAt: command.occurredAt,
          ...('lastGuidanceHash' in command && command.lastGuidanceHash !== undefined
            ? { lastGuidanceHash: command.lastGuidanceHash }
            : {}),
        }
        const status = parseContract<AdapterProjectionStatus>(AdapterProjectionStatusSchema, raw, 'projection status')
        settings.projectionStatus = status
        const reasonCode = command.state === 'error'
          ? command.detailCode as 'transport-write-failed' | 'verification-failed'
            | 'transport-disconnected' | 'runtime-unavailable'
          : 'accepted'
        this.audit(state, {
          schemaVersion: 1,
          id: this.options.auditEventIdFactory(),
          identity: auditIdentity(command.identity),
          actor: 'adapter',
          kind: 'projection-status-reported',
          reasonCode,
          entity: { kind: 'connection', hostId: command.hostId },
          actionId: command.actionId,
          settingsRevision: command.expectedSettingsRevision,
          occurredAt: command.occurredAt,
        })
        return status
      })
  }

  recordPolicyDecisionAtomically(decision: ContentFreePolicyDecision): Promise<void> {
    return Promise.resolve().then(() => this.transact((state) => {
      const operation = 'record-policy-decision'
      const replay = this.receiptReplay(state, operation, decision.decisionId, decision, () => undefined)
      if (state.receipts.has(decision.decisionId)) {
        replay
        return
      }
      const current = state.settings.get(settingsKey(decision.identity, decision.hostId))
        ?? defaultSettings(decision.identity, decision.hostId)
      if (decision.settingsRevision > current.revision) {
        throw new RevisionConflictError(decision.settingsRevision, current.revision)
      }
      this.fail(operation, 'after-state')
      this.audit(state, {
        schemaVersion: 1,
        id: decision.decisionId,
        identity: clone(decision.identity),
        actor: 'runtime',
        kind: 'policy-decision-recorded',
        reasonCode: decision.reasonCode,
        entity: { kind: 'policy-decision', decisionId: decision.decisionId },
        settingsRevision: decision.settingsRevision,
        occurredAt: decision.occurredAt,
      })
      this.fail(operation, 'after-audit')
      this.recordReceipt(state, operation, decision.decisionId, decision, noneResult, decision.occurredAt)
      this.fail(operation, 'before-commit')
    }))
  }

  listAuditEvents(query: AuditQuery): Promise<AuditEvent[]> {
    return Promise.resolve(this.loadState().audits
      .filter((audit) => sameIdentity(audit.identity, query.identity))
      .filter((audit) => query.actors === undefined || query.actors.includes(audit.actor))
      .filter((audit) => query.kinds === undefined || query.kinds.includes(audit.kind))
      .filter((audit) => query.entity === undefined || canonical(audit.entity) === canonical(query.entity))
      .filter((audit) => query.occurredAtOrAfter === undefined || audit.occurredAt >= query.occurredAtOrAfter)
      .filter((audit) => query.occurredBefore === undefined || audit.occurredAt < query.occurredBefore)
      .sort((left, right) => compare(left.occurredAt, right.occurredAt) || compare(left.id, right.id))
      .slice(0, query.limit ?? Number.POSITIVE_INFINITY)
      .map(clone))
  }

  deleteEvidenceAtomically(command: DeleteEvidenceCommand): Promise<DeleteEvidenceResult> {
    return this.governed('delete-evidence', command,
      (value) => clone(value) as DeleteEvidenceResult,
      (state) => {
        const record = state.evidence.get(command.evidenceId)
        if (!record) {
          const tombstone = state.tombstones.get(command.evidenceId)
          if (!tombstone || !sameIdentity(tombstone.identity, command.identity)) {
            const error = new Error('evidence not found')
            Object.assign(error, { code: 'EVIDENCE_NOT_FOUND' })
            throw error
          }
          const result: DeleteEvidenceResult = {
            kind: 'evidence-deletion',
            evidenceId: command.evidenceId,
            disposition: 'already-deleted',
            tombstoneCreated: false,
            deletedPendingCandidateIds: [],
            revokedPreferenceIds: [],
          }
          this.audit(state, {
            schemaVersion: 1,
            id: command.auditEventId,
            identity: auditIdentity(command.identity),
            actor: 'user',
            kind: 'evidence-deleted',
            reasonCode: 'user-requested',
            entity: { kind: 'evidence', evidenceId: command.evidenceId },
            actionId: command.actionId,
            occurredAt: command.occurredAt,
          })
          return result
        }
        if (!sameContext(record.evidence.identity, command.identity)) {
          const error = new Error('evidence not found')
          Object.assign(error, { code: 'EVIDENCE_NOT_FOUND' })
          throw error
        }
        state.evidence.delete(command.evidenceId)
        state.tombstones.set(command.evidenceId, {
          identity: auditIdentity(record.evidence.identity),
          provenance: {
            state: 'deleted-tombstone',
            evidenceId: command.evidenceId,
            deletedAt: command.occurredAt,
            reasonCode: 'user-requested',
          },
        })
        const deletedPendingCandidateIds: string[] = []
        for (const [id, candidate] of state.candidates) {
          const references = candidate.evidenceIds.includes(command.evidenceId)
            || candidate.counterEvidenceIds.includes(command.evidenceId)
            || (candidate.provenance.kind === 'observer-evidence'
              && candidate.provenance.evidenceIds.includes(command.evidenceId))
          if (!references) continue
          if (candidate.status === 'pending_confirmation' && candidate.evidenceIds.length === 1) {
            deletedPendingCandidateIds.push(candidate.id)
            state.candidates.delete(id)
            continue
          }
          if (candidate.status === 'pending_confirmation') {
            candidate.evidenceIds = candidate.evidenceIds.filter((id) => id !== command.evidenceId)
            candidate.counterEvidenceIds = candidate.counterEvidenceIds.filter((id) => id !== command.evidenceId)
            if (candidate.provenance.kind === 'observer-evidence') {
              candidate.provenance.evidenceIds = candidate.provenance.evidenceIds
                .filter((id) => id !== command.evidenceId)
            }
          }
        }
        const revokedPreferenceIds: string[] = []
        if (command.revokeDependentPreferences) {
          for (const preference of state.preferences.values()) {
            if (preference.status !== 'active' || !preference.evidenceIds.includes(command.evidenceId)) continue
            preference.status = 'revoked'
            preference.revision++
            preference.updatedAt = command.occurredAt
            revokedPreferenceIds.push(preference.id)
            this.audit(state, {
              schemaVersion: 1,
              id: this.options.auditEventIdFactory(),
              identity: auditIdentity(preference.identity),
              actor: 'user',
              kind: 'preference-revoked',
              reasonCode: 'user-requested',
              entity: { kind: 'preference', preferenceId: preference.id },
              actionId: command.actionId,
              revision: preference.revision,
              occurredAt: command.occurredAt,
            })
          }
        }
        deletedPendingCandidateIds.sort()
        revokedPreferenceIds.sort()
        const result: DeleteEvidenceResult = {
          kind: 'evidence-deletion',
          evidenceId: command.evidenceId,
          disposition: 'deleted',
          tombstoneCreated: true,
          deletedPendingCandidateIds,
          revokedPreferenceIds,
        }
        this.audit(state, {
          schemaVersion: 1,
          id: command.auditEventId,
          identity: auditIdentity(command.identity),
          actor: 'user',
          kind: 'evidence-deleted',
          reasonCode: 'user-requested',
          entity: { kind: 'evidence', evidenceId: command.evidenceId },
          actionId: command.actionId,
          occurredAt: command.occurredAt,
        })
        return result
      })
  }
}
