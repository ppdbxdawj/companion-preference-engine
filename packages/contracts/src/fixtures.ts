export const identityContextFixture = {
  userId: 'user-local',
  companionId: 'companion-airi',
  relationshipId: 'relationship-1',
  hostId: 'reference-host',
  sessionId: 'session-1',
  domain: 'work',
} as const

export const chatTurnSourceFixture = {
  kind: 'chat-turn',
  contentCategory: 'ordinary-conversation',
} as const

export const collectionPolicyFixture = {
  allowedSources: [chatTurnSourceFixture],
  retainContent: false,
} as const

export const disabledOutboundInferencePolicyFixture = {
  mode: 'disabled',
} as const

export const localOnlyOutboundInferencePolicyFixture = {
  mode: 'local-only',
  allowedSources: [chatTurnSourceFixture],
} as const

export const remoteOutboundInferencePolicyFixture = {
  mode: 'allow-configured-remote',
  allowedSources: [chatTurnSourceFixture],
} as const

export const projectionPolicyFixture = {
  allowedHosts: ['reference-host', 'airi'],
  allowedDomains: ['work'],
} as const
