import * as v from 'valibot'

export type Domain = 'work' | 'companion'

export type HostSourceKind =
  | 'chat-turn'
  | 'explicit-form'
  | 'reference-host-turn'

export type ContentCategory =
  | 'ordinary-conversation'
  | 'code'
  | 'terminal'
  | 'tool-trace'

export type TypedHostSource = {
  kind: HostSourceKind
  contentCategory: ContentCategory
}

export type IdentityContext = {
  userId: string
  companionId: string
  relationshipId: string
  hostId: string
  sessionId: string
  domain: Domain
}

export type CollectionPolicy = {
  allowedSources: TypedHostSource[]
  retainContent: boolean
}

export type OutboundInferenceMode =
  | 'disabled'
  | 'local-only'
  | 'allow-configured-remote'

export type OutboundInferencePolicy =
  | { mode: 'disabled' }
  | { mode: 'local-only'; allowedSources: TypedHostSource[] }
  | {
      mode: 'allow-configured-remote'
      allowedSources: TypedHostSource[]
    }

export type ProjectionPolicy = {
  allowedHosts: string[]
  allowedDomains: Domain[]
}

export const DomainSchema = v.picklist(['work', 'companion'])

export const HostSourceKindSchema = v.picklist([
  'chat-turn',
  'explicit-form',
  'reference-host-turn',
])

export const ContentCategorySchema = v.picklist([
  'ordinary-conversation',
  'code',
  'terminal',
  'tool-trace',
])

export const TypedHostSourceSchema = v.strictObject({
  kind: HostSourceKindSchema,
  contentCategory: ContentCategorySchema,
})

export const IdentityContextSchema = v.strictObject({
  userId: v.pipe(v.string(), v.nonEmpty()),
  companionId: v.pipe(v.string(), v.nonEmpty()),
  relationshipId: v.pipe(v.string(), v.nonEmpty()),
  hostId: v.pipe(v.string(), v.nonEmpty()),
  sessionId: v.pipe(v.string(), v.nonEmpty()),
  domain: DomainSchema,
})

export const CollectionPolicySchema = v.strictObject({
  allowedSources: v.array(TypedHostSourceSchema),
  retainContent: v.boolean(),
})

export const OutboundInferenceModeSchema = v.picklist([
  'disabled',
  'local-only',
  'allow-configured-remote',
])

export const OutboundInferencePolicySchema = v.variant('mode', [
  v.strictObject({ mode: v.literal('disabled') }),
  v.strictObject({
    mode: v.literal('local-only'),
    allowedSources: v.array(TypedHostSourceSchema),
  }),
  v.strictObject({
    mode: v.literal('allow-configured-remote'),
    allowedSources: v.array(TypedHostSourceSchema),
  }),
])

export const ProjectionPolicySchema = v.strictObject({
  allowedHosts: v.array(v.pipe(v.string(), v.nonEmpty())),
  allowedDomains: v.array(DomainSchema),
})
