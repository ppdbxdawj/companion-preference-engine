import {
  FakePreferenceObserver,
  type PreferenceObserver,
} from '@companion-preference/observer'
import {
  InMemoryPreferenceRepository,
  InvalidTransitionError,
  type PreferenceRepository,
} from '@companion-preference/preference-core'
import {
  explainResolution,
  resolveEffectiveProfile,
} from '@companion-preference/preference-core'
import type { PreferenceRecord } from '@companion-preference/contracts'

import { companionCounterexample, workScenario } from './scenario.js'
import { renderDeterministicPreview } from './preview.js'
import type { ExperienceSnapshot, TerminalDomain } from './types.js'
import type { TerminalScenario } from './types.js'

/**
 * Thin terminal orchestration façade. Implementations must use only the formal
 * observer, repository, lifecycle, resolver, and explanation exports.
 */
export class M0ExperienceSession {
  private repository: PreferenceRepository
  private observers: Record<TerminalDomain, PreferenceObserver>
  private domain: TerminalDomain = 'work'
  private processed = new Set<TerminalDomain>()
  private readonly records = new Map<string, PreferenceRecord>()
  private auditCounter = 0

  constructor(
    repository?: PreferenceRepository,
    observers?: Partial<Record<TerminalDomain, PreferenceObserver>>,
  ) {
    this.repository = repository ?? this.makeRepository()
    this.observers = {
      work: observers?.work ?? new FakePreferenceObserver([workScenario.proposal]),
      companion: observers?.companion ?? new FakePreferenceObserver([companionCounterexample.proposal]),
    }
  }

  private makeRepository(): PreferenceRepository {
    return new InMemoryPreferenceRepository({
      claimTokenFactory: () => 'm0-claim-token',
      auditEventIdFactory: () => {
        this.auditCounter += 1
        return `m0-audit-${this.auditCounter}`
      },
    })
  }

  private scenario(): TerminalScenario {
    return this.domain === 'work' ? workScenario : companionCounterexample
  }

  private now(scenario = this.scenario()): string {
    return scenario.evidence.occurredAt
  }

  private async snapshot(): Promise<ExperienceSnapshot> {
    const scenario = this.scenario()
    const candidates = await this.repository.listCandidates()
    const identity = scenario.evidence.identity
    const activePreferences = await this.repository.listActivePreferences(identity)
    const allRecords = [...this.records.values()]
    const query = {
      userId: identity.userId,
      companionId: identity.companionId,
      relationshipId: identity.relationshipId,
      hostId: identity.hostId,
      domain: this.domain,
      now: this.now(),
    }
    const resolution = resolveEffectiveProfile(allRecords, query)
    return {
      domain: this.domain,
      pending: candidates.filter((candidate) => candidate.status === 'pending_confirmation' && candidate.scope.kind === 'domain' && candidate.scope.domain === this.domain),
      activePreferences,
      resolution,
      explanations: explainResolution(resolution),
      guidance: resolution.guidance,
      preview: renderDeterministicPreview(resolution.guidance),
    }
  }

  async show(): Promise<ExperienceSnapshot> {
    return this.snapshot()
  }

  async next(): Promise<ExperienceSnapshot> {
    if (!this.processed.has(this.domain)) {
      const scenario = this.scenario()
      await this.repository.ingestEvidenceAtomically(scenario.evidence)
      const claim = await this.repository.claimNextEvidence(
        'm0-terminal-observer',
        '2026-08-24T12:10:00.000Z',
        scenario.evidence.occurredAt,
      )
      if (!claim) throw new Error('Synthetic evidence could not be claimed')
      const proposals = await this.observers[this.domain].propose({ evidenceWindow: [scenario.evidence] })
      const proposal = proposals[0]
      if (!proposal) throw new Error('Synthetic observer returned no proposal')
      await this.repository.completeEvidenceProcessingAtomically({
        claim,
        expectedSettingsRevision: scenario.evidence.policySnapshot.settingsRevision,
        candidates: [{
          candidateId: scenario.id === workScenario.id ? 'm0-candidate-work-concise' : 'm0-candidate-companion-listen-first',
          proposal,
          auditEventId: `m0-audit-candidate-${this.domain}`,
        }],
        auditEventId: `m0-audit-processing-${this.domain}`,
        occurredAt: scenario.evidence.occurredAt,
      })
      this.processed.add(this.domain)
    }
    return this.snapshot()
  }

  async confirm(candidateId: string): Promise<ExperienceSnapshot> {
    const candidate = await this.repository.getCandidate(candidateId)
    if (!candidate) throw new InvalidTransitionError('candidate-id-mismatch', `Candidate not found: ${candidateId}`)
    const preferenceId = candidateId === 'm0-candidate-work-concise'
      ? 'm0-preference-work-concise'
      : 'm0-preference-companion-listen-first'
    const record = await this.repository.confirmCandidateAtomically({
      actionId: `m0-action-confirm-${candidateId}`,
      candidateId,
      expectedCandidateRevision: candidate.revision,
      preferenceId,
      preference: candidate.preference,
      scope: candidate.scope,
      projection: candidate.projection,
      occurredAt: '2026-08-24T12:02:00.000Z',
    })
    this.records.set(record.id, record)
    return this.snapshot()
  }

  async reject(candidateId: string): Promise<ExperienceSnapshot> {
    const candidate = await this.repository.getCandidate(candidateId)
    if (!candidate) throw new InvalidTransitionError('candidate-id-mismatch', `Candidate not found: ${candidateId}`)
    await this.repository.rejectCandidateAtomically({
      actionId: `m0-action-reject-${candidateId}`,
      candidateId,
      expectedCandidateRevision: candidate.revision,
      occurredAt: '2026-08-24T12:02:00.000Z',
      reasonCode: 'user-requested',
    })
    return this.snapshot()
  }

  async revoke(preferenceId: string): Promise<ExperienceSnapshot> {
    const record = await this.repository.getPreference(preferenceId)
    if (!record) throw new Error(`Preference not found: ${preferenceId}`)
    const revoked = await this.repository.revokePreferenceAtomically({
      actionId: `m0-action-revoke-${preferenceId}`,
      preferenceId,
      expectedPreferenceRevision: record.revision,
      occurredAt: '2026-08-24T12:03:00.000Z',
      reasonCode: 'user-requested',
    })
    this.records.set(revoked.id, revoked)
    return this.snapshot()
  }

  async setDomain(domain: TerminalDomain): Promise<ExperienceSnapshot> {
    this.domain = domain
    return this.snapshot()
  }

  async reset(): Promise<ExperienceSnapshot> {
    this.repository = this.makeRepository()
    this.processed.clear()
    this.records.clear()
    this.domain = 'work'
    return this.snapshot()
  }
}
