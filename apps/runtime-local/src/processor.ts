import type {
  ConnectionSettings,
  ContentFreePolicyDecision,
  InteractionEvidence,
  PendingCandidateProposal,
  PreferenceIdentity,
} from '@companion-preference/contracts'
import type { PreferenceObserver } from '@companion-preference/observer'
import type {
  CandidateSuppression,
  EvidenceClaim,
  EvidenceDiscardReasonCode,
  PreferenceRepository,
} from '@companion-preference/preference-core'

import { processingAdmission } from './settings.js'

export type ProcessorIdKind = 'candidate' | 'audit' | 'decision'

export type EvidenceProcessorOptions = Readonly<{
  repository: PreferenceRepository
  observer: PreferenceObserver
  workerId: string
  leaseDurationMs: number
  leaseRenewalIntervalMs?: number
  pollIntervalMs?: number
  maxConsecutiveFailures?: number
  now: () => string
  idFactory: (kind: ProcessorIdKind) => string
}>

export type DrainResult = Readonly<{
  claimed: number
  proposed: number
  discarded: number
}>

const profileIdentity = (evidence: InteractionEvidence): PreferenceIdentity => ({
  userId: evidence.identity.userId,
  companionId: evidence.identity.companionId,
  relationshipId: evidence.identity.relationshipId,
})

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`
}

const isSuppressed = (
  proposal: PendingCandidateProposal,
  suppressions: readonly CandidateSuppression[],
): boolean => suppressions.some((suppression) => (
  suppression.preferenceKey === proposal.preference.key
  && canonical(suppression.scope) === canonical(proposal.scope)
  && canonical(suppression.projection) === canonical(proposal.projection)
))

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

const waitUntilWoken = (delayMs: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, delayMs)
    signal.addEventListener('abort', finish, { once: true })

    function finish() {
      clearTimeout(timeout)
      signal.removeEventListener('abort', finish)
      resolve()
    }
  })
}

/**
 * A bounded, serial evidence processor. `drain` remains available for embedded
 * callers and deterministic tests; `start`/`stop` own the optional background
 * polling loop used by the local runtime lifecycle.
 */
export class EvidenceProcessor {
  private readonly repository: PreferenceRepository
  private readonly observer: PreferenceObserver
  private readonly workerId: string
  private readonly leaseDurationMs: number
  private readonly leaseRenewalIntervalMs: number
  private readonly pollIntervalMs: number
  private readonly maxConsecutiveFailures: number
  private readonly now: () => string
  private readonly idFactory: (kind: ProcessorIdKind) => string
  private readonly inFlight = new Map<string, {
    controller: AbortController
    reason: string | undefined
  }>()
  private running = false
  private loopWake = new AbortController()
  private loopPromise: Promise<void> | undefined
  private drainPromise: Promise<DrainResult> | undefined

  constructor(options: EvidenceProcessorOptions) {
    this.repository = options.repository
    this.observer = options.observer
    this.workerId = options.workerId
    this.leaseDurationMs = options.leaseDurationMs
    this.leaseRenewalIntervalMs = options.leaseRenewalIntervalMs
      ?? Math.max(1, Math.floor(options.leaseDurationMs / 3))
    this.pollIntervalMs = options.pollIntervalMs ?? 100
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? 3
    this.now = options.now
    this.idFactory = options.idFactory

    if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs <= 0) {
      throw new TypeError('leaseDurationMs must be a positive finite number')
    }
    if (!Number.isFinite(this.leaseRenewalIntervalMs) || this.leaseRenewalIntervalMs <= 0) {
      throw new TypeError('leaseRenewalIntervalMs must be a positive finite number')
    }
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new TypeError('pollIntervalMs must be a positive finite number')
    }
    if (!Number.isInteger(this.maxConsecutiveFailures) || this.maxConsecutiveFailures < 0) {
      throw new TypeError('maxConsecutiveFailures must be a non-negative integer')
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.loopWake = new AbortController()
    this.loopPromise = this.runLoop()
  }

  async stop(): Promise<void> {
    this.running = false
    this.loopWake.abort()
    await this.loopPromise
    await this.drainPromise
    this.loopPromise = undefined
  }

  cancelEvidence(evidenceId: string, reason = 'late-result-discarded'): boolean {
    const active = this.inFlight.get(evidenceId)
    if (!active) return false
    active.reason = reason
    active.controller.abort()
    return true
  }

  cancelAll(reason = 'late-result-discarded'): number {
    let count = 0
    for (const evidenceId of this.inFlight.keys()) {
      if (this.cancelEvidence(evidenceId, reason)) count += 1
    }
    return count
  }

  async drain(): Promise<DrainResult> {
    if (this.drainPromise) return this.drainPromise
    const draining = this.drainAvailableEvidence()
    this.drainPromise = draining
    try {
      return await draining
    } finally {
      if (this.drainPromise === draining) this.drainPromise = undefined
    }
  }

  private async drainAvailableEvidence(): Promise<DrainResult> {
    const totals = { claimed: 0, proposed: 0, discarded: 0 }
    while (true) {
      const occurredAt = this.now()
      const leaseUntil = new Date(Date.parse(occurredAt) + this.leaseDurationMs).toISOString()
      const claim = await this.repository.claimNextEvidence(this.workerId, leaseUntil, occurredAt)
      if (!claim) return totals
      totals.claimed += 1
      const result = await this.processClaim(claim)
      totals.proposed += result.proposed
      totals.discarded += result.discarded
    }
  }

  private async runLoop(): Promise<void> {
    let consecutiveFailures = 0
    while (this.running) {
      try {
        const result = await this.drain()
        consecutiveFailures = 0
        if (result.claimed === 0 && this.running) {
          await waitUntilWoken(this.pollIntervalMs, this.loopWake.signal)
        }
      } catch {
        consecutiveFailures += 1
        if (consecutiveFailures > this.maxConsecutiveFailures) {
          this.running = false
          return
        }
        if (this.running) await waitUntilWoken(this.pollIntervalMs, this.loopWake.signal)
      }
    }
  }

  private async processClaim(claim: EvidenceClaim): Promise<Pick<DrainResult, 'proposed' | 'discarded'>> {
    const evidence = claim.evidence
    const identity = profileIdentity(evidence)
    const initialSettings = await this.repository.getConnectionSettings(identity, evidence.identity.hostId)
    if (initialSettings.revision !== claim.settingsRevision) {
      await this.discardClaim(claim, initialSettings, 'stale-settings-revision')
      return { proposed: 0, discarded: 1 }
    }

    const admission = processingAdmission(initialSettings, evidence)
    if (!admission.allowed) {
      await this.recordDecision(
        evidence,
        initialSettings,
        admission.reasonCode === 'learning-disabled' ? 'learning' : 'outbound-inference',
        admission.reasonCode ?? 'learning-disabled',
      )
      await this.complete(claim, [], claim.settingsRevision)
      return { proposed: 0, discarded: 1 }
    }

    const controller = new AbortController()
    const active = { controller, reason: undefined as string | undefined }
    this.inFlight.set(evidence.id, active)
    const stopLeaseRenewal = this.startLeaseRenewal(claim, active)
    let proposals: PendingCandidateProposal[]
    try {
      proposals = await this.observer.propose({ evidenceWindow: [evidence] }, controller.signal)
    } catch (error) {
      const canceled = controller.signal.aborted || errorCode(error) === 'ABORT_ERR'
        || (error instanceof DOMException && error.name === 'AbortError')
      if (canceled) {
        const current = await this.repository.getConnectionSettings(identity, evidence.identity.hostId)
        await this.discardClaim(claim, current, 'late-result-discarded')
        return { proposed: 0, discarded: 1 }
      }
      try {
        await this.repository.releaseEvidenceClaim(claim)
      } catch {
        // A deleted or superseded lease is already fenced from future writes.
      }
      throw error
    } finally {
      await stopLeaseRenewal()
      this.inFlight.delete(evidence.id)
    }

    const provenance = await this.repository.getEvidenceProvenance(evidence.id)
    if (controller.signal.aborted || provenance?.state !== 'live') {
      const current = await this.repository.getConnectionSettings(identity, evidence.identity.hostId)
      await this.discardClaim(claim, current, 'late-result-discarded')
      return { proposed: 0, discarded: 1 }
    }

    const currentSettings = await this.repository.getConnectionSettings(identity, evidence.identity.hostId)
    if (currentSettings.revision !== claim.settingsRevision) {
      await this.discardClaim(claim, currentSettings, 'stale-settings-revision')
      return { proposed: 0, discarded: 1 }
    }
    const completionAdmission = processingAdmission(currentSettings, evidence)
    if (!completionAdmission.allowed) {
      await this.recordDecision(
        evidence,
        currentSettings,
        completionAdmission.reasonCode === 'learning-disabled' ? 'learning' : 'outbound-inference',
        completionAdmission.reasonCode ?? 'learning-disabled',
      )
      return { proposed: 0, discarded: 1 }
    }

    const suppressions = await this.repository.listCandidateSuppressions(evidence.identity)
    const admitted = proposals.filter((proposal) => !isSuppressed(proposal, suppressions))
    try {
      await this.complete(claim, admitted, claim.settingsRevision)
      return { proposed: admitted.length, discarded: proposals.length - admitted.length }
    } catch (error) {
      if (errorCode(error) === 'revision-conflict' || errorCode(error) === 'STALE_CLAIM'
        || (error instanceof Error && error.message === 'STALE_SETTINGS_REVISION')) {
        const latest = await this.repository.getConnectionSettings(identity, evidence.identity.hostId)
        const latestProvenance = await this.repository.getEvidenceProvenance(evidence.id)
        await this.discardClaim(
          claim,
          latest,
          latestProvenance?.state === 'live' ? 'stale-settings-revision' : 'late-result-discarded',
        )
        return { proposed: 0, discarded: 1 }
      }
      throw error
    }
  }

  private startLeaseRenewal(
    claim: EvidenceClaim,
    active: { controller: AbortController, reason: string | undefined },
  ): () => Promise<void> {
    const stop = new AbortController()
    const renewal = (async () => {
      while (!stop.signal.aborted && !active.controller.signal.aborted) {
        await waitUntilWoken(this.leaseRenewalIntervalMs, stop.signal)
        if (stop.signal.aborted || active.controller.signal.aborted) return
        const occurredAt = this.now()
        const leaseUntil = new Date(Date.parse(occurredAt) + this.leaseDurationMs).toISOString()
        try {
          await this.repository.renewEvidenceClaim(claim, leaseUntil, occurredAt)
        } catch {
          active.reason = 'lease-renewal-failed'
          active.controller.abort()
          return
        }
      }
    })()
    return async () => {
      stop.abort()
      await renewal
    }
  }

  private complete(
    claim: EvidenceClaim,
    proposals: readonly PendingCandidateProposal[],
    expectedSettingsRevision: number,
  ): Promise<void> {
    const occurredAt = this.now()
    return this.repository.completeEvidenceProcessingAtomically({
      claim: {
        evidenceId: claim.evidenceId,
        workerId: claim.workerId,
        claimToken: claim.claimToken,
        leaseVersion: claim.leaseVersion,
      },
      expectedSettingsRevision,
      candidates: proposals.map((proposal) => ({
        candidateId: this.idFactory('candidate'),
        proposal,
        auditEventId: this.idFactory('audit'),
      })),
      auditEventId: this.idFactory('audit'),
      occurredAt,
    })
  }

  private async discardClaim(
    claim: EvidenceClaim,
    settings: ConnectionSettings,
    reasonCode: EvidenceDiscardReasonCode,
  ): Promise<void> {
    let currentSettings = settings
    let terminalized = false
    for (let attempt = 0; attempt < 2 && !terminalized; attempt += 1) {
      try {
        await this.repository.discardEvidenceProcessingAtomically({
          claim: {
            evidenceId: claim.evidenceId,
            workerId: claim.workerId,
            claimToken: claim.claimToken,
            leaseVersion: claim.leaseVersion,
          },
          expectedSettingsRevision: currentSettings.revision,
          reasonCode,
          auditEventId: this.idFactory('audit'),
          occurredAt: this.now(),
        })
        terminalized = true
      } catch (error) {
        if (errorCode(error) === 'STALE_CLAIM') break
        if (errorCode(error) !== 'revision-conflict') throw error
        currentSettings = await this.repository.getConnectionSettings(
          profileIdentity(claim.evidence),
          claim.evidence.identity.hostId,
        )
      }
    }

    // Preserve the existing policy-decision stream for host-facing explanation.
    // The terminal discard above is separately atomic and content-free.
    await this.recordDecision(claim.evidence, currentSettings, 'learning', reasonCode)
  }

  private recordDecision(
    evidence: InteractionEvidence,
    settings: ConnectionSettings,
    stage: ContentFreePolicyDecision['stage'],
    reasonCode: ContentFreePolicyDecision['reasonCode'],
  ): Promise<void> {
    return this.repository.recordPolicyDecisionAtomically({
      schemaVersion: 1,
      decisionId: this.idFactory('decision'),
      identity: profileIdentity(evidence),
      hostId: evidence.identity.hostId,
      domain: evidence.identity.domain,
      settingsRevision: settings.revision,
      stage,
      outcome: 'discarded',
      reasonCode,
      occurredAt: this.now(),
    })
  }
}
