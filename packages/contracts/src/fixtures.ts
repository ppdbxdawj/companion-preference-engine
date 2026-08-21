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

export const responseDetailPreferenceFixture = {
  key: 'interaction.response_detail',
  value: 'concise',
} as const

export const preferenceIdentityFixture = {
  userId: identityContextFixture.userId,
  companionId: identityContextFixture.companionId,
  relationshipId: identityContextFixture.relationshipId,
} as const

export const workspacePreferenceScopeFixture = {
  kind: 'workspace',
  workspaceId: 'workspace-1',
} as const

export const candidateIdempotencyKeyFixture = {
  version: 1,
  algorithm: 'sha256',
  digest: '2f6f0f925115a65c3f928611245b781a58b40ea6254c3eac87317c5c5f799f99',
} as const

export const observerEvidenceProvenanceFixture = {
  kind: 'observer-evidence',
  evidenceIds: [interactionEvidenceFixture.id],
} as const

export const externalProposalProvenanceFixture = {
  kind: 'external-proposal',
  channel: 'runtime-client',
  proposerId: 'reference-agent',
  proposalRef: 'proposal-1',
} as const

export const preferenceCandidateFixture = {
  schemaVersion: 1,
  id: 'candidate-1',
  identity: preferenceIdentityFixture,
  preference: responseDetailPreferenceFixture,
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  provenance: observerEvidenceProvenanceFixture,
  evidenceIds: [interactionEvidenceFixture.id],
  counterEvidenceIds: [],
  confidence: 0.82,
  riskCategory: 'standard',
  status: 'pending_confirmation',
  idempotencyKey: candidateIdempotencyKeyFixture,
  revision: 0,
  createdAt: '2026-08-21T03:00:00Z',
  updatedAt: '2026-08-21T03:00:00Z',
} as const

export const pendingCandidateProposalFixture = {
  identity: preferenceIdentityFixture,
  preference: responseDetailPreferenceFixture,
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  provenance: observerEvidenceProvenanceFixture,
  evidenceIds: [interactionEvidenceFixture.id],
  counterEvidenceIds: [],
  confidence: 0.82,
  riskCategory: 'standard',
  status: 'pending_confirmation',
  idempotencyKey: candidateIdempotencyKeyFixture,
} as const

export const activePreferenceRecordFixture = {
  schemaVersion: 1,
  id: 'preference-1',
  identity: preferenceIdentityFixture,
  preference: responseDetailPreferenceFixture,
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  authority: 'user-confirmed',
  revision: 1,
  status: 'active',
  evidenceIds: [interactionEvidenceFixture.id],
  createdAt: '2026-08-21T03:05:00Z',
  updatedAt: '2026-08-21T03:05:00Z',
} as const

export const effectiveProfileQueryFixture = {
  userId: identityContextFixture.userId,
  companionId: identityContextFixture.companionId,
  relationshipId: identityContextFixture.relationshipId,
  hostId: identityContextFixture.hostId,
  domain: identityContextFixture.domain,
  workspaceId: workspacePreferenceScopeFixture.workspaceId,
  now: '2026-08-21T03:10:00Z',
} as const

export const behaviorGuidanceFixture = {
  responseDetail: 'concise',
  verificationDepth: 'targeted',
  avoid: ['generic_reassurance'],
} as const

export const proposeCandidateCommandFixture = {
  actionId: 'action-propose-1',
  candidateId: 'candidate-external-1',
  identity: preferenceIdentityFixture,
  preference: responseDetailPreferenceFixture,
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  provenance: externalProposalProvenanceFixture,
  evidenceIds: [],
  counterEvidenceIds: [],
  confidence: 0.7,
  riskCategory: 'standard',
  idempotencyKey: candidateIdempotencyKeyFixture,
  occurredAt: '2026-08-21T03:11:00Z',
} as const

export const confirmCandidateCommandFixture = {
  actionId: 'action-confirm-1',
  candidateId: preferenceCandidateFixture.id,
  expectedCandidateRevision: 0,
  preferenceId: activePreferenceRecordFixture.id,
  preference: responseDetailPreferenceFixture,
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  occurredAt: '2026-08-21T03:12:00Z',
} as const

export const rejectCandidateCommandFixture = {
  actionId: 'action-reject-1',
  candidateId: preferenceCandidateFixture.id,
  expectedCandidateRevision: 0,
  occurredAt: '2026-08-21T03:12:00Z',
  reasonCode: 'not-a-preference',
} as const

export const deleteCandidateCommandFixture = {
  actionId: 'action-delete-candidate-1',
  candidateId: preferenceCandidateFixture.id,
  expectedCandidateRevision: 0,
  occurredAt: '2026-08-21T03:12:00Z',
  reasonCode: 'user-requested',
} as const

export const suppressCandidateCommandFixture = {
  actionId: 'action-suppress-1',
  candidateId: preferenceCandidateFixture.id,
  expectedCandidateRevision: 0,
  suppressionId: 'suppression-1',
  occurredAt: '2026-08-21T03:12:00Z',
  reasonCode: 'do-not-suggest-again',
} as const

export const createExplicitPreferenceCommandFixture = {
  actionId: 'action-create-preference-1',
  preferenceId: 'preference-explicit-1',
  identity: preferenceIdentityFixture,
  preference: responseDetailPreferenceFixture,
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  expectedNoActivePreference: true,
  evidenceIds: [],
  occurredAt: '2026-08-21T03:13:00Z',
} as const

export const revisePreferenceCommandFixture = {
  actionId: 'action-revise-1',
  preferenceId: activePreferenceRecordFixture.id,
  expectedPreferenceRevision: 1,
  replacementPreferenceId: 'preference-2',
  preference: {
    key: 'interaction.response_detail',
    value: 'detailed',
  },
  scope: workspacePreferenceScopeFixture,
  projection: projectionPolicyFixture,
  evidenceIds: [],
  occurredAt: '2026-08-21T03:14:00Z',
} as const

export const revokePreferenceCommandFixture = {
  actionId: 'action-revoke-1',
  preferenceId: activePreferenceRecordFixture.id,
  expectedPreferenceRevision: 1,
  occurredAt: '2026-08-21T03:15:00Z',
  reasonCode: 'user-requested',
} as const

export const mutationReceiptFixture = {
  actionId: confirmCandidateCommandFixture.actionId,
  mutation: 'confirm-candidate',
  payloadHash:
    '3de78d40cd51a48507078ba481a41b3b6aabc5dfdc16e4f2f6359537374617da',
  result: {
    kind: 'preference',
    preferenceId: activePreferenceRecordFixture.id,
    revision: activePreferenceRecordFixture.revision,
  },
  recordedAt: '2026-08-21T03:12:01Z',
} as const
