import {
  confirmCandidateCommandFixture,
  effectiveProfileQueryFixture,
  interactionEvidenceFixture,
  preferenceIdentityFixture,
  proposeCandidateCommandFixture,
} from '../../../packages/contracts/src/fixtures.js'
import type {
  InteractionEvidence,
  UpdateConnectionSettingsCommand,
} from '../../../packages/contracts/src/schemas.js'
import {
  ActionPayloadConflictError,
  InMemoryPreferenceRepository,
} from '../../../packages/preference-core/src/index.js'
import { describe, expect, it } from 'vitest'

import { PreferenceApplication } from './application.js'

let sequence = 0

const createRepository = () => new InMemoryPreferenceRepository({
  claimTokenFactory: () => `claim-${++sequence}`,
  auditEventIdFactory: () => `audit-${++sequence}`,
})

const settingsCommand = (
  revision: number,
  patch: UpdateConnectionSettingsCommand['patch'],
  suffix: string,
): UpdateConnectionSettingsCommand => ({
  actionId: `settings-${suffix}`,
  identity: structuredClone(preferenceIdentityFixture),
  hostId: interactionEvidenceFixture.identity.hostId,
  expectedSettingsRevision: revision,
  patch,
  occurredAt: `2026-08-21T03:${suffix.padStart(2, '0')}:00.000Z`,
})

const evidence = (
  id: string,
  sourceRef: string,
  settingsRevision = 0,
): InteractionEvidence => ({
  ...structuredClone(interactionEvidenceFixture),
  id,
  sourceRef,
  policySnapshot: {
    ...structuredClone(interactionEvidenceFixture.policySnapshot),
    outboundInference: {
      mode: 'allow-configured-remote',
      allowedSources: [structuredClone(interactionEvidenceFixture.source)],
    },
    settingsRevision,
  },
}) as InteractionEvidence

