import type { TerminalScenario } from './types.js'

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as object)) freeze(child)
    Object.freeze(value)
  }
  return value
}

const baseEvidence = (id: string, occurredAt: string, sourceRef: string, domain: 'work' | 'companion') => ({
  schemaVersion: 1 as const,
  id,
  identity: {
    userId: 'm0-user', companionId: 'm0-companion', relationshipId: 'm0-relationship',
    hostId: 'm0-terminal', sessionId: `m0-session-${domain}`, domain,
  },
  occurredAt,
  sourceRef,
  source: { kind: 'chat-turn' as const, contentCategory: 'ordinary-conversation' as const },
  consent: { purpose: 'preference-learning' as const, policyVersion: 'm0-policy-v1' },
  learningPayload: {
    userText: domain === 'work' ? 'Please keep the answer concise.' : 'Please listen first.',
  },
  policySnapshot: {
    collection: {
      allowedSources: [{ kind: 'chat-turn' as const, contentCategory: 'ordinary-conversation' as const }],
      retainContent: true,
    },
    outboundInference: { mode: 'disabled' as const },
    projection: { allowedHosts: ['m0-terminal'], allowedDomains: [domain] as ('work' | 'companion')[] },
    settingsRevision: 1,
  },
})

export const workScenario: TerminalScenario = freeze({
  id: 'm0-scenario-work-concise',
  evidence: baseEvidence('m0-evidence-work-1', '2026-08-24T12:00:00.000Z', 'm0-work-turn-1', 'work'),
  proposal: {
    identity: { userId: 'm0-user', companionId: 'm0-companion', relationshipId: 'm0-relationship' },
    preference: { key: 'interaction.response_detail' as const, value: 'concise' as const },
    scope: { kind: 'domain' as const, domain: 'work' as const },
    projection: { allowedHosts: ['m0-terminal'], allowedDomains: ['work'] as const },
    provenance: { kind: 'observer-evidence' as const, evidenceIds: ['m0-evidence-work-1'] },
    sourceHostIds: ['m0-terminal'],
    evidenceIds: ['m0-evidence-work-1'], counterEvidenceIds: [], confidence: 0.92,
    riskCategory: 'standard' as const, status: 'pending_confirmation' as const,
    idempotencyKey: { version: 1 as const, algorithm: 'sha256' as const, digest: 'm0-work-concise' },
  },
})

export const companionCounterexample: TerminalScenario = freeze({
  id: 'm0-scenario-companion-listen-first',
  evidence: baseEvidence('m0-evidence-companion-1', '2026-08-24T12:01:00.000Z', 'm0-companion-turn-1', 'companion'),
  proposal: {
    identity: { userId: 'm0-user', companionId: 'm0-companion', relationshipId: 'm0-relationship' },
    preference: { key: 'companion.support_style' as const, value: 'listen_first' as const },
    scope: { kind: 'domain' as const, domain: 'companion' as const },
    projection: { allowedHosts: ['m0-terminal'], allowedDomains: ['companion'] as const },
    provenance: { kind: 'observer-evidence' as const, evidenceIds: ['m0-evidence-companion-1'] },
    sourceHostIds: ['m0-terminal'],
    evidenceIds: ['m0-evidence-companion-1'], counterEvidenceIds: [], confidence: 0.88,
    riskCategory: 'standard' as const, status: 'pending_confirmation' as const,
    idempotencyKey: { version: 1 as const, algorithm: 'sha256' as const, digest: 'm0-companion-listen-first' },
  },
})
