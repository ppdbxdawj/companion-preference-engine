import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  confirmCandidateCommandFixture,
  createExplicitPreferenceCommandFixture,
  deleteEvidenceCommandFixture,
  identityContextFixture,
  interactionEvidenceFixture,
  pendingCandidateProposalFixture,
  preferenceIdentityFixture,
  proposeCandidateCommandFixture,
  updateConnectionSettingsCommandFixture,
} from '../../contracts/src/fixtures.js'
import type {
  ConfirmCandidateCommand,
  CreateExplicitPreferenceCommand,
  InteractionEvidence,
  PendingCandidateProposal,
  ProposeCandidateCommand,
  UpdateConnectionSettingsCommand,
} from '../../contracts/src/schemas.js'
import {
  ActionPayloadConflictError,
  CandidateIdempotencyConflictError,
  RevisionConflictError,
} from '@companion-preference/preference-core'
import type {
  CompleteEvidenceProcessing,
  DiscardEvidenceProcessing,
  PreferenceRepository,
} from '../../preference-core/src/repository.js'
import type {
  RepositoryAtomicStep,
  RepositoryOperation,
} from '../../preference-core/src/in-memory-repository.js'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkpointSqliteWal,
  migrateSqliteDatabase,
  openSqliteDatabase,
} from './database.js'
import { SqlitePreferenceRepository } from './repository.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const temporaryDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'companion-preference-sqlite-'))
  temporaryDirectories.push(directory)
  return join(directory, 'profile.sqlite')
}

type DatabaseHandle = ReturnType<typeof openSqliteDatabase>

const openFileDatabase = (filename = temporaryDatabasePath()): DatabaseHandle => {
  mkdirSync(dirname(filename), { recursive: true })
  return openSqliteDatabase({ filename })
}

let nextToken = 0
let nextAudit = 0

const createRepository = (
  database: DatabaseHandle,
  failAt?: (operation: RepositoryOperation, step: RepositoryAtomicStep) => void,
): PreferenceRepository => new SqlitePreferenceRepository({
  database,
  claimTokenFactory: () => `sqlite-claim-${++nextToken}`,
  auditEventIdFactory: () => `sqlite-audit-${++nextAudit}`,
  ...(failAt === undefined ? {} : { failAt }),
})

const cloneEvidence = (): InteractionEvidence =>
  structuredClone(interactionEvidenceFixture) as unknown as InteractionEvidence

const cloneProposal = (): PendingCandidateProposal =>
  structuredClone(pendingCandidateProposalFixture) as unknown as PendingCandidateProposal

const seedCanonicalSettingsForEvidence = async (
  repository: PreferenceRepository,
  evidence: InteractionEvidence,
): Promise<void> => {
  const current = await repository.getConnectionSettings(
    preferenceIdentityFixture,
    evidence.identity.hostId,
  )
  if (current.revision === evidence.policySnapshot.settingsRevision) return
  expect(current.revision).toBe(0)
  expect(evidence.policySnapshot.settingsRevision).toBe(1)
  await repository.updateConnectionSettingsAtomically({
    actionId: `settings-for-${evidence.id}`,
    identity: structuredClone(preferenceIdentityFixture),
    hostId: evidence.identity.hostId,
    expectedSettingsRevision: current.revision,
    patch: {
      collectionPolicy: structuredClone(evidence.policySnapshot.collection),
      outboundInferencePolicy: structuredClone(evidence.policySnapshot.outboundInference),
      projectionPolicy: structuredClone(evidence.policySnapshot.projection),
      observeEnabled: true,
      learnEnabled: true,
    },
    occurredAt: '2026-08-21T03:59:00Z',
  })
}

