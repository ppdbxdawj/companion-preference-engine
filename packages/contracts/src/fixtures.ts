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

export const evidenceConsentFixture = {
  purpose: 'preference-learning',
  policyVersion: 'policy-v1',
} as const

export const evidenceLearningPayloadFixture = {
  userText: 'Please keep the answer concise.',
  assistantText: 'Understood.',
} as const

export const evidencePolicySnapshotFixture = {
  collection: {
    allowedSources: [chatTurnSourceFixture],
    retainContent: true,
  },
  outboundInference: disabledOutboundInferencePolicyFixture,
  projection: projectionPolicyFixture,
  settingsRevision: 1,
} as const

export const interactionEvidenceFixture = {
  schemaVersion: 1,
  id: 'evidence-1',
  identity: identityContextFixture,
  occurredAt: '2026-08-20T01:02:03.456Z',
  sourceRef: 'turn-1',
  source: chatTurnSourceFixture,
  consent: evidenceConsentFixture,
  learningPayload: evidenceLearningPayloadFixture,
  policySnapshot: evidencePolicySnapshotFixture,
} as const

export const evidenceDeduplicationIdentityFixture = {
  userId: identityContextFixture.userId,
  companionId: identityContextFixture.companionId,
  relationshipId: identityContextFixture.relationshipId,
  hostId: identityContextFixture.hostId,
  sourceRef: interactionEvidenceFixture.sourceRef,
} as const

export const liveEvidenceProvenanceFixture = {
  state: 'live',
  evidence: interactionEvidenceFixture,
} as const

export const deletedEvidenceTombstoneFixture = {
  state: 'deleted-tombstone',
  evidenceId: interactionEvidenceFixture.id,
  deletedAt: '2026-08-21T02:03:04Z',
  reasonCode: 'user-requested',
} as const
