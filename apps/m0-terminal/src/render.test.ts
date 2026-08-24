import { describe, expect, it } from 'vitest'

import { renderExperienceSnapshot } from './render.js'
import type { ExperienceSnapshot } from './types.js'

const snapshot: ExperienceSnapshot = {
  domain: 'work',
  pending: [{
    schemaVersion: 1, id: 'm0-candidate-work-concise',
    identity: { userId: 'm0-user', companionId: 'm0-companion', relationshipId: 'm0-relationship' },
    preference: { key: 'interaction.response_detail', value: 'concise' },
    scope: { kind: 'domain', domain: 'work' },
    projection: { allowedHosts: ['m0-terminal'], allowedDomains: ['work'] },
    provenance: { kind: 'observer-evidence', evidenceIds: ['m0-evidence-work-1'] },
    sourceHostIds: ['m0-terminal'],
    evidenceIds: ['m0-evidence-work-1'], counterEvidenceIds: [], confidence: 0.92,
    riskCategory: 'standard', status: 'pending_confirmation',
    idempotencyKey: { version: 1, algorithm: 'sha256', digest: '1111111111111111111111111111111111111111111111111111111111111111' },
    revision: 0, createdAt: '2026-08-24T12:00:00.000Z', updatedAt: '2026-08-24T12:00:00.000Z',
  }],
  activePreferences: [],
  resolution: { guidance: {}, applied: [], excluded: [], conflicts: [] },
  explanations: [],
  guidance: {},
  preview: {
    mode: 'baseline', label: 'Deterministic preview',
    text: 'I can outline the work, explain key trade-offs, and suggest a next step.',
  },
}

describe('renderExperienceSnapshot', () => {
  it('renders only the frozen read model with the governance warning and required headings', () => {
    const text = renderExperienceSnapshot(snapshot)
    for (const heading of ['Current domain', 'Pending', 'Active Profile', 'Excluded', 'Guidance', 'Deterministic preview']) {
      expect(text).toContain(heading)
    }
    expect(text).toContain('m0-candidate-work-concise')
    expect(text).toContain('interaction.response_detail = concise')
    expect(text).toContain('Scope: domain/work')
    expect(text).toContain('Evidence IDs: m0-evidence-work-1')
    expect(text).toContain('Confidence (informational): 0.92')
    expect(text).toContain('Confirmation required')
  })
})
