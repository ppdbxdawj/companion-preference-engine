import { describe, expect, it } from 'vitest'

import { companionCounterexample, workScenario } from './scenario.js'

describe('frozen synthetic M0.5 scenarios', () => {
  it('exports an immutable work-only concise proposal with stable synthetic IDs', () => {
    expect(workScenario).toMatchObject({
      id: 'm0-scenario-work-concise',
      evidence: {
        id: 'm0-evidence-work-1',
        occurredAt: '2026-08-24T12:00:00.000Z',
        identity: { hostId: 'm0-terminal', domain: 'work' },
        sourceRef: 'm0-work-turn-1',
      },
      proposal: {
        preference: { key: 'interaction.response_detail', value: 'concise' },
        scope: { kind: 'domain', domain: 'work' },
        projection: { allowedHosts: ['m0-terminal'], allowedDomains: ['work'] },
        evidenceIds: ['m0-evidence-work-1'],
        counterEvidenceIds: [],
        confidence: 0.92,
        status: 'pending_confirmation',
      },
    })
    expect(Object.isFrozen(workScenario)).toBe(true)
    expect(Object.isFrozen(workScenario.evidence)).toBe(true)
    expect(Object.isFrozen(workScenario.proposal)).toBe(true)
  })

  it('exports an immutable companion-only counterexample that cannot project to work', () => {
    expect(companionCounterexample).toMatchObject({
      id: 'm0-scenario-companion-listen-first',
      evidence: {
        id: 'm0-evidence-companion-1',
        occurredAt: '2026-08-24T12:01:00.000Z',
        identity: { hostId: 'm0-terminal', domain: 'companion' },
      },
      proposal: {
        preference: { key: 'companion.support_style', value: 'listen_first' },
        scope: { kind: 'domain', domain: 'companion' },
        projection: { allowedHosts: ['m0-terminal'], allowedDomains: ['companion'] },
        evidenceIds: ['m0-evidence-companion-1'],
        counterEvidenceIds: [],
        confidence: 0.88,
        status: 'pending_confirmation',
      },
    })
    expect(Object.isFrozen(companionCounterexample)).toBe(true)
    expect(Object.isFrozen(companionCounterexample.evidence)).toBe(true)
    expect(Object.isFrozen(companionCounterexample.proposal)).toBe(true)
  })
})
