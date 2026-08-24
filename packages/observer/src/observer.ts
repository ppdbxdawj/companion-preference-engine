import type {
  InteractionEvidence,
  PendingCandidateProposal,
} from '@companion-preference/contracts'

/**
 * The complete consented evidence window approved for one observation call.
 * Implementations must not recover or fetch content outside this value.
 */
export type ObserverInput = Readonly<{
  evidenceWindow: readonly InteractionEvidence[]
}>

/** An Observer may propose only; confirmation remains a user-governed action. */
export type ObserverProposal = PendingCandidateProposal

export interface PreferenceObserver {
  propose(
    input: ObserverInput,
    signal?: AbortSignal,
  ): Promise<ObserverProposal[]>
}
