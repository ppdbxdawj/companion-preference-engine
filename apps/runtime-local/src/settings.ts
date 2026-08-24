import type {
  CollectionPolicy,
  ConnectionSettings,
  ContentFreePolicyReasonCode,
  EvidencePolicySnapshot,
  InteractionEvidence,
  OutboundInferencePolicy,
  ProjectionPolicy,
  TypedHostSource,
} from '@companion-preference/contracts'

/** The policy decision returned by a local admission check. */
export type SettingsAdmission = Readonly<{
  allowed: boolean
  admitted: boolean
  reasonCode?: ContentFreePolicyReasonCode
  settingsRevision: number
}>

const copySource = (source: TypedHostSource): TypedHostSource => ({ ...source })

const copyCollectionPolicy = (policy: CollectionPolicy): CollectionPolicy => ({
  allowedSources: policy.allowedSources.map(copySource),
  retainContent: policy.retainContent,
})

const copyOutboundPolicy = (policy: OutboundInferencePolicy): OutboundInferencePolicy => {
  if (policy.mode === 'disabled') return { mode: 'disabled' }
  return {
    mode: policy.mode,
    allowedSources: policy.allowedSources.map(copySource),
  }
}

const copyProjectionPolicy = (policy: ProjectionPolicy): ProjectionPolicy => ({
  allowedHosts: [...policy.allowedHosts],
  allowedDomains: [...policy.allowedDomains],
})

/** Typed source matching deliberately ignores content and compares no free-form text. */
export const sourceMatches = (
  source: TypedHostSource,
  allowed: TypedHostSource,
): boolean => source.kind === allowed.kind && source.contentCategory === allowed.contentCategory

export const matchesTypedSource = sourceMatches
export const matchesSource = sourceMatches

export const sourceAllowed = (
  source: TypedHostSource,
  allowedSources: readonly TypedHostSource[],
): boolean => allowedSources.some((allowed) => sourceMatches(source, allowed))

export const isSourceAllowed = sourceAllowed

/**
 * Build the only policy snapshot that may be attached to persisted evidence.
 * Event-provided policy is intentionally not consulted: it is an audit input,
 * never an authority.
 */
export const canonicalEvidencePolicySnapshot = (
  settings: ConnectionSettings,
): EvidencePolicySnapshot => ({
  collection: copyCollectionPolicy(settings.collectionPolicy),
  outboundInference: copyOutboundPolicy(settings.outboundInferencePolicy),
  projection: copyProjectionPolicy(settings.projectionPolicy),
  settingsRevision: settings.revision,
})

export const replacePolicySnapshot = (
  evidence: InteractionEvidence,
  settings: ConnectionSettings,
): InteractionEvidence => ({
  ...evidence,
  policySnapshot: canonicalEvidencePolicySnapshot(settings),
})

export const replaceEvidencePolicySnapshot = replacePolicySnapshot

const admission = (
  settings: ConnectionSettings,
  allowed: boolean,
  reasonCode?: ContentFreePolicyReasonCode,
): SettingsAdmission => reasonCode === undefined
  ? { allowed, admitted: allowed, settingsRevision: settings.revision }
  : { allowed: false, admitted: false, reasonCode, settingsRevision: settings.revision }

/** Check whether evidence may be retained before it is handed to a processor. */
export const collectionAdmission = (
  settings: ConnectionSettings,
  input: TypedHostSource | Pick<InteractionEvidence, 'source'>,
): SettingsAdmission => {
  const source = 'source' in input ? input.source : input
  if (!settings.observeEnabled) return admission(settings, false, 'observe-disabled')
  if (!settings.collectionPolicy.retainContent || !sourceAllowed(source, settings.collectionPolicy.allowedSources)) {
    return admission(settings, false, 'collection-disabled')
  }
  return admission(settings, true)
}

export const admitEvidenceCollection = collectionAdmission
export const admitCollection = collectionAdmission

/**
 * Check whether a claimed evidence item may be sent to the injected observer.
 * This gate is independent from projection and never enables outbound inference.
 */