const seedObservedCandidate = async (
  repository: PreferenceRepository,
  candidateId = 'candidate-1',
): Promise<void> => {
  const evidence = cloneEvidence()
  await seedCanonicalSettingsForEvidence(repository, evidence)
  await repository.ingestEvidenceAtomically(evidence)
  const claim = await repository.claimNextEvidence(
    'sqlite-worker',
    '2026-08-21T04:10:00Z',
    '2026-08-21T04:00:00Z',
  )
  expect(claim).toBeDefined()
  await repository.completeEvidenceProcessingAtomically({
    claim: claim!,
    expectedSettingsRevision: evidence.policySnapshot.settingsRevision,
    candidates: [{
      candidateId,
      proposal: cloneProposal(),
      auditEventId: `audit-proposed-${candidateId}`,
    }],
    auditEventId: `audit-completed-${candidateId}`,
    occurredAt: '2026-08-21T04:01:00Z',
  })
}

const queryRows = (
  database: DatabaseHandle,
  sql: string,
): Array<Record<string, unknown>> =>
  database.prepare(sql).all() as Array<Record<string, unknown>>

const tableNames = [
  'audit_events',
  'candidate_suppressions',
  'candidates',
  'connection_settings',
  'evidence',
  'evidence_tombstones',
  'mutation_receipts',
  'preferences',
  'schema_migrations',
] as const

