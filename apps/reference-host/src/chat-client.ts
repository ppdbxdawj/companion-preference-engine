import type {
  EffectiveProfileHttpRequest,
  EffectiveProfileHttpResult,
  IngestEvidenceHttpRequest,
  IngestEvidenceHttpResult,
  InteractionEvidence,
  PreferenceIdentity,
} from '@companion-preference/contracts'
import { renderGuidance } from './render-guidance.js'

type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
    : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
      : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T

export type ReferenceRuntimePort = Readonly<{
  getEffectiveProfile(
    request: DeepReadonly<EffectiveProfileHttpRequest>,
  ): Promise<EffectiveProfileHttpResult>
  ingestEvidence(
    request: DeepReadonly<IngestEvidenceHttpRequest>,
  ): Promise<IngestEvidenceHttpResult>
}>

export type ReferenceChatMessage = Readonly<{
  role: 'user' | 'assistant'
  text: string
}>

export type ReferenceChatModelPort = Readonly<{
  complete(input: Readonly<{
    messages: readonly ReferenceChatMessage[]
    developerMessage?: string
  }>): Promise<Readonly<{ assistantText: string }>>
}>

export type ReferenceChatClientOptions = Readonly<{
  runtime: ReferenceRuntimePort
  model: ReferenceChatModelPort
  identity: Readonly<PreferenceIdentity>
  hostId: string
  sessionId: string
  domain: InteractionEvidence['identity']['domain']
  source: Readonly<InteractionEvidence['source']>
  policySnapshot: DeepReadonly<InteractionEvidence['policySnapshot']>
  now(): string
  nextId(): string
}>

export type ReferenceChatResult = Readonly<{
  assistantText: string
  warnings: readonly ('profile-unavailable' | 'evidence-not-ingested')[]
}>

/** T13 RED: low-tier implementation must satisfy chat-client.test.ts. */
export class ReferenceChatClient {
  constructor(private readonly options: ReferenceChatClientOptions) {}

  async complete(input: Readonly<{
    userText: string
    history: readonly ReferenceChatMessage[]
  }>): Promise<ReferenceChatResult> {
    const warnings: Array<'profile-unavailable' | 'evidence-not-ingested'> = []
    let developerMessage: string | undefined
    try {
      const profile = await this.options.runtime.getEffectiveProfile({
        query: {
          ...this.options.identity,
          hostId: this.options.hostId,
          domain: this.options.domain,
          now: this.options.now(),
        },
      })
      developerMessage = renderGuidance(profile.guidance)
    } catch {
      warnings.push('profile-unavailable')
    }

    const messages: ReferenceChatMessage[] = [
      ...input.history,
      { role: 'user', text: input.userText },
    ]
    const modelInput = developerMessage === undefined
      ? { messages }
      : { developerMessage, messages }
    const completion = await this.options.model.complete(modelInput)

    const evidenceId = this.options.nextId()
    const evidence: InteractionEvidence = {
      schemaVersion: 1,
      id: evidenceId,
      identity: {
        ...this.options.identity,
        hostId: this.options.hostId,
        sessionId: this.options.sessionId,
        domain: this.options.domain,
      },
      occurredAt: this.options.now(),
      sourceRef: `${this.options.hostId}:${this.options.sessionId}:${evidenceId}`,
      source: this.options.source,
      consent: { purpose: 'preference-learning', policyVersion: 'reference-host-v1' },
      learningPayload: {
        userText: input.userText,
        assistantText: completion.assistantText,
      },
      policySnapshot: {
        collection: {
          ...this.options.policySnapshot.collection,
          allowedSources: this.options.policySnapshot.collection.allowedSources.map((source) => ({ ...source })),
        },
        outboundInference: this.options.policySnapshot.outboundInference.mode === 'disabled'
          ? { mode: 'disabled' }
          : {
              mode: this.options.policySnapshot.outboundInference.mode,
              allowedSources: this.options.policySnapshot.outboundInference.allowedSources.map((source) => ({ ...source })),
            },
        projection: {
          allowedHosts: [...this.options.policySnapshot.projection.allowedHosts],
          allowedDomains: [...this.options.policySnapshot.projection.allowedDomains],
        },
        settingsRevision: this.options.policySnapshot.settingsRevision,
      },
    }
    try {
      await this.options.runtime.ingestEvidence({ evidence })
    } catch {
      warnings.push('evidence-not-ingested')
    }
    return { assistantText: completion.assistantText, warnings }
  }
}