export const processingAdmission = (
  settings: ConnectionSettings,
  evidence: Pick<InteractionEvidence, 'source'>,
): SettingsAdmission => {
  if (!settings.observeEnabled) return admission(settings, false, 'observe-disabled')
  if (!settings.learnEnabled) return admission(settings, false, 'learning-disabled')
  if (!settings.collectionPolicy.retainContent || !sourceAllowed(evidence.source, settings.collectionPolicy.allowedSources)) {
    return admission(settings, false, 'collection-disabled')
  }
  if (settings.outboundInferencePolicy.mode === 'disabled') {
    return admission(settings, false, 'outbound-inference-disabled')
  }
  if (!sourceAllowed(evidence.source, settings.outboundInferencePolicy.allowedSources)) {
    return admission(settings, false, 'outbound-source-not-allowed')
  }
  return admission(settings, true)
}

export const admitEvidenceProcessing = processingAdmission
export const admitProcessing = processingAdmission

/** A revision is stale only when the canonical revision has moved forward. */
export const hasAdvancedSettingsRevision = (
  capturedRevision: number,
  canonicalRevision: number,
): boolean => canonicalRevision > capturedRevision

export const hasSettingsRevisionAdvanced = hasAdvancedSettingsRevision
export const isStaleSettingsRevision = (
  capturedRevision: number,
  canonicalRevision: number,
): boolean => canonicalRevision > capturedRevision

const sourceSet = (sources: readonly TypedHostSource[]): Set<string> => new Set(
  sources.map((source) => `${source.kind}\u0000${source.contentCategory}`),
)

const isSubset = (before: readonly TypedHostSource[], after: readonly TypedHostSource[]): boolean => {
  const next = sourceSet(after)
  return before.every((source) => next.has(`${source.kind}\u0000${source.contentCategory}`))
}

const isStrictSubset = (before: readonly TypedHostSource[], after: readonly TypedHostSource[]): boolean => (
  isSubset(before, after) && sourceSet(before).size < sourceSet(after).size
)

const isStringSubset = (before: readonly string[], after: readonly string[]): boolean => {
  const next = new Set(after)
  return before.every((value) => next.has(value))
}

const isStrictStringSubset = (before: readonly string[], after: readonly string[]): boolean => (
  isStringSubset(before, after) && new Set(before).size < new Set(after).size
)

const outboundRank = (policy: OutboundInferencePolicy): number => {
  if (policy.mode === 'disabled') return 0
  if (policy.mode === 'local-only') return 1
  return 2
}

/**
 * Detect whether a newer canonical settings revision removes permission. This
 * is intentionally conservative: a revision may still require refreshing even
 * when it is not stricter, but only a stricter one cancels in-flight work.
 */
export const isStricterSettingsRevision = (
  previous: ConnectionSettings,
  current: ConnectionSettings,
): boolean => {
  if (current.revision <= previous.revision) return false
  return (
    (!current.observeEnabled && previous.observeEnabled)
    || (!current.learnEnabled && previous.learnEnabled)
    || (!current.applyEnabled && previous.applyEnabled)
    || (!current.collectionPolicy.retainContent && previous.collectionPolicy.retainContent)
    || isStrictSubset(current.collectionPolicy.allowedSources, previous.collectionPolicy.allowedSources)
    || outboundRank(current.outboundInferencePolicy) < outboundRank(previous.outboundInferencePolicy)
    || (
      outboundRank(current.outboundInferencePolicy) === outboundRank(previous.outboundInferencePolicy)
      && current.outboundInferencePolicy.mode !== 'disabled'
      && previous.outboundInferencePolicy.mode !== 'disabled'
      && isStrictSubset(current.outboundInferencePolicy.allowedSources, previous.outboundInferencePolicy.allowedSources)
    )
    || isStrictStringSubset(current.projectionPolicy.allowedHosts, previous.projectionPolicy.allowedHosts)
    || isStrictStringSubset(current.projectionPolicy.allowedDomains, previous.projectionPolicy.allowedDomains)
  )
}

export const isSettingsRevisionStricter = isStricterSettingsRevision

/** Default closed settings used before a connection has been configured. */
export const defaultConnectionSettings = (
  identity: ConnectionSettings['identity'],
  hostId: string,
): ConnectionSettings => ({
  schemaVersion: 1,
  identity: { ...identity },
  hostId,
  collectionPolicy: { allowedSources: [], retainContent: false },
  outboundInferencePolicy: { mode: 'disabled' },
  projectionPolicy: { allowedHosts: [], allowedDomains: [] },
  observeEnabled: false,
  learnEnabled: false,
  applyEnabled: false,
  revision: 0,
  updatedAt: '1970-01-01T00:00:00.000Z',
})