describe('PreferenceApplication admission and guidance oracle', () => {
  it('keeps settings independent and replaces a permissive stale snapshot with canonical policy', async () => {
    const repository = createRepository()
    const application = new PreferenceApplication({
      repository,
      decisionIdFactory: () => `decision-${++sequence}`,
    })

    const enabled = await application.updateConnectionSettings(settingsCommand(0, {
      collectionPolicy: {
        allowedSources: [structuredClone(interactionEvidenceFixture.source)],
        retainContent: true,
      },
      outboundInferencePolicy: { mode: 'disabled' },
      projectionPolicy: {
        allowedHosts: [interactionEvidenceFixture.identity.hostId],
        allowedDomains: ['work'],
      },
      observeEnabled: true,
      learnEnabled: true,
      applyEnabled: false,
    }, '01'))

    const stale = evidence('evidence-stale', 'source-stale', 0)
    await expect(application.ingestEvidence(stale)).resolves.toEqual({
      disposition: 'inserted',
      settingsRevision: enabled.revision,
    })

    const persisted = await repository.getEvidenceProvenance(stale.id)
    expect(persisted?.state).toBe('live')
    if (persisted?.state !== 'live') throw new Error('expected live evidence')
    expect(persisted.evidence.policySnapshot).toMatchObject({
      outboundInference: { mode: 'disabled' },
      settingsRevision: enabled.revision,
    })

    const observeDisabled = await application.updateConnectionSettings(
      settingsCommand(enabled.revision, {
        observeEnabled: false,
      }, '02'),
    )
    expect(observeDisabled).toMatchObject({
      collectionPolicy: { retainContent: true },
      observeEnabled: false,
      learnEnabled: true,
      applyEnabled: false,
      revision: enabled.revision + 1,
    })
    const unobserved = evidence('evidence-unobserved', 'source-unobserved', 0)
    await expect(application.ingestEvidence(unobserved)).resolves.toEqual({
      disposition: 'discarded',
      reasonCode: 'observe-disabled',
      settingsRevision: observeDisabled.revision,
    })
    await expect(repository.getEvidenceProvenance(unobserved.id)).resolves.toBeUndefined()

    const collectionDisabled = await application.updateConnectionSettings(
      settingsCommand(observeDisabled.revision, {
        collectionPolicy: { allowedSources: [], retainContent: false },
        observeEnabled: true,
      }, '03'),
    )
    expect(collectionDisabled).toMatchObject({
      observeEnabled: true,
      learnEnabled: true,
      applyEnabled: false,
      outboundInferencePolicy: { mode: 'disabled' },
      revision: enabled.revision + 2,
    })

    const denied = evidence('evidence-denied', 'source-denied', 0)
    await expect(application.ingestEvidence(denied)).resolves.toEqual({
      disposition: 'discarded',
      reasonCode: 'collection-disabled',
      settingsRevision: collectionDisabled.revision,
    })
    await expect(repository.getEvidenceProvenance(denied.id)).resolves.toBeUndefined()
    await expect(application.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['policy-decision-recorded'],
    })).resolves.toEqual([
      expect.objectContaining({ actor: 'runtime', reasonCode: 'observe-disabled' }),
      expect.objectContaining({
        actor: 'runtime', reasonCode: 'collection-disabled',
        settingsRevision: collectionDisabled.revision,
      }),
    ])
  })

  it('deduplicates a repeated sourceRef without creating a second evidence record', async () => {
    const repository = createRepository()
    const application = new PreferenceApplication({
      repository,
      decisionIdFactory: () => `decision-${++sequence}`,
    })
    const settings = await application.updateConnectionSettings(settingsCommand(0, {
      collectionPolicy: {
        allowedSources: [structuredClone(interactionEvidenceFixture.source)],
        retainContent: true,
      },
      observeEnabled: true,
    }, '06'))

    const first = evidence('evidence-first', 'same-source', settings.revision)
    const duplicate = evidence('evidence-duplicate', 'same-source', settings.revision)
    await expect(application.ingestEvidence(first)).resolves.toMatchObject({ disposition: 'inserted' })
    await expect(application.ingestEvidence(duplicate)).resolves.toEqual({
      disposition: 'duplicate',
      settingsRevision: settings.revision,
    })
    await expect(repository.listEvidenceProvenance(first.identity)).resolves.toHaveLength(1)
  })

  it('never emits unconfirmed guidance and independently fences application', async () => {
    const repository = createRepository()
    const application = new PreferenceApplication({
      repository,
      decisionIdFactory: () => `decision-${++sequence}`,
    })
    const settings = await application.updateConnectionSettings(settingsCommand(0, {
      projectionPolicy: structuredClone(proposeCandidateCommandFixture.projection),
      applyEnabled: false,
    }, '07'))

    await application.proposeCandidate(structuredClone(proposeCandidateCommandFixture))
    await expect(application.getEffectiveProfile(effectiveProfileQueryFixture)).resolves.toMatchObject({
      guidance: {},
      settingsRevision: settings.revision,
    })

    const confirmed = await application.confirmCandidate({
      ...structuredClone(confirmCandidateCommandFixture),
      candidateId: proposeCandidateCommandFixture.candidateId,
    })
    expect(confirmed.authority).toBe('user-confirmed')
    await expect(application.getEffectiveProfile(effectiveProfileQueryFixture)).resolves.toMatchObject({
      guidance: {},
      settingsRevision: settings.revision,
    })

    const applying = await application.updateConnectionSettings(settingsCommand(settings.revision, {
      applyEnabled: true,
    }, '08'))
    await expect(application.getEffectiveProfile(effectiveProfileQueryFixture)).resolves.toMatchObject({
      guidance: { responseDetail: 'concise' },
      settingsRevision: applying.revision,
    })

    const projectionDisabled = await application.updateConnectionSettings(
      settingsCommand(applying.revision, {
        projectionPolicy: { allowedHosts: [], allowedDomains: [] },
      }, '09'),
    )
    await expect(application.getEffectiveProfile(effectiveProfileQueryFixture)).resolves.toMatchObject({
      guidance: {},
      settingsRevision: projectionDisabled.revision,
    })
  })

  it('replays the same action result and rejects the same actionId with a changed payload', async () => {
    const repository = createRepository()
    const application = new PreferenceApplication({
      repository,
      decisionIdFactory: () => `decision-${++sequence}`,
    })
    await application.proposeCandidate(structuredClone(proposeCandidateCommandFixture))

    const command = {
      ...structuredClone(confirmCandidateCommandFixture),
      candidateId: proposeCandidateCommandFixture.candidateId,
    }
    const first = await application.confirmCandidate(command)
    await expect(application.confirmCandidate(structuredClone(command))).resolves.toEqual(first)

    await expect(application.confirmCandidate({
      ...structuredClone(command),
      preferenceId: 'changed-preference-id',
    })).rejects.toMatchObject({
      name: ActionPayloadConflictError.name,
      code: 'action-payload-conflict',
      actionId: command.actionId,
    })

    const audits = await application.listAuditEvents({
      identity: preferenceIdentityFixture,
      kinds: ['candidate-confirmed'],
    })
    expect(audits).toHaveLength(1)
  })
})
