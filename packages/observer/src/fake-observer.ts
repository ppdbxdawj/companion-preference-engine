import type {
  ObserverInput,
  ObserverProposal,
  PreferenceObserver,
} from './observer.js'

/**
 * Deterministic test double. It must return defensive copies of only the
 * proposals supplied at construction, respect AbortSignal, and perform no I/O.
 */
export class FakePreferenceObserver implements PreferenceObserver {
  private readonly proposals: readonly ObserverProposal[]

  constructor(proposals: readonly ObserverProposal[]) {
    // Clone at construction as well as at the call boundary.  Otherwise a
    // caller retaining its input array could mutate this test double's future
    // responses without going through the Observer port.
    this.proposals = structuredClone([...proposals])
  }

  async propose(
    _input: ObserverInput,
    signal?: AbortSignal,
  ): Promise<ObserverProposal[]> {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError')
    }

    return structuredClone([...this.proposals])
  }
}
