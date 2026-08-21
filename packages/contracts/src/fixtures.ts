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

export const revokedPreferenceRecordFixture = {
  ...activePreferenceRecordFixture,
  revision: 2,
  status: 'revoked',
  updatedAt: '2026-08-21T03:15:00Z',
} as const

export const replacementPreferenceRecordFixture = {
  ...activePreferenceRecordFixture,
  id: 'preference-2',
  preference: {
    key: 'interaction.response_detail',
    value: 'detailed',
  },
  revision: 1,
  supersedes: activePreferenceRecordFixture.id,
  createdAt: '2026-08-21T03:14:00Z',
  updatedAt: '2026-08-21T03:14:00Z',
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

export const deleteEvidenceCommandFixture = {
  actionId: 'action-delete-evidence-1',
  evidenceId: interactionEvidenceFixture.id,
  identity: preferenceIdentityFixture,
  occurredAt: '2026-08-21T03:15:30Z',
  auditEventId: 'audit-delete-evidence-1',
  revokeDependentPreferences: false,
} as const

export const deleteEvidenceResultFixture = {
  kind: 'evidence-deletion',
  evidenceId: interactionEvidenceFixture.id,
  disposition: 'deleted',
  tombstoneCreated: true,
  deletedPendingCandidateIds: ['candidate-pending-evidence-only-1'],
  revokedPreferenceIds: [],
} as const

export const deleteEvidenceNoCascadeResultFixture = {
  kind: 'evidence-deletion',
  evidenceId: 'evidence-with-no-dependent-records',
  disposition: 'deleted',
  tombstoneCreated: true,
  deletedPendingCandidateIds: [],
  revokedPreferenceIds: [],
} as const

export const deleteEvidenceMutationReceiptFixture = {
  actionId: deleteEvidenceCommandFixture.actionId,
  mutation: 'delete-evidence',
  payloadHash:
    '53bd6221e92cc941a792a37102dbdd2e5ad571615d0e47e74b8e73c6daaaa681',
  result: deleteEvidenceResultFixture,
  recordedAt: '2026-08-21T03:15:31Z',
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

export const adapterProjectionStatusFixture = {
  schemaVersion: 1,
  identity: preferenceIdentityFixture,
  hostId: identityContextFixture.hostId,
  domain: identityContextFixture.domain,
  settingsRevision: 3,
  connectionState: 'connected',
  state: 'verified-applied',
  lastGuidanceHash:
    '94c924e9eb3ef6f90ad9a39bf1a97d36b15e43cd9169370d4834562587dccd76',
  lastAttemptAt: '2026-08-21T03:20:00Z',
  detailCode: 'guidance-snapshot-verified',
  reportedAt: '2026-08-21T03:20:01Z',
} as const

export const connectionSettingsFixture = {
  schemaVersion: 1,
  identity: preferenceIdentityFixture,
  hostId: identityContextFixture.hostId,
  collectionPolicy: collectionPolicyFixture,
  outboundInferencePolicy: disabledOutboundInferencePolicyFixture,
  projectionPolicy: projectionPolicyFixture,
  observeEnabled: false,
  learnEnabled: true,
  applyEnabled: false,
  revision: 4,
  projectionStatus: adapterProjectionStatusFixture,
  updatedAt: '2026-08-21T03:21:00Z',
} as const

export const updateConnectionSettingsCommandFixture = {
  actionId: 'action-update-connection-1',
  identity: preferenceIdentityFixture,
  hostId: identityContextFixture.hostId,
  expectedSettingsRevision: connectionSettingsFixture.revision,
  patch: {
    applyEnabled: true,
  },
  occurredAt: '2026-08-21T03:22:00Z',
} as const

export const reportProjectionStatusCommandFixture = {
  actionId: 'action-report-projection-1',
  identity: preferenceIdentityFixture,
  hostId: identityContextFixture.hostId,
  domain: identityContextFixture.domain,
  expectedSettingsRevision: connectionSettingsFixture.revision,
  connectionState: 'connected',
  state: 'locally-written',
  lastGuidanceHash:
    '94c924e9eb3ef6f90ad9a39bf1a97d36b15e43cd9169370d4834562587dccd76',
  lastAttemptAt: '2026-08-21T03:22:30Z',
  detailCode: 'guidance-local-write-completed',
  occurredAt: '2026-08-21T03:22:31Z',
} as const

export const contentFreePolicyDecisionFixture = {
  schemaVersion: 1,
  decisionId: 'policy-decision-1',
  identity: preferenceIdentityFixture,
  hostId: identityContextFixture.hostId,
  domain: identityContextFixture.domain,
  settingsRevision: connectionSettingsFixture.revision,
  stage: 'collection',
  outcome: 'denied',
  reasonCode: 'observe-disabled',
  occurredAt: '2026-08-21T03:23:00Z',
} as const

export const mcpPrincipalFixture = {
  schemaVersion: 1,
  principalId: 'mcp-codex-local',
  identity: preferenceIdentityFixture,
  hostId: 'codex',
  capability: {
    allowedDomains: ['work'],
    allowedOperations: [
      'read-effective-profile',
      'explain-preference',
      'list-pending-candidates',
      'propose-pending-candidate',
    ],
  },
} as const

export const auditEventFixture = {
  schemaVersion: 1,
  id: 'audit-1',
  identity: preferenceIdentityFixture,
  actor: 'mcp-agent',
  kind: 'candidate-proposed',
  reasonCode: 'accepted',
  entity: { kind: 'candidate', candidateId: 'candidate-external-1' },
  occurredAt: '2026-08-21T03:24:00Z',
  actionId: 'action-propose-1',
  revision: 0,
} as const

export const observerCandidateProposedAuditEventFixture = {
  schemaVersion: 1,
  id: 'audit-observer-proposal-1',
  identity: preferenceIdentityFixture,
  actor: 'observer',
  kind: 'candidate-proposed',
  reasonCode: 'accepted',
  entity: { kind: 'candidate', candidateId: 'candidate-1' },
  occurredAt: '2026-08-21T03:24:01Z',
  revision: 0,
} as const

// One event per affected record; shared actionId binds the supersession pair.
// Each event carries the resulting revision of its referenced record.
export const preferenceSupersessionAuditEventsFixture = [
  {
    schemaVersion: 1,
    id: 'audit-supersede-old-1',
    identity: preferenceIdentityFixture,
    actor: 'user',
    kind: 'preference-revised',
    reasonCode: 'superseded',
    entity: {
      kind: 'preference',
      preferenceId: activePreferenceRecordFixture.id,
    },
    occurredAt: '2026-08-21T03:14:00Z',
    actionId: revisePreferenceCommandFixture.actionId,
    revision: 2,
  },
  {
    schemaVersion: 1,
    id: 'audit-supersede-new-1',
    identity: preferenceIdentityFixture,
    actor: 'user',
    kind: 'preference-revised',
    reasonCode: 'superseded',
    entity: {
      kind: 'preference',
      preferenceId: replacementPreferenceRecordFixture.id,
    },
    occurredAt: '2026-08-21T03:14:00Z',
    actionId: revisePreferenceCommandFixture.actionId,
    revision: replacementPreferenceRecordFixture.revision,
  },
] as const

export const preferenceRevokedAuditEventFixture = {
  schemaVersion: 1,
  id: 'audit-revoke-1',
  identity: preferenceIdentityFixture,
  actor: 'user',
  kind: 'preference-revoked',
  reasonCode: 'user-requested',
  entity: {
    kind: 'preference',
    preferenceId: revokedPreferenceRecordFixture.id,
  },
  occurredAt: revokePreferenceCommandFixture.occurredAt,
  actionId: revokePreferenceCommandFixture.actionId,
  revision: revokedPreferenceRecordFixture.revision,
} as const

export const auditQueryFixture = {
  identity: preferenceIdentityFixture,
  actors: ['mcp-agent'],
  kinds: ['candidate-proposed'],
  entity: { kind: 'candidate', candidateId: 'candidate-external-1' },
  occurredAtOrAfter: '2026-08-21T00:00:00Z',
  occurredBefore: '2026-08-22T00:00:00Z',
  limit: 50,
} as const

export const httpPrincipalFixture = {
  schemaVersion: 1,
  principalId: 'runtime-client-reference-host',
  identity: preferenceIdentityFixture,
  hostId: identityContextFixture.hostId,
} as const

export const ingestEvidenceHttpRequestFixture = {
  evidence: interactionEvidenceFixture,
  expectedSettingsRevision:
    interactionEvidenceFixture.policySnapshot.settingsRevision,
} as const

export const effectiveProfileHttpRequestFixture = {
  query: effectiveProfileQueryFixture,
} as const

export const governanceMutationHttpRequestFixture = {
  command: confirmCandidateCommandFixture,
} as const

export const deleteEvidenceHttpRequestFixture = {
  command: deleteEvidenceCommandFixture,
} as const

export const mutationSuccessHttpResponseFixture = {
  ok: true,
  requestId: 'request-1',
  data: mutationReceiptFixture,
} as const

export const revisionErrorHttpResponseFixture = {
  ok: false,
  requestId: 'request-2',
  error: {
    code: 'revision-conflict',
    message: 'The expected revision is stale.',
    retryable: false,
    currentRevision: 2,
  },
} as const