describe('SqlitePreferenceRepository persistence oracle', () => {
  it('applies the initial migration idempotently and creates only the designated domain tables', () => {
    const database = openFileDatabase()

    migrateSqliteDatabase(database)
    migrateSqliteDatabase(database)

    const actualTables = queryRows(
      database,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).map((row) => row.name)
    expect(actualTables).toEqual([...tableNames].sort())
    expect(queryRows(database, 'SELECT version FROM schema_migrations ORDER BY version'))
      .toEqual([{ version: 1 }])

    database.close()
  })

  it('deduplicates evidence only by the complete identity, host, and sourceRef tuple', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const evidence = cloneEvidence()

    expect(await repository.ingestEvidenceAtomically(evidence)).toBe('inserted')
    expect(await repository.ingestEvidenceAtomically({
      ...evidence,
      id: 'same-source-another-id',
    })).toBe('duplicate')
    expect(await repository.ingestEvidenceAtomically({
      ...evidence,
      id: 'same-source-another-host',
      identity: {
        ...evidence.identity,
        hostId: 'another-host',
      },
    })).toBe('inserted')
    expect(await repository.listAuditEvents({ identity: evidence.identity })).toHaveLength(2)

    database.close()
  })

  it('enforces candidate digest and candidate ID idempotency independently of action receipts', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const original = structuredClone(proposeCandidateCommandFixture) as unknown as ProposeCandidateCommand
    const inserted = await repository.proposeCandidateAtomically(original)

    const sameDigest = {
      ...structuredClone(original),
      actionId: 'action-same-candidate-digest',
      candidateId: 'candidate-id-that-must-not-be-inserted',
    } as ProposeCandidateCommand
    expect(await repository.proposeCandidateAtomically(sameDigest)).toEqual(inserted)
    expect(await repository.listCandidates()).toHaveLength(1)

    await expect(repository.proposeCandidateAtomically({
      ...structuredClone(original),
      actionId: 'action-conflicting-candidate-digest',
      candidateId: 'candidate-conflicting-digest',
      preference: { key: 'interaction.response_detail', value: 'detailed' },
    } as ProposeCandidateCommand)).rejects.toBeInstanceOf(CandidateIdempotencyConflictError)

    await expect(repository.proposeCandidateAtomically({
      ...structuredClone(original),
      actionId: 'action-conflicting-candidate-id',
      idempotencyKey: { ...original.idempotencyKey, digest: 'a'.repeat(64) },
      preference: { key: 'interaction.response_detail', value: 'detailed' },
    } as ProposeCandidateCommand)).rejects.toBeInstanceOf(CandidateIdempotencyConflictError)

    database.close()
  })

  it('replays action receipts after reopen and rejects reused action IDs with another payload or mutation', async () => {
    const filename = temporaryDatabasePath()
    const command = structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand
    let database = openFileDatabase(filename)
    let repository = createRepository(database)
    const original = await repository.createExplicitPreferenceAtomically(command)
    checkpointSqliteWal(database)
    database.close()

    database = openFileDatabase(filename)
    repository = createRepository(database)
    expect(await repository.createExplicitPreferenceAtomically(command)).toEqual(original)
    expect(await repository.listAuditEvents({ identity: command.identity })).toHaveLength(1)

    await expect(repository.createExplicitPreferenceAtomically({
      ...command,
      preference: { key: 'interaction.response_detail', value: 'detailed' },
    })).rejects.toBeInstanceOf(ActionPayloadConflictError)

    await expect(repository.updateConnectionSettingsAtomically({
      ...structuredClone(updateConnectionSettingsCommandFixture),
      actionId: command.actionId,
      expectedSettingsRevision: 0,
    } as unknown as UpdateConnectionSettingsCommand)).rejects
      .toBeInstanceOf(ActionPayloadConflictError)
    expect(await repository.getPreference(original.id)).toEqual(original)

    database.close()
  })

  it.each<RepositoryAtomicStep>([
    'after-state',
    'after-audit',
    'after-receipt',
    'before-commit',
  ])('rolls back state, audit, and receipt when failure is injected at %s', async (injectedStep) => {
    const database = openFileDatabase()
    let armed = true
    const repository = createRepository(database, (operation, step) => {
      if (armed && operation === 'create-explicit-preference' && step === injectedStep) {
        throw new Error(`sqlite-rollback-${injectedStep}`)
      }
    })
    const command = structuredClone(createExplicitPreferenceCommandFixture) as unknown as CreateExplicitPreferenceCommand

    await expect(repository.createExplicitPreferenceAtomically(command))
      .rejects.toThrow(`sqlite-rollback-${injectedStep}`)
    expect(await repository.getPreference(command.preferenceId)).toBeUndefined()
    expect(await repository.listAuditEvents({ identity: command.identity })).toEqual([])

    armed = false
    const retried = await repository.createExplicitPreferenceAtomically(command)
    expect(retried.id).toBe(command.preferenceId)
    expect(await repository.listAuditEvents({ identity: command.identity })).toHaveLength(1)

    database.close()
  })

  it('reclaims an expired lease with a higher fence and rejects the old completion', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const evidence = cloneEvidence()
    await seedCanonicalSettingsForEvidence(repository, evidence)
    await repository.ingestEvidenceAtomically(evidence)

    const oldClaim = (await repository.claimNextEvidence(
      'worker-old',
      '2026-08-21T04:01:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const freshClaim = (await repository.claimNextEvidence(
      'worker-fresh',
      '2026-08-21T04:03:00Z',
      '2026-08-21T04:01:01Z',
    ))!
    expect(freshClaim.leaseVersion).toBe(oldClaim.leaseVersion + 1)

    const staleCompletion: CompleteEvidenceProcessing = {
      claim: oldClaim,
      expectedSettingsRevision: evidence.policySnapshot.settingsRevision,
      candidates: [{
        candidateId: 'candidate-from-stale-worker',
        proposal: cloneProposal(),
        auditEventId: 'audit-stale-proposal',
      }],
      auditEventId: 'audit-stale-completion',
      occurredAt: '2026-08-21T04:01:02Z',
    }
    await expect(repository.completeEvidenceProcessingAtomically(staleCompletion))
      .rejects.toMatchObject({ code: 'STALE_CLAIM' })
    expect(await repository.listCandidates()).toEqual([])

    await repository.completeEvidenceProcessingAtomically({
      ...staleCompletion,
      claim: freshClaim,
      candidates: [{
        ...staleCompletion.candidates[0]!,
        candidateId: 'candidate-from-fresh-worker',
        auditEventId: 'audit-fresh-proposal',
      }],
      auditEventId: 'audit-fresh-completion',
      occurredAt: '2026-08-21T04:01:03Z',
    })
    expect((await repository.listCandidates()).map((candidate) => candidate.id))
      .toEqual(['candidate-from-fresh-worker'])

    database.close()
  })

  it('rejects completion when canonical connection settings advance after the claim', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const evidence = cloneEvidence()
    const initialSettings = await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-before-stale-completion',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 0,
      patch: {
        collectionPolicy: structuredClone(evidence.policySnapshot.collection),
        outboundInferencePolicy: structuredClone(evidence.policySnapshot.outboundInference),
        projectionPolicy: structuredClone(evidence.policySnapshot.projection),
        observeEnabled: true,
        learnEnabled: true,
      },
      occurredAt: '2026-08-21T03:59:00Z',
    })
    expect(initialSettings.revision).toBe(evidence.policySnapshot.settingsRevision)

    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'worker-before-settings-change',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!

    const updatedSettings = await repository.updateConnectionSettingsAtomically({
      actionId: 'settings-during-observation',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: initialSettings.revision,
      patch: { learnEnabled: false },
      occurredAt: '2026-08-21T04:00:30Z',
    })

    await expect(repository.completeEvidenceProcessingAtomically({
      claim,
      expectedSettingsRevision: initialSettings.revision,
      candidates: [{
        candidateId: 'candidate-from-stale-settings',
        proposal: cloneProposal(),
        auditEventId: 'audit-stale-settings-proposal',
      }],
      auditEventId: 'audit-stale-settings-completion',
      occurredAt: '2026-08-21T04:01:00Z',
    })).rejects.toEqual(new RevisionConflictError(
      initialSettings.revision,
      updatedSettings.revision,
    ))
    expect(await repository.listCandidates()).toEqual([])
    expect(await repository.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['candidate-proposed', 'evidence-processing-completed'],
    })).toEqual([])

    database.close()
  })

  it('durably terminally discards claimed evidence under the current canonical settings fence', async () => {
    const filename = temporaryDatabasePath()
    let database = openFileDatabase(filename)
    let repository = createRepository(database)
    const evidence = cloneEvidence()
    await seedCanonicalSettingsForEvidence(repository, evidence)
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'sqlite-discard-worker',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const settings = await repository.updateConnectionSettingsAtomically({
      actionId: 'sqlite-settings-revoked-during-observation',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 1,
      patch: { learnEnabled: false },
      occurredAt: '2026-08-21T04:00:30Z',
    })
    const command: DiscardEvidenceProcessing = {
      claim,
      expectedSettingsRevision: settings.revision,
      reasonCode: 'stale-settings-revision',
      auditEventId: 'sqlite-audit-discarded-evidence',
      occurredAt: '2026-08-21T04:01:00Z',
    }

    await repository.discardEvidenceProcessingAtomically(command)
    await repository.discardEvidenceProcessingAtomically({
      ...command,
      auditEventId: 'ignored-sqlite-audit-id-on-discard-replay',
    })
    await expect(repository.discardEvidenceProcessingAtomically({
      ...command,
      reasonCode: 'late-result-discarded',
    })).rejects.toBeInstanceOf(ActionPayloadConflictError)
    expect(await repository.listCandidates()).toEqual([])
    expect(queryRows(database, 'SELECT processing_state, worker_id, claim_token, lease_until FROM evidence'))
      .toEqual([{ processing_state: 'failed', worker_id: null, claim_token: null, lease_until: null }])
    const audits = await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })
    expect(audits).toEqual([{
      schemaVersion: 1,
      id: command.auditEventId,
      identity: structuredClone(preferenceIdentityFixture),
      actor: 'observer',
      kind: 'evidence-processing-completed',
      reasonCode: 'stale-settings-revision',
      entity: { kind: 'evidence', evidenceId: evidence.id },
      settingsRevision: settings.revision,
      occurredAt: command.occurredAt,
    }])

    checkpointSqliteWal(database)
    database.close()
    database = openFileDatabase(filename)
    repository = createRepository(database)
    await repository.discardEvidenceProcessingAtomically(command)
    expect(await repository.claimNextEvidence(
      'worker-after-discard-restart',
      '2026-08-21T04:20:00Z',
      '2026-08-21T04:11:00Z',
    )).toBeUndefined()
    expect(await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })).toEqual(audits)
    database.close()
  })

  it('rejects stale claims, deleted evidence, and stale settings fences when discarding', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const evidence = cloneEvidence()
    await seedCanonicalSettingsForEvidence(repository, evidence)
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'sqlite-discard-worker',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const settings = await repository.updateConnectionSettingsAtomically({
      actionId: 'sqlite-settings-before-discard-rejections',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: evidence.identity.hostId,
      expectedSettingsRevision: 1,
      patch: { learnEnabled: false },
      occurredAt: '2026-08-21T04:00:30Z',
    })
    const command: DiscardEvidenceProcessing = {
      claim,
      expectedSettingsRevision: settings.revision,
      reasonCode: 'late-result-discarded',
      auditEventId: 'sqlite-audit-valid-discard',
      occurredAt: '2026-08-21T04:01:00Z',
    }

    for (const claimPatch of [
      { workerId: 'wrong-worker' },
      { claimToken: 'wrong-claim-token' },
      { leaseVersion: claim.leaseVersion + 1 },
    ]) {
      await expect(repository.discardEvidenceProcessingAtomically({
        ...command,
        claim: { ...claim, ...claimPatch },
      })).rejects.toMatchObject({ code: 'STALE_CLAIM' })
    }
    await expect(repository.discardEvidenceProcessingAtomically({
      ...command,
      expectedSettingsRevision: settings.revision - 1,
    })).rejects.toEqual(new RevisionConflictError(settings.revision - 1, settings.revision))

    await repository.deleteEvidenceAtomically(structuredClone(deleteEvidenceCommandFixture))
    await expect(repository.discardEvidenceProcessingAtomically(command))
      .rejects.toMatchObject({ code: 'STALE_CLAIM' })
    expect(await repository.listCandidates()).toEqual([])
    expect(await repository.listAuditEvents({
      identity: evidence.identity,
      kinds: ['evidence-processing-completed'],
    })).toEqual([])
    database.close()
  })

  it('rolls back terminal discard state, audit, and receipt in one SQLite transaction', async () => {
    const database = openFileDatabase()
    let fail = true
    const repository = createRepository(database, (operation, step) => {
      if (fail && operation === 'discard-evidence' && step === 'before-commit') {
        fail = false
        throw new Error('sqlite-rollback-discard')
      }
    })
    const evidence = cloneEvidence()
    await seedCanonicalSettingsForEvidence(repository, evidence)
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'sqlite-discard-rollback-worker',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!
    const command: DiscardEvidenceProcessing = {
      claim,
      expectedSettingsRevision: 1,
      reasonCode: 'late-result-discarded',
      auditEventId: 'sqlite-audit-discard-rollback',
      occurredAt: '2026-08-21T04:01:00Z',
    }

    await expect(repository.discardEvidenceProcessingAtomically(command))
      .rejects.toThrow('sqlite-rollback-discard')
    expect(queryRows(database, 'SELECT processing_state, worker_id FROM evidence'))
      .toEqual([{ processing_state: 'leased', worker_id: claim.workerId }])
    expect(queryRows(database, "SELECT id FROM audit_events WHERE kind = 'evidence-processing-completed'"))
      .toEqual([])
    expect(queryRows(database, "SELECT action_id FROM mutation_receipts WHERE mutation = 'discard-evidence'"))
      .toEqual([])

    await repository.discardEvidenceProcessingAtomically(command)
    expect(queryRows(database, 'SELECT processing_state, worker_id FROM evidence'))
      .toEqual([{ processing_state: 'failed', worker_id: null }])
    database.close()
  })

  it('rejects a leased worker completion after the evidence is deleted', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const evidence = cloneEvidence()
    await repository.ingestEvidenceAtomically(evidence)
    const claim = (await repository.claimNextEvidence(
      'worker-before-deletion',
      '2026-08-21T04:10:00Z',
      '2026-08-21T04:00:00Z',
    ))!

    await repository.deleteEvidenceAtomically(structuredClone(deleteEvidenceCommandFixture))
    await expect(repository.completeEvidenceProcessingAtomically({
      claim,
      expectedSettingsRevision: evidence.policySnapshot.settingsRevision,
      candidates: [{
        candidateId: 'candidate-after-deletion',
        proposal: cloneProposal(),
        auditEventId: 'audit-proposal-after-deletion',
      }],
      auditEventId: 'audit-completion-after-deletion',
      occurredAt: '2026-08-21T04:01:00Z',
    })).rejects.toMatchObject({ code: 'STALE_CLAIM' })
    expect(await repository.listCandidates()).toEqual([])
    expect(await repository.getEvidenceProvenance(evidence.id)).toEqual({
      state: 'deleted-tombstone',
      evidenceId: evidence.id,
      deletedAt: deleteEvidenceCommandFixture.occurredAt,
      reasonCode: 'user-requested',
    })

    database.close()
  })

  it('preserves a confirmed preference across a file close and reopen', async () => {
    const filename = temporaryDatabasePath()
    let database = openFileDatabase(filename)
    let repository = createRepository(database)
    await seedObservedCandidate(repository)
    const confirmed = await repository.confirmCandidateAtomically(
      structuredClone(confirmCandidateCommandFixture) as unknown as ConfirmCandidateCommand,
    )
    checkpointSqliteWal(database)
    database.close()

    database = openFileDatabase(filename)
    repository = createRepository(database)
    expect(await repository.getPreference(confirmed.id)).toEqual(confirmed)
    expect(await repository.listActivePreferences(identityContextFixture)).toEqual([confirmed])

    database.close()
  })

  it('enables foreign keys, WAL, and secure_delete for a file-backed database and exposes a checkpoint path', () => {
    const database = openFileDatabase()

    expect(database.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(database.pragma('secure_delete', { simple: true })).toBe(1)
    expect(() => checkpointSqliteWal(database)).not.toThrow()

    database.close()
  })

  it('does not mistake an ordinary file path containing mode=memory for an in-memory URI', () => {
    const filename = temporaryDatabasePath().replace('profile.sqlite', 'mode=memory.sqlite')
    const database = openFileDatabase(filename)

    expect(database.pragma('journal_mode', { simple: true })).toBe('wal')

    database.close()
  })

  it('deletes pending evidence-only candidates and leaves an ID-only tombstone', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    await seedObservedCandidate(repository, 'candidate-pending-evidence-only')

    const result = await repository.deleteEvidenceAtomically(
      structuredClone(deleteEvidenceCommandFixture),
    )
    expect(result).toMatchObject({
      disposition: 'deleted',
      tombstoneCreated: true,
      deletedPendingCandidateIds: ['candidate-pending-evidence-only'],
    })
    expect(await repository.getCandidate('candidate-pending-evidence-only')).toBeUndefined()
    const tombstone = await repository.getEvidenceProvenance(interactionEvidenceFixture.id)
    expect(tombstone).toEqual({
      state: 'deleted-tombstone',
      evidenceId: interactionEvidenceFixture.id,
      deletedAt: deleteEvidenceCommandFixture.occurredAt,
      reasonCode: 'user-requested',
    })
    expect(Object.keys(tombstone!)).toEqual([
      'state',
      'evidenceId',
      'deletedAt',
      'reasonCode',
    ])

    database.close()
  })

  it('removes deleted evidence content while retaining only tombstone IDs for confirmed authority', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    await seedObservedCandidate(repository)
    const confirmed = await repository.confirmCandidateAtomically(
      structuredClone(confirmCandidateCommandFixture) as unknown as ConfirmCandidateCommand,
    )

    await repository.deleteEvidenceAtomically(structuredClone(deleteEvidenceCommandFixture))

    expect(await repository.getCandidate('candidate-1')).toMatchObject({
      status: 'confirmed',
      evidenceIds: [interactionEvidenceFixture.id],
      counterEvidenceIds: [],
      provenance: {
        kind: 'observer-evidence',
        evidenceIds: [interactionEvidenceFixture.id],
      },
    })
    expect(await repository.getPreference(confirmed.id)).toEqual(confirmed)
    expect(await repository.getEvidenceProvenance(interactionEvidenceFixture.id)).toMatchObject({
      state: 'deleted-tombstone',
      evidenceId: interactionEvidenceFixture.id,
    })

    const serializedRows = JSON.stringify(Object.fromEntries(
      tableNames.map((table) => [table, queryRows(database, `SELECT * FROM ${table}`)]),
    ))
    expect(serializedRows).not.toContain(interactionEvidenceFixture.learningPayload.userText)
    expect(serializedRows).not.toContain(interactionEvidenceFixture.learningPayload.assistantText)
    expect(serializedRows).not.toContain('learningPayload')

    database.close()
  })

  it('does not reveal or audit an existing tombstone across identity boundaries', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    await repository.ingestEvidenceAtomically(cloneEvidence())
    await repository.deleteEvidenceAtomically(structuredClone(deleteEvidenceCommandFixture))
    const ownerAuditsBefore = await repository.listAuditEvents({
      identity: deleteEvidenceCommandFixture.identity,
    })

    await expect(repository.deleteEvidenceAtomically({
      ...structuredClone(deleteEvidenceCommandFixture),
      actionId: 'action-delete-tombstone-other-user',
      auditEventId: 'audit-delete-tombstone-other-user',
      identity: {
        ...deleteEvidenceCommandFixture.identity,
        userId: 'other-user',
      },
    })).rejects.toMatchObject({ code: 'EVIDENCE_NOT_FOUND' })

    expect(await repository.listAuditEvents({
      identity: deleteEvidenceCommandFixture.identity,
    })).toEqual(ownerAuditsBefore)
    expect(await repository.listAuditEvents({
      identity: {
        ...deleteEvidenceCommandFixture.identity,
        userId: 'other-user',
      },
    })).toEqual([])

    database.close()
  })

  it('optionally revokes dependent preferences without restoring deleted evidence content', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const evidence = cloneEvidence()
    await repository.ingestEvidenceAtomically(evidence)
    const preference = await repository.createExplicitPreferenceAtomically({
      ...structuredClone(createExplicitPreferenceCommandFixture),
      evidenceIds: [evidence.id],
    } as unknown as CreateExplicitPreferenceCommand)

    const result = await repository.deleteEvidenceAtomically({
      ...structuredClone(deleteEvidenceCommandFixture),
      revokeDependentPreferences: true,
    })
    expect(result.revokedPreferenceIds).toEqual([preference.id])
    expect(await repository.getPreference(preference.id)).toMatchObject({
      status: 'revoked',
      revision: preference.revision + 1,
      updatedAt: deleteEvidenceCommandFixture.occurredAt,
    })
    expect(JSON.stringify(queryRows(database, 'SELECT * FROM evidence')))
      .not.toContain(evidence.learningPayload.userText)

    database.close()
  })

  it('keeps default connection settings isolated by stable identity plus host', async () => {
    const database = openFileDatabase()
    const repository = createRepository(database)
    const command = {
      ...structuredClone(updateConnectionSettingsCommandFixture),
      expectedSettingsRevision: 0,
    } as unknown as UpdateConnectionSettingsCommand
    const updated = await repository.updateConnectionSettingsAtomically(command)

    expect(await repository.getConnectionSettings(command.identity, command.hostId)).toEqual(updated)
    expect(await repository.getConnectionSettings(command.identity, 'another-host')).toMatchObject({
      identity: preferenceIdentityFixture,
      hostId: 'another-host',
      revision: 0,
      observeEnabled: false,
      learnEnabled: false,
      applyEnabled: false,
    })

    database.close()
  })
})
