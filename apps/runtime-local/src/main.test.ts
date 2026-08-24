import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  interactionEvidenceFixture,
  pendingCandidateProposalFixture,
  preferenceIdentityFixture,
} from '../../../packages/contracts/src/fixtures.js'
import type {
  InteractionEvidence,
  PendingCandidateProposal,
} from '../../../packages/contracts/src/schemas.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRuntimeLocal } from './main.js'

const temporaryDirectories: string[] = []
let sequence = 0

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const temporaryDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'companion-runtime-composition-'))
  temporaryDirectories.push(directory)
  return join(directory, 'profile.sqlite')
}

describe('createRuntimeLocal', () => {
  it('constructs, starts, processes through Fake Observer, and closes cleanly', async () => {
    const databasePath = temporaryDatabasePath()
    const evidenceId = 'evidence-main-composition'
    const proposal: PendingCandidateProposal = {
      ...structuredClone(pendingCandidateProposalFixture),
      provenance: { kind: 'observer-evidence', evidenceIds: [evidenceId] },
      evidenceIds: [evidenceId],
      idempotencyKey: {
        version: 1,
        algorithm: 'sha256',
        digest: 'e'.repeat(64),
      },
    }
    const runtime = createRuntimeLocal({
      databasePath,
      observerProposals: [proposal],
      pollIntervalMs: 5,
      now: () => new Date().toISOString(),
      idFactory: kind => `${kind}-${++sequence}`,
    })

    expect(runtime.state).toBe('new')
    await runtime.start()
    expect(runtime.state).toBe('running')

    const settings = await runtime.execute(application => application.updateConnectionSettings({
      actionId: 'settings-main-composition',
      identity: structuredClone(preferenceIdentityFixture),
      hostId: interactionEvidenceFixture.identity.hostId,
      expectedSettingsRevision: 0,
      patch: {
        collectionPolicy: {
          allowedSources: [structuredClone(interactionEvidenceFixture.source)],
          retainContent: true,
        },
        outboundInferencePolicy: {
          mode: 'local-only',
          allowedSources: [structuredClone(interactionEvidenceFixture.source)],
        },
        projectionPolicy: structuredClone(interactionEvidenceFixture.policySnapshot.projection),
        observeEnabled: true,
        learnEnabled: true,
        applyEnabled: true,
      },
      occurredAt: '2026-08-24T01:00:00.000Z',
    }))
    const evidence: InteractionEvidence = {
      ...structuredClone(interactionEvidenceFixture),
      id: evidenceId,
      sourceRef: 'source-main-composition',
      policySnapshot: {
        collection: structuredClone(settings.collectionPolicy),
        outboundInference: structuredClone(settings.outboundInferencePolicy),
        projection: structuredClone(settings.projectionPolicy),
        settingsRevision: settings.revision,
      },
    }

    await expect(runtime.execute(application => application.ingestEvidence(evidence))).resolves.toMatchObject({
      disposition: 'inserted',
    })
    await vi.waitFor(async () => {
      const candidates = await runtime.execute(application => application.listPendingCandidates())
      expect(candidates).toHaveLength(1)
      expect(candidates[0]?.evidenceIds).toEqual([evidenceId])
    })

    await runtime.close()
    expect(runtime.state).toBe('closed')
    await expect(runtime.execute(application => application.listPendingCandidates())).rejects.toMatchObject({
      code: 'RUNTIME_CLOSED',
    })
  })
})
