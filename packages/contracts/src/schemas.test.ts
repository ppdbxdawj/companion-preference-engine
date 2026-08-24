import * as v from 'valibot'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CollectionPolicySchema,
  ContentCategorySchema,
  DeletedEvidenceTombstoneSchema,
  DomainSchema,
  EvidenceConsentSchema,
  EvidenceDeduplicationIdentitySchema,
  EvidenceLearningPayloadSchema,
  EvidencePolicySnapshotSchema,
  EvidenceProvenanceSchema,
  HostSourceKindSchema,
  IdentityContextSchema,
  InteractionEvidenceSchema,
  LiveEvidenceProvenanceSchema,
  OutboundInferenceModeSchema,
  OutboundInferencePolicySchema,
  ProjectionPolicySchema,
  TypedHostSourceSchema,
  type CollectionPolicy,
  type ContentCategory,
  type DeletedEvidenceTombstone,
  type Domain,
  type EvidenceConsent,
  type EvidenceDeduplicationIdentity,
  type EvidenceLearningPayload,
  type EvidencePolicySnapshot,
  type EvidenceProvenance,
  type HostSourceKind,
  type IdentityContext,
  type InteractionEvidence,
  type LiveEvidenceProvenance,
  type OutboundInferenceMode,
  type OutboundInferencePolicy,
  type ProjectionPolicy,
  type TypedHostSource,
} from './schemas.js'
import {
  chatTurnSourceFixture,
  collectionPolicyFixture,
  deletedEvidenceTombstoneFixture,
  disabledOutboundInferencePolicyFixture,
  evidenceConsentFixture,
  evidenceDeduplicationIdentityFixture,
  evidenceLearningPayloadFixture,
  evidencePolicySnapshotFixture,
  identityContextFixture,
  interactionEvidenceFixture,
  liveEvidenceProvenanceFixture,
  localOnlyOutboundInferencePolicyFixture,
  projectionPolicyFixture,
  remoteOutboundInferencePolicyFixture,
} from './fixtures.js'
import {
  AdapterConnectionStateSchema,
  AdapterProjectionStatusSchema,
  BehaviorGuidanceSchema,
  CandidateIdempotencyKeySchema,
  CandidateProvenanceSchema,
  CandidateStatusSchema,
  ConnectionSettingsSchema,
  ContentFreePolicyDecisionSchema,
  ContentFreePolicyOutcomeSchema,
  ContentFreePolicyReasonCodeSchema,
  ContentFreePolicyStageSchema,
  AuditActorSchema,
  AuditEntityReferenceSchema,
  AuditEventKindSchema,
  AuditEventSchema,
  AuditQuerySchema,
  AuditReasonCodeSchema,
  ConfirmCandidateCommandSchema,
  CreateExplicitPreferenceCommandSchema,
  DeleteCandidateCommandSchema,
  DeleteEvidenceCommandSchema,
  DeleteEvidenceResultSchema,
  EffectiveProfileQuerySchema,
  ExternalProposalProvenanceSchema,
  GovernanceMutationKindSchema,
  MutationReceiptResultSchema,
  MutationReceiptSchema,
  McpCapabilitySchema,
  McpOperationSchema,
  McpPrincipalSchema,
  ObserverEvidenceProvenanceSchema,
  PendingCandidateProposalSchema,
  PreferenceAuthoritySchema,
  PreferenceCandidateSchema,
  PreferenceIdentitySchema,
  PreferenceRecordSchema,
  PreferenceRiskCategorySchema,
  PreferenceSchema,
  PreferenceScopeSchema,
  PreferenceStatusSchema,
  ProjectionDeliveryStateSchema,
  ProjectionDetailCodeSchema,
  ProposeCandidateCommandSchema,
  ReportProjectionStatusCommandSchema,
  RejectCandidateCommandSchema,
  RevisePreferenceCommandSchema,
  RevokePreferenceCommandSchema,
  SupersededPreferenceExpectationSchema,
  SuppressCandidateCommandSchema,
  UpdateConnectionSettingsCommandSchema,
  type AdapterConnectionState,
  type AuditActor,
  type AuditEntityReference,
  type AuditEvent,
  type AuditEventKind,
  type AuditQuery,
  type AuditReasonCode,
  type AdapterProjectionStatus,
  type BehaviorGuidance,
  type CandidateIdempotencyKey,
  type CandidateProvenance,
  type CandidateStatus,
  type ConnectionSettings,
  type ContentFreePolicyDecision,
  type ContentFreePolicyOutcome,
  type ContentFreePolicyReasonCode,
  type ContentFreePolicyStage,
  type ConfirmCandidateCommand,
  type CreateExplicitPreferenceCommand,
  type DeleteCandidateCommand,
  type DeleteEvidenceCommand,
  type DeleteEvidenceResult,
  type EffectiveProfileQuery,
  type ExternalProposalProvenance,
  type GovernanceMutationKind,
  type MutationReceipt,
  type MutationReceiptResult,
  type McpCapability,
  type McpOperation,
  type McpPrincipal,
  type ObserverEvidenceProvenance,
  type PendingCandidateProposal,
  type Preference,
  type PreferenceAuthority,
  type PreferenceCandidate,
  type PreferenceIdentity,
  type PreferenceRecord,
  type PreferenceRiskCategory,
  type PreferenceScope,
  type PreferenceStatus,
  type ProjectionDeliveryState,
  type ProjectionDetailCode,
  type ProposeCandidateCommand,
  type ReportProjectionStatusCommand,
  type RejectCandidateCommand,
  type RevisePreferenceCommand,
  type RevokePreferenceCommand,
  type SupersededPreferenceExpectation,
  type SuppressCandidateCommand,
  type UpdateConnectionSettingsCommand,
} from './schemas.js'
import {
  activePreferenceRecordFixture,
  auditEventFixture,
  auditQueryFixture,
  adapterProjectionStatusFixture,
  behaviorGuidanceFixture,
  candidateIdempotencyKeyFixture,
  deleteEvidenceCommandFixture,
  deleteEvidenceHttpRequestFixture,
  deleteEvidenceMutationReceiptFixture,
  deleteEvidenceNoCascadeResultFixture,
  deleteEvidenceResultFixture,
  confirmCandidateCommandFixture,
  connectionSettingsFixture,
  contentFreePolicyDecisionFixture,
  createExplicitPreferenceCommandFixture,
  deleteCandidateCommandFixture,
  effectiveProfileQueryFixture,
  externalProposalProvenanceFixture,
  mutationReceiptFixture,
  mcpPrincipalFixture,
  observerCandidateProposedAuditEventFixture,
  observerEvidenceProvenanceFixture,
  pendingCandidateProposalFixture,
  preferenceCandidateFixture,
  preferenceIdentityFixture,
  preferenceRevokedAuditEventFixture,
  preferenceSupersessionAuditEventsFixture,
  proposeCandidateCommandFixture,
  rejectCandidateCommandFixture,
  reportProjectionStatusCommandFixture,
  replacementPreferenceRecordFixture,
  responseDetailPreferenceFixture,
  revisePreferenceCommandFixture,
  revokePreferenceCommandFixture,
  revokedPreferenceRecordFixture,
  suppressCandidateCommandFixture,
  updateConnectionSettingsCommandFixture,
  workspacePreferenceScopeFixture,
} from './fixtures.js'

function omitKey(input: object, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([candidate]) => candidate !== key),
  )
}

describe('public contract types', () => {
  it('freezes the closed primitives and exact object shapes', () => {
    expectTypeOf<Domain>().toEqualTypeOf<'work' | 'companion'>()
    expectTypeOf<HostSourceKind>().toEqualTypeOf<
      'chat-turn' | 'explicit-form' | 'reference-host-turn'
    >()
    expectTypeOf<ContentCategory>().toEqualTypeOf<
      'ordinary-conversation' | 'code' | 'terminal' | 'tool-trace'
    >()
    expectTypeOf<TypedHostSource>().toEqualTypeOf<{
      kind: HostSourceKind
      contentCategory: ContentCategory
    }>()
    expectTypeOf<IdentityContext>().toEqualTypeOf<{
      userId: string
      companionId: string
      relationshipId: string
      hostId: string
      sessionId: string
      domain: Domain
    }>()
    expectTypeOf<CollectionPolicy>().toEqualTypeOf<{
      allowedSources: TypedHostSource[]
      retainContent: boolean
    }>()
    expectTypeOf<OutboundInferenceMode>().toEqualTypeOf<
      'disabled' | 'local-only' | 'allow-configured-remote'
    >()
    expectTypeOf<OutboundInferencePolicy>().toEqualTypeOf<
      | { mode: 'disabled' }
      | { mode: 'local-only'; allowedSources: TypedHostSource[] }
      | {
          mode: 'allow-configured-remote'
          allowedSources: TypedHostSource[]
        }
    >()
    expectTypeOf<ProjectionPolicy>().toEqualTypeOf<{
      allowedHosts: string[]
      allowedDomains: Domain[]
    }>()
  })

  it('keeps every runtime schema output equal to its exported type', () => {
    expectTypeOf<v.InferOutput<typeof DomainSchema>>().toEqualTypeOf<Domain>()
    expectTypeOf<
      v.InferOutput<typeof HostSourceKindSchema>
    >().toEqualTypeOf<HostSourceKind>()
    expectTypeOf<
      v.InferOutput<typeof ContentCategorySchema>
    >().toEqualTypeOf<ContentCategory>()
    expectTypeOf<
      v.InferOutput<typeof TypedHostSourceSchema>
    >().toEqualTypeOf<TypedHostSource>()
    expectTypeOf<
      v.InferOutput<typeof IdentityContextSchema>
    >().toEqualTypeOf<IdentityContext>()
    expectTypeOf<
      v.InferOutput<typeof CollectionPolicySchema>
    >().toEqualTypeOf<CollectionPolicy>()
    expectTypeOf<
      v.InferOutput<typeof OutboundInferenceModeSchema>
    >().toEqualTypeOf<OutboundInferenceMode>()
    expectTypeOf<
      v.InferOutput<typeof OutboundInferencePolicySchema>
    >().toEqualTypeOf<OutboundInferencePolicy>()
    expectTypeOf<
      v.InferOutput<typeof ProjectionPolicySchema>
    >().toEqualTypeOf<ProjectionPolicy>()
  })
})

describe('T2B public evidence contract types', () => {
  it('freezes InteractionEvidence and each named nested object shape', () => {
    expectTypeOf<EvidenceConsent>().toEqualTypeOf<{
      purpose: 'preference-learning'
      policyVersion: string
    }>()
    expectTypeOf<EvidenceLearningPayload>().toEqualTypeOf<{
      userText: string
      assistantText?: string
    }>()
    expectTypeOf<EvidencePolicySnapshot>().toEqualTypeOf<{
      collection: CollectionPolicy
      outboundInference: OutboundInferencePolicy
      projection: ProjectionPolicy
      settingsRevision: number
    }>()
    expectTypeOf<InteractionEvidence>().toEqualTypeOf<{
      schemaVersion: 1
      id: string
      identity: IdentityContext
      occurredAt: string
      sourceRef: string
      source: TypedHostSource
      consent: EvidenceConsent
      learningPayload: EvidenceLearningPayload
      policySnapshot: EvidencePolicySnapshot
    }>()
  })

  it('freezes the host-namespaced dedup identity and provenance union', () => {
    expectTypeOf<EvidenceDeduplicationIdentity>().toEqualTypeOf<{
      userId: string
      companionId: string
      relationshipId: string
      hostId: string
      sourceRef: string
    }>()
    expectTypeOf<LiveEvidenceProvenance>().toEqualTypeOf<{
      state: 'live'
      evidence: InteractionEvidence
    }>()
    expectTypeOf<DeletedEvidenceTombstone>().toEqualTypeOf<{
      state: 'deleted-tombstone'
      evidenceId: string
      deletedAt: string
      reasonCode: string
    }>()
    expectTypeOf<EvidenceProvenance>().toEqualTypeOf<
      LiveEvidenceProvenance | DeletedEvidenceTombstone
    >()
  })

  it('keeps every T2B runtime schema output equal to its exported type', () => {
    expectTypeOf<
      v.InferOutput<typeof EvidenceConsentSchema>
    >().toEqualTypeOf<EvidenceConsent>()
    expectTypeOf<
      v.InferOutput<typeof EvidenceLearningPayloadSchema>
    >().toEqualTypeOf<EvidenceLearningPayload>()
    expectTypeOf<
      v.InferOutput<typeof EvidencePolicySnapshotSchema>
    >().toEqualTypeOf<EvidencePolicySnapshot>()
    expectTypeOf<
      v.InferOutput<typeof InteractionEvidenceSchema>
    >().toEqualTypeOf<InteractionEvidence>()
    expectTypeOf<
      v.InferOutput<typeof EvidenceDeduplicationIdentitySchema>
    >().toEqualTypeOf<EvidenceDeduplicationIdentity>()
    expectTypeOf<
      v.InferOutput<typeof LiveEvidenceProvenanceSchema>
    >().toEqualTypeOf<LiveEvidenceProvenance>()
    expectTypeOf<
      v.InferOutput<typeof DeletedEvidenceTombstoneSchema>
    >().toEqualTypeOf<DeletedEvidenceTombstone>()
    expectTypeOf<
      v.InferOutput<typeof EvidenceProvenanceSchema>
    >().toEqualTypeOf<EvidenceProvenance>()
  })
})

describe('IdentityContextSchema', () => {
  it('accepts the complete host-neutral identity without changing it', () => {
    expect(v.parse(IdentityContextSchema, identityContextFixture)).toEqual(
      identityContextFixture,
    )
  })

  it.each([
    'userId',
    'companionId',
    'relationshipId',
    'hostId',
    'sessionId',
    'domain',
  ] as const)('requires %s and supplies no default', (field) => {
    expect(
      v.safeParse(IdentityContextSchema, omitKey(identityContextFixture, field))
        .success,
    ).toBe(false)
  })

  it.each([
    'userId',
    'companionId',
    'relationshipId',
    'hostId',
    'sessionId',
  ] as const)('rejects an empty stable identifier in %s', (field) => {
    expect(
      v.safeParse(IdentityContextSchema, {
        ...identityContextFixture,
        [field]: '',
      }).success,
    ).toBe(false)
  })

  it('rejects unknown domains and unknown object keys', () => {
    expect(
      v.safeParse(IdentityContextSchema, {
        ...identityContextFixture,
        domain: 'personal',
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(IdentityContextSchema, {
        ...identityContextFixture,
        characterCardId: 'host-native-id',
      }).success,
    ).toBe(false)
  })
})

describe('typed host source schemas', () => {
  it('accepts only the frozen source-kind and content-category allowlists', () => {
    for (const kind of [
      'chat-turn',
      'explicit-form',
      'reference-host-turn',
    ] as const) {
      expect(v.safeParse(HostSourceKindSchema, kind).success).toBe(true)
    }
    for (const contentCategory of [
      'ordinary-conversation',
      'code',
      'terminal',
      'tool-trace',
    ] as const) {
      expect(v.safeParse(ContentCategorySchema, contentCategory).success).toBe(
        true,
      )
    }
    expect(v.safeParse(HostSourceKindSchema, 'system-prompt').success).toBe(
      false,
    )
    expect(v.safeParse(ContentCategorySchema, 'composed-message').success).toBe(
      false,
    )
  })

  it('rejects missing and unknown fields on a typed source', () => {
    expect(
      v.safeParse(TypedHostSourceSchema, omitKey(chatTurnSourceFixture, 'kind'))
        .success,
    ).toBe(false)
    expect(
      v.safeParse(
        TypedHostSourceSchema,
        omitKey(chatTurnSourceFixture, 'contentCategory'),
      ).success,
    ).toBe(false)
    expect(
      v.safeParse(TypedHostSourceSchema, {
        ...chatTurnSourceFixture,
        metadata: { arbitrary: true },
      }).success,
    ).toBe(false)
  })
})

describe('CollectionPolicySchema', () => {
  it('requires an explicit typed-source list and retention decision', () => {
    expect(v.parse(CollectionPolicySchema, collectionPolicyFixture)).toEqual(
      collectionPolicyFixture,
    )
    expect(
      v.safeParse(CollectionPolicySchema, {
        allowedSources: [],
        retainContent: false,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(
        CollectionPolicySchema,
        omitKey(collectionPolicyFixture, 'allowedSources'),
      ).success,
    ).toBe(false)
    expect(
      v.safeParse(
        CollectionPolicySchema,
        omitKey(collectionPolicyFixture, 'retainContent'),
      ).success,
    ).toBe(false)
  })

  it('rejects unknown top-level and nested keys', () => {
    expect(
      v.safeParse(CollectionPolicySchema, {
        ...collectionPolicyFixture,
        observeEnabled: true,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(CollectionPolicySchema, {
        ...collectionPolicyFixture,
        allowedSources: [
          { ...chatTurnSourceFixture, composedMessage: 'private input' },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('OutboundInferencePolicySchema', () => {
  it('accepts exactly the three independently authorized modes', () => {
    expect(
      v.parse(
        OutboundInferencePolicySchema,
        disabledOutboundInferencePolicyFixture,
      ),
    ).toEqual(disabledOutboundInferencePolicyFixture)
    expect(
      v.parse(
        OutboundInferencePolicySchema,
        localOnlyOutboundInferencePolicyFixture,
      ),
    ).toEqual(localOnlyOutboundInferencePolicyFixture)
    expect(
      v.parse(
        OutboundInferencePolicySchema,
        remoteOutboundInferencePolicyFixture,
      ),
    ).toEqual(remoteOutboundInferencePolicyFixture)
  })

  it('requires explicit typed sources for local or configured-remote inference', () => {
    for (const mode of ['local-only', 'allow-configured-remote'] as const) {
      expect(
        v.safeParse(OutboundInferencePolicySchema, { mode }).success,
      ).toBe(false)
      expect(
        v.safeParse(OutboundInferencePolicySchema, {
          mode,
          allowedSources: [],
        }).success,
      ).toBe(true)
    }
  })

  it('keeps disabled fail-closed and rejects configuration or unknown keys', () => {
    expect(
      v.safeParse(OutboundInferencePolicySchema, {
        mode: 'disabled',
        allowedSources: [],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(OutboundInferencePolicySchema, {
        ...remoteOutboundInferencePolicyFixture,
        baseUrl: 'https://observer.invalid',
      }).success,
    ).toBe(false)
    expect(v.safeParse(OutboundInferenceModeSchema, 'remote').success).toBe(
      false,
    )
  })
})

describe('ProjectionPolicySchema', () => {
  it('requires explicit allowed hosts and closed domains, including empty deny-all lists', () => {
    expect(v.parse(ProjectionPolicySchema, projectionPolicyFixture)).toEqual(
      projectionPolicyFixture,
    )
    expect(
      v.safeParse(ProjectionPolicySchema, {
        allowedHosts: [],
        allowedDomains: [],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(
        ProjectionPolicySchema,
        omitKey(projectionPolicyFixture, 'allowedHosts'),
      ).success,
    ).toBe(false)
    expect(
      v.safeParse(
        ProjectionPolicySchema,
        omitKey(projectionPolicyFixture, 'allowedDomains'),
      ).success,
    ).toBe(false)
    expect(
      v.safeParse(ProjectionPolicySchema, {
        allowedHosts: [''],
        allowedDomains: ['work'],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(ProjectionPolicySchema, {
        allowedHosts: ['airi'],
        allowedDomains: ['personal'],
      }).success,
    ).toBe(false)
  })

  it('rejects unknown keys instead of stripping them', () => {
    expect(
      v.safeParse(ProjectionPolicySchema, {
        ...projectionPolicyFixture,
        applyEnabled: true,
      }).success,
    ).toBe(false)
  })
})

describe('policy independence and error behavior', () => {
  it('does not let any policy object satisfy either of the other policy schemas', () => {
    expect(
      v.safeParse(CollectionPolicySchema, projectionPolicyFixture).success,
    ).toBe(false)
    expect(
      v.safeParse(
        CollectionPolicySchema,
        remoteOutboundInferencePolicyFixture,
      ).success,
    ).toBe(false)
    expect(
      v.safeParse(OutboundInferencePolicySchema, collectionPolicyFixture)
        .success,
    ).toBe(false)
    expect(
      v.safeParse(OutboundInferencePolicySchema, projectionPolicyFixture)
        .success,
    ).toBe(false)
    expect(
      v.safeParse(ProjectionPolicySchema, collectionPolicyFixture).success,
    ).toBe(false)
    expect(
      v.safeParse(
        ProjectionPolicySchema,
        remoteOutboundInferencePolicyFixture,
      ).success,
    ).toBe(false)
  })

  it('rejects permission fields copied from another layer', () => {
    expect(
      v.safeParse(CollectionPolicySchema, {
        ...collectionPolicyFixture,
        allowedHosts: ['airi'],
        allowedDomains: ['work'],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(OutboundInferencePolicySchema, {
        ...disabledOutboundInferencePolicyFixture,
        allowedHosts: ['airi'],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(ProjectionPolicySchema, {
        ...projectionPolicyFixture,
        retainContent: true,
      }).success,
    ).toBe(false)
  })

  it('uses Valibot safe and throwing errors without custom coercion', () => {
    const input = {
      ...identityContextFixture,
      firstUnknown: true,
      secondUnknown: true,
    }

    expect(() => v.safeParse(IdentityContextSchema, input)).not.toThrow()
    const result = v.safeParse(IdentityContextSchema, input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]?.type).toBe('strict_object')
    }
    expect(() => v.parse(IdentityContextSchema, input)).toThrow(v.ValiError)
  })
})

function evidenceForSource(source: TypedHostSource) {
  return {
    ...interactionEvidenceFixture,
    source,
    policySnapshot: {
      ...evidencePolicySnapshotFixture,
      collection: {
        allowedSources: [source],
        retainContent: true,
      },
    },
  }
}

describe('InteractionEvidenceSchema', () => {
  it('accepts the complete strict host-neutral evidence unchanged', () => {
    expect(v.parse(InteractionEvidenceSchema, interactionEvidenceFixture)).toEqual(
      interactionEvidenceFixture,
    )
  })

  it('accepts each strict named nested object unchanged', () => {
    expect(v.parse(EvidenceConsentSchema, evidenceConsentFixture)).toEqual(
      evidenceConsentFixture,
    )
    expect(
      v.parse(EvidenceLearningPayloadSchema, evidenceLearningPayloadFixture),
    ).toEqual(evidenceLearningPayloadFixture)
    expect(
      v.parse(EvidencePolicySnapshotSchema, evidencePolicySnapshotFixture),
    ).toEqual(evidencePolicySnapshotFixture)
  })

  it.each([
    'schemaVersion',
    'id',
    'identity',
    'occurredAt',
    'sourceRef',
    'source',
    'consent',
    'learningPayload',
    'policySnapshot',
  ] as const)('requires top-level field %s without defaults', (field) => {
    expect(
      v.safeParse(
        InteractionEvidenceSchema,
        omitKey(interactionEvidenceFixture, field),
      ).success,
    ).toBe(false)
  })

  it('requires schemaVersion to be the literal number 1', () => {
    for (const schemaVersion of [0, 2, '1', null]) {
      expect(
        v.safeParse(InteractionEvidenceSchema, {
          ...interactionEvidenceFixture,
          schemaVersion,
        }).success,
      ).toBe(false)
    }
  })

  it('requires timezone-bearing ISO timestamps without coercion', () => {
    expect(
      v.safeParse(InteractionEvidenceSchema, {
        ...interactionEvidenceFixture,
        occurredAt: '2026-08-20T11:02:03+10:00',
      }).success,
    ).toBe(true)
    for (const occurredAt of [
      '2026-08-20T01:02:03',
      '2026-08-20',
      '',
      1_777_000_000,
    ]) {
      expect(
        v.safeParse(InteractionEvidenceSchema, {
          ...interactionEvidenceFixture,
          occurredAt,
        }).success,
      ).toBe(false)
    }
  })

  it('requires nonempty evidence, source, consent, and user-content strings', () => {
    const invalidEvidenceInputs = [
      { ...interactionEvidenceFixture, id: '' },
      { ...interactionEvidenceFixture, sourceRef: '' },
      {
        ...interactionEvidenceFixture,
        consent: { ...evidenceConsentFixture, policyVersion: '' },
      },
      {
        ...interactionEvidenceFixture,
        learningPayload: { ...evidenceLearningPayloadFixture, userText: '' },
      },
    ]
    for (const input of invalidEvidenceInputs) {
      expect(v.safeParse(InteractionEvidenceSchema, input).success).toBe(false)
    }
  })

  it('allows assistantText to be absent but requires a nonempty string when present', () => {
    const withoutAssistant = {
      ...interactionEvidenceFixture,
      learningPayload: { userText: evidenceLearningPayloadFixture.userText },
    }
    expect(v.parse(InteractionEvidenceSchema, withoutAssistant)).toEqual(
      withoutAssistant,
    )
    for (const assistantText of ['', null, 42]) {
      expect(
        v.safeParse(InteractionEvidenceSchema, {
          ...interactionEvidenceFixture,
          learningPayload: {
            userText: evidenceLearningPayloadFixture.userText,
            assistantText,
          },
        }).success,
      ).toBe(false)
    }
  })

  it.each([
    ['composedMessage', 'private composed input'],
    ['contexts', [{ text: 'private context' }]],
    ['systemPrompt', 'private system prompt'],
    ['systemMessages', [{ role: 'system', content: 'private' }]],
    ['tools', [{ name: 'shell' }]],
    ['metadata', { arbitrary: true }],
  ] as const)('rejects host-native top-level field %s', (field, value) => {
    expect(
      v.safeParse(InteractionEvidenceSchema, {
        ...interactionEvidenceFixture,
        [field]: value,
      }).success,
    ).toBe(false)
  })

  it.each([
    ['composedMessage', 'private composed input'],
    ['contexts', [{ text: 'private context' }]],
    ['systemPrompt', 'private system prompt'],
    ['systemMessages', [{ role: 'system', content: 'private' }]],
    ['tools', [{ name: 'shell' }]],
    ['metadata', { arbitrary: true }],
  ] as const)('rejects host-native learningPayload field %s', (field, value) => {
    expect(
      v.safeParse(InteractionEvidenceSchema, {
        ...interactionEvidenceFixture,
        learningPayload: {
          ...evidenceLearningPayloadFixture,
          [field]: value,
        },
      }).success,
    ).toBe(false)
  })

  it('rejects unknown keys at every other evidence nesting level', () => {
    const invalidEvidenceInputs = [
      {
        ...interactionEvidenceFixture,
        identity: { ...identityContextFixture, characterCardId: 'native-id' },
      },
      {
        ...interactionEvidenceFixture,
        source: { ...chatTurnSourceFixture, toolTrace: 'private trace' },
      },
      {
        ...interactionEvidenceFixture,
        consent: { ...evidenceConsentFixture, grantedByEvent: true },
      },
      {
        ...interactionEvidenceFixture,
        policySnapshot: {
          ...evidencePolicySnapshotFixture,
          authoritative: true,
        },
      },
      {
        ...interactionEvidenceFixture,
        policySnapshot: {
          ...evidencePolicySnapshotFixture,
          collection: {
            ...evidencePolicySnapshotFixture.collection,
            composedMessage: 'private input',
          },
        },
      },
      {
        ...interactionEvidenceFixture,
        policySnapshot: {
          ...evidencePolicySnapshotFixture,
          outboundInference: {
            ...disabledOutboundInferencePolicyFixture,
            tools: ['shell'],
          },
        },
      },
      {
        ...interactionEvidenceFixture,
        policySnapshot: {
          ...evidencePolicySnapshotFixture,
          projection: {
            ...projectionPolicyFixture,
            contexts: ['private'],
          },
        },
      },
    ]
    for (const input of invalidEvidenceInputs) {
      expect(v.safeParse(InteractionEvidenceSchema, input).success).toBe(false)
    }
  })
})

describe('evidence policy-snapshot structural authorization', () => {
  it.each(['code', 'terminal', 'tool-trace'] as const)(
    'accepts typed %s only when the exact source is collection-authorized in the snapshot',
    (contentCategory) => {
      const source: TypedHostSource = {
        kind: 'chat-turn',
        contentCategory,
      }
      expect(
        v.safeParse(InteractionEvidenceSchema, evidenceForSource(source)).success,
      ).toBe(true)

      expect(
        v.safeParse(InteractionEvidenceSchema, {
          ...evidenceForSource(source),
          policySnapshot: evidencePolicySnapshotFixture,
        }).success,
      ).toBe(false)

      expect(
        v.safeParse(InteractionEvidenceSchema, {
          ...evidenceForSource(source),
          policySnapshot: {
            ...evidencePolicySnapshotFixture,
            collection: {
              allowedSources: [
                { kind: 'explicit-form', contentCategory },
              ],
              retainContent: true,
            },
          },
        }).success,
      ).toBe(false)
    },
  )

  it('requires every evidence source, including ordinary conversation, in the exact collection allowlist', () => {
    expect(
      v.safeParse(InteractionEvidenceSchema, {
        ...interactionEvidenceFixture,
        policySnapshot: {
          ...evidencePolicySnapshotFixture,
          collection: { allowedSources: [], retainContent: true },
        },
      }).success,
    ).toBe(false)
  })

  it('does not let outbound or projection permission stand in for collection permission', () => {
    const outboundAllowsSource = {
      mode: 'local-only',
      allowedSources: [chatTurnSourceFixture],
    } as const
    expect(
      v.safeParse(InteractionEvidenceSchema, {
        ...interactionEvidenceFixture,
        policySnapshot: {
          collection: { allowedSources: [], retainContent: true },
          outboundInference: outboundAllowsSource,
          projection: projectionPolicyFixture,
          settingsRevision: 1,
        },
      }).success,
    ).toBe(false)
  })

  it('requires content retention in the snapshot for a live learningPayload', () => {
    expect(
      v.safeParse(InteractionEvidenceSchema, {
        ...interactionEvidenceFixture,
        policySnapshot: {
          ...evidencePolicySnapshotFixture,
          collection: {
            ...evidencePolicySnapshotFixture.collection,
            retainContent: false,
          },
        },
      }).success,
    ).toBe(false)
  })

  it('accepts collection-authorized evidence while outbound and projection remain deny-all', () => {
    const input = {
      ...interactionEvidenceFixture,
      policySnapshot: {
        collection: evidencePolicySnapshotFixture.collection,
        outboundInference: disabledOutboundInferencePolicyFixture,
        projection: { allowedHosts: [], allowedDomains: [] },
        settingsRevision: 0,
      },
    }
    expect(v.parse(InteractionEvidenceSchema, input)).toEqual(input)
  })

  it('requires settingsRevision to be a non-negative safe integer', () => {
    expect(
      v.safeParse(EvidencePolicySnapshotSchema, {
        ...evidencePolicySnapshotFixture,
        settingsRevision: 0,
      }).success,
    ).toBe(true)
    for (const settingsRevision of [
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      Infinity,
      '1',
    ]) {
      expect(
        v.safeParse(EvidencePolicySnapshotSchema, {
          ...evidencePolicySnapshotFixture,
          settingsRevision,
        }).success,
      ).toBe(false)
    }
  })

  it('rejects event-supplied claims of canonical authority or canonical settings', () => {
    for (const authorityClaim of [
      { canonicalAuthority: true },
      { canonicalSettings: evidencePolicySnapshotFixture },
      { expectedCanonicalRevision: 1 },
    ]) {
      expect(
        v.safeParse(InteractionEvidenceSchema, {
          ...interactionEvidenceFixture,
          policySnapshot: {
            ...evidencePolicySnapshotFixture,
            ...authorityClaim,
          },
        }).success,
      ).toBe(false)
    }
  })
})

describe('EvidenceDeduplicationIdentitySchema', () => {
  it('accepts exactly the five-field host-namespaced composite', () => {
    expect(
      v.parse(
        EvidenceDeduplicationIdentitySchema,
        evidenceDeduplicationIdentityFixture,
      ),
    ).toEqual(evidenceDeduplicationIdentityFixture)
  })

  it('treats equal sourceRef values from different hosts as distinct identities', () => {
    const otherHost = {
      ...evidenceDeduplicationIdentityFixture,
      hostId: 'airi',
    }
    expect(
      v.safeParse(EvidenceDeduplicationIdentitySchema, otherHost).success,
    ).toBe(true)
    expect(otherHost).not.toEqual(evidenceDeduplicationIdentityFixture)
  })

  it.each([
    'userId',
    'companionId',
    'relationshipId',
    'hostId',
    'sourceRef',
  ] as const)('requires nonempty composite field %s', (field) => {
    expect(
      v.safeParse(EvidenceDeduplicationIdentitySchema, {
        ...evidenceDeduplicationIdentityFixture,
        [field]: '',
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(
        EvidenceDeduplicationIdentitySchema,
        omitKey(evidenceDeduplicationIdentityFixture, field),
      ).success,
    ).toBe(false)
  })

  it('rejects session, domain, and arbitrary metadata from the canonical composite', () => {
    for (const extra of [
      { sessionId: identityContextFixture.sessionId },
      { domain: identityContextFixture.domain },
      { metadata: { arbitrary: true } },
    ]) {
      expect(
        v.safeParse(EvidenceDeduplicationIdentitySchema, {
          ...evidenceDeduplicationIdentityFixture,
          ...extra,
        }).success,
      ).toBe(false)
    }
  })
})

describe('EvidenceProvenanceSchema', () => {
  it('accepts live provenance containing the strict InteractionEvidence', () => {
    expect(
      v.parse(EvidenceProvenanceSchema, liveEvidenceProvenanceFixture),
    ).toEqual(liveEvidenceProvenanceFixture)
    expect(
      v.parse(LiveEvidenceProvenanceSchema, liveEvidenceProvenanceFixture),
    ).toEqual(liveEvidenceProvenanceFixture)
  })

  it('accepts a content-free deleted tombstone', () => {
    expect(
      v.parse(EvidenceProvenanceSchema, deletedEvidenceTombstoneFixture),
    ).toEqual(deletedEvidenceTombstoneFixture)
    expect(
      v.parse(
        DeletedEvidenceTombstoneSchema,
        deletedEvidenceTombstoneFixture,
      ),
    ).toEqual(deletedEvidenceTombstoneFixture)
  })

  it('rejects missing or unknown provenance discriminator states', () => {
    expect(
      v.safeParse(
        EvidenceProvenanceSchema,
        omitKey(liveEvidenceProvenanceFixture, 'state'),
      ).success,
    ).toBe(false)
    for (const state of ['deleted', 'tombstone', 'pending', 1]) {
      expect(
        v.safeParse(EvidenceProvenanceSchema, {
          ...deletedEvidenceTombstoneFixture,
          state,
        }).success,
      ).toBe(false)
    }
  })

  it('requires tombstone identifiers/reasons to be nonempty and deletedAt to be an ISO timestamp', () => {
    for (const input of [
      { ...deletedEvidenceTombstoneFixture, evidenceId: '' },
      { ...deletedEvidenceTombstoneFixture, reasonCode: '' },
      { ...deletedEvidenceTombstoneFixture, deletedAt: '' },
      {
        ...deletedEvidenceTombstoneFixture,
        deletedAt: '2026-08-21T02:03:04',
      },
    ]) {
      expect(v.safeParse(EvidenceProvenanceSchema, input).success).toBe(false)
    }
  })

  it.each([
    ['learningPayload', evidenceLearningPayloadFixture],
    ['excerpt', 'private excerpt'],
    ['sourceRef', interactionEvidenceFixture.sourceRef],
    ['hostContent', { messages: ['private'] }],
    ['evidence', interactionEvidenceFixture],
    ['metadata', { arbitrary: true }],
  ] as const)('rejects tombstone host/content field %s', (field, value) => {
    expect(
      v.safeParse(EvidenceProvenanceSchema, {
        ...deletedEvidenceTombstoneFixture,
        [field]: value,
      }).success,
    ).toBe(false)
  })

  it('rejects live-wrapper excerpts and host-native content outside evidence', () => {
    for (const extra of [
      { excerpt: 'private excerpt' },
      { composedMessage: 'private composed input' },
      { contexts: [{ text: 'private context' }] },
      { tools: [{ name: 'shell' }] },
      { metadata: { arbitrary: true } },
    ]) {
      expect(
        v.safeParse(EvidenceProvenanceSchema, {
          ...liveEvidenceProvenanceFixture,
          ...extra,
        }).success,
      ).toBe(false)
    }
  })
})

describe('T2C1 frozen public governance types', () => {
  it('keeps candidate and preference lifecycle states separate', () => {
    expectTypeOf<CandidateStatus>().toEqualTypeOf<
      | 'pending_confirmation'
      | 'confirmed'
      | 'rejected'
      | 'superseded'
      | 'deleted'
    >()
    expectTypeOf<PreferenceStatus>().toEqualTypeOf<
      'active' | 'superseded' | 'revoked' | 'deleted'
    >()
    expectTypeOf<PreferenceAuthority>().toEqualTypeOf<
      'user-set' | 'user-confirmed'
    >()
    expectTypeOf<PreferenceRiskCategory>().toEqualTypeOf<
      'standard' | 'sensitive'
    >()
  })

  it('freezes the five-level discriminated scope union', () => {
    expectTypeOf<PreferenceScope>().toEqualTypeOf<
      | { kind: 'task'; taskId: string }
      | { kind: 'workspace'; workspaceId: string }
      | { kind: 'host'; hostId: string }
      | { kind: 'domain'; domain: Domain }
      | { kind: 'global' }
    >()
  })

  it('freezes evidence and external proposal provenance without MCP capability fields', () => {
    expectTypeOf<ObserverEvidenceProvenance>().toEqualTypeOf<{
      kind: 'observer-evidence'
      evidenceIds: string[]
    }>()
    expectTypeOf<ExternalProposalProvenance>().toEqualTypeOf<{
      kind: 'external-proposal'
      channel: 'runtime-client' | 'mcp'
      proposerId: string
      proposalRef: string
    }>()
    expectTypeOf<CandidateProvenance>().toEqualTypeOf<
      ObserverEvidenceProvenance | ExternalProposalProvenance
    >()
  })

  it('freezes the versioned SHA-256 candidate key representation', () => {
    expectTypeOf<CandidateIdempotencyKey>().toEqualTypeOf<{
      version: 1
      algorithm: 'sha256'
      digest: string
    }>()
  })

  it('separates stable profile ownership from host applicability context', () => {
    expectTypeOf<PreferenceIdentity>().toEqualTypeOf<{
      userId: string
      companionId: string
      relationshipId: string
    }>()
    expectTypeOf<PreferenceCandidate['identity']>().toEqualTypeOf<
      PreferenceIdentity
    >()
    expectTypeOf<PreferenceRecord['identity']>().toEqualTypeOf<
      PreferenceIdentity
    >()
  })

  it('keeps confidence on candidates and authority only on records', () => {
    expectTypeOf<PreferenceCandidate['confidence']>().toEqualTypeOf<number>()
    expectTypeOf<PreferenceRecord['authority']>().toEqualTypeOf<
      PreferenceAuthority
    >()
    expectTypeOf<PendingCandidateProposal['status']>().toEqualTypeOf<
      'pending_confirmation'
    >()
  })

  it('freezes every T2C1 schema output to its public type', () => {
    expectTypeOf<v.InferOutput<typeof PreferenceSchema>>().toEqualTypeOf<Preference>()
    expectTypeOf<
      v.InferOutput<typeof PreferenceScopeSchema>
    >().toEqualTypeOf<PreferenceScope>()
    expectTypeOf<
      v.InferOutput<typeof CandidateStatusSchema>
    >().toEqualTypeOf<CandidateStatus>()
    expectTypeOf<
      v.InferOutput<typeof PreferenceStatusSchema>
    >().toEqualTypeOf<PreferenceStatus>()
    expectTypeOf<
      v.InferOutput<typeof PreferenceCandidateSchema>
    >().toEqualTypeOf<PreferenceCandidate>()
    expectTypeOf<
      v.InferOutput<typeof PreferenceIdentitySchema>
    >().toEqualTypeOf<PreferenceIdentity>()
    expectTypeOf<
      v.InferOutput<typeof PendingCandidateProposalSchema>
    >().toEqualTypeOf<PendingCandidateProposal>()
    expectTypeOf<
      v.InferOutput<typeof PreferenceRecordSchema>
    >().toEqualTypeOf<PreferenceRecord>()
    expectTypeOf<
      v.InferOutput<typeof EffectiveProfileQuerySchema>
    >().toEqualTypeOf<EffectiveProfileQuery>()
    expectTypeOf<
      v.InferOutput<typeof BehaviorGuidanceSchema>
    >().toEqualTypeOf<BehaviorGuidance>()
  })

  it('freezes all governance command and receipt schema outputs', () => {
    expectTypeOf<
      v.InferOutput<typeof ProposeCandidateCommandSchema>
    >().toEqualTypeOf<ProposeCandidateCommand>()
    expectTypeOf<
      v.InferOutput<typeof ConfirmCandidateCommandSchema>
    >().toEqualTypeOf<ConfirmCandidateCommand>()
    expectTypeOf<
      v.InferOutput<typeof RejectCandidateCommandSchema>
    >().toEqualTypeOf<RejectCandidateCommand>()
    expectTypeOf<
      v.InferOutput<typeof DeleteCandidateCommandSchema>
    >().toEqualTypeOf<DeleteCandidateCommand>()
    expectTypeOf<
      v.InferOutput<typeof DeleteEvidenceCommandSchema>
    >().toEqualTypeOf<DeleteEvidenceCommand>()
    expectTypeOf<
      v.InferOutput<typeof DeleteEvidenceResultSchema>
    >().toEqualTypeOf<DeleteEvidenceResult>()
    expectTypeOf<
      v.InferOutput<typeof SuppressCandidateCommandSchema>
    >().toEqualTypeOf<SuppressCandidateCommand>()
    expectTypeOf<
      v.InferOutput<typeof CreateExplicitPreferenceCommandSchema>
    >().toEqualTypeOf<CreateExplicitPreferenceCommand>()
    expectTypeOf<
      v.InferOutput<typeof RevisePreferenceCommandSchema>
    >().toEqualTypeOf<RevisePreferenceCommand>()
    expectTypeOf<
      v.InferOutput<typeof RevokePreferenceCommandSchema>
    >().toEqualTypeOf<RevokePreferenceCommand>()
    expectTypeOf<
      v.InferOutput<typeof SupersededPreferenceExpectationSchema>
    >().toEqualTypeOf<SupersededPreferenceExpectation>()
    expectTypeOf<
      v.InferOutput<typeof GovernanceMutationKindSchema>
    >().toEqualTypeOf<GovernanceMutationKind>()
    expectTypeOf<
      v.InferOutput<typeof MutationReceiptResultSchema>
    >().toEqualTypeOf<MutationReceiptResult>()
    expectTypeOf<
      v.InferOutput<typeof MutationReceiptSchema>
    >().toEqualTypeOf<MutationReceipt>()
  })
})

describe('PreferenceSchema closed seven-key union', () => {
  it.each([
    ['interaction.response_detail', ['concise', 'balanced', 'detailed']],
    ['interaction.directness', ['gentle', 'balanced', 'direct']],
    ['interaction.initiative', ['ask_first', 'low_risk_auto', 'proactive']],
    [
      'interaction.interruption_policy',
      ['never_interrupt', 'important_only', 'allowed'],
    ],
    ['work.approval_style', ['always_ask', 'risk_based', 'review_after']],
    ['work.verification_depth', ['minimal', 'targeted', 'exhaustive']],
    [
      'companion.support_style',
      ['listen_first', 'acknowledge_then_act', 'direct_action'],
    ],
  ] as const)('accepts only values belonging to %s', (key, values) => {
    for (const value of values) {
      expect(v.safeParse(PreferenceSchema, { key, value }).success).toBe(true)
    }
    expect(
      v.safeParse(PreferenceSchema, { key, value: 'free-form-value' }).success,
    ).toBe(false)
  })

  it('rejects free-form and unknown preference keys', () => {
    for (const input of [
      { key: 'custom.preference', value: 'anything' },
      { key: '', value: 'concise' },
      { key: 'interaction.responseDetail', value: 'concise' },
    ]) {
      expect(v.safeParse(PreferenceSchema, input).success).toBe(false)
    }
  })

  it('rejects unknown keys instead of stripping them', () => {
    expect(
      v.safeParse(PreferenceSchema, {
        ...responseDetailPreferenceFixture,
        explanation: 'free form',
      }).success,
    ).toBe(false)
  })
})

describe('PreferenceScopeSchema', () => {
  it('accepts exactly task, workspace, host, domain, and global scope', () => {
    for (const input of [
      { kind: 'task', taskId: 'task-1' },
      workspacePreferenceScopeFixture,
      { kind: 'host', hostId: 'airi' },
      { kind: 'domain', domain: 'work' },
      { kind: 'global' },
    ]) {
      expect(v.safeParse(PreferenceScopeSchema, input).success).toBe(true)
    }
  })

  it('rejects missing identifiers, unknown scope kinds, and unknown domains', () => {
    for (const input of [
      { kind: 'task', taskId: '' },
      { kind: 'workspace' },
      { kind: 'project', projectId: 'project-1' },
      { kind: 'domain', domain: 'personal' },
    ]) {
      expect(v.safeParse(PreferenceScopeSchema, input).success).toBe(false)
    }
  })

  it('rejects fields belonging to another scope variant', () => {
    expect(
      v.safeParse(PreferenceScopeSchema, {
        kind: 'global',
        hostId: 'airi',
      }).success,
    ).toBe(false)
  })
})

describe('candidate lifecycle and provenance schemas', () => {
  it('accepts only the three-field stable preference identity', () => {
    expect(v.parse(PreferenceIdentitySchema, preferenceIdentityFixture)).toEqual(
      preferenceIdentityFixture,
    )
    expect(
      v.safeParse(PreferenceIdentitySchema, {
        ...preferenceIdentityFixture,
        hostId: identityContextFixture.hostId,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(
        PreferenceIdentitySchema,
        omitKey(preferenceIdentityFixture, 'relationshipId'),
      ).success,
    ).toBe(false)
  })

  it('accepts the separate closed lifecycle enums', () => {
    for (const status of [
      'pending_confirmation',
      'confirmed',
      'rejected',
      'superseded',
      'deleted',
    ]) {
      expect(v.safeParse(CandidateStatusSchema, status).success).toBe(true)
    }
    for (const status of ['active', 'revoked']) {
      expect(v.safeParse(CandidateStatusSchema, status).success).toBe(false)
    }
    for (const status of ['active', 'superseded', 'revoked', 'deleted']) {
      expect(v.safeParse(PreferenceStatusSchema, status).success).toBe(true)
    }
    for (const status of ['pending_confirmation', 'confirmed', 'rejected']) {
      expect(v.safeParse(PreferenceStatusSchema, status).success).toBe(false)
    }
  })

  it('accepts strict observer-evidence and external proposal provenance', () => {
    expect(
      v.parse(
        ObserverEvidenceProvenanceSchema,
        observerEvidenceProvenanceFixture,
      ),
    ).toEqual(observerEvidenceProvenanceFixture)
    expect(
      v.parse(
        ExternalProposalProvenanceSchema,
        externalProposalProvenanceFixture,
      ),
    ).toEqual(externalProposalProvenanceFixture)
    expect(
      v.safeParse(CandidateProvenanceSchema, externalProposalProvenanceFixture)
        .success,
    ).toBe(true)
  })

  it('rejects arbitrary provenance and external claims of user confirmation', () => {
    for (const input of [
      { kind: 'model', prompt: 'private' },
      { ...externalProposalProvenanceFixture, authority: 'user-confirmed' },
      { ...externalProposalProvenanceFixture, confirmed: true },
      { ...externalProposalProvenanceFixture, proposerId: '' },
      { ...externalProposalProvenanceFixture, proposalRef: '' },
    ]) {
      expect(v.safeParse(CandidateProvenanceSchema, input).success).toBe(false)
    }
  })

  it('requires a version-1 lowercase SHA-256 digest', () => {
    expect(
      v.parse(CandidateIdempotencyKeySchema, candidateIdempotencyKeyFixture),
    ).toEqual(candidateIdempotencyKeyFixture)
    for (const input of [
      { ...candidateIdempotencyKeyFixture, version: 2 },
      { ...candidateIdempotencyKeyFixture, algorithm: 'md5' },
      { ...candidateIdempotencyKeyFixture, digest: 'not-a-digest' },
      {
        ...candidateIdempotencyKeyFixture,
        digest: candidateIdempotencyKeyFixture.digest.toUpperCase(),
      },
    ]) {
      expect(v.safeParse(CandidateIdempotencyKeySchema, input).success).toBe(
        false,
      )
    }
  })

  it('accepts a complete strict pending candidate', () => {
    expect(
      v.parse(PreferenceCandidateSchema, preferenceCandidateFixture),
    ).toEqual(preferenceCandidateFixture)
  })

  it('requires all candidate identity and governance fields', () => {
    for (const field of [
      'id',
      'identity',
      'preference',
      'scope',
      'projection',
      'provenance',
      'sourceHostIds',
      'confidence',
      'riskCategory',
      'status',
      'idempotencyKey',
      'revision',
      'createdAt',
      'updatedAt',
    ]) {
      expect(
        v.safeParse(
          PreferenceCandidateSchema,
          omitKey(preferenceCandidateFixture, field),
        ).success,
      ).toBe(false)
    }
  })

  it('constrains confidence as evidence and never accepts it as authority', () => {
    for (const confidence of [-0.01, 1.01, Number.NaN, Infinity, '0.8']) {
      expect(
        v.safeParse(PreferenceCandidateSchema, {
          ...preferenceCandidateFixture,
          confidence,
        }).success,
      ).toBe(false)
    }
    expect(
      v.safeParse(PreferenceCandidateSchema, {
        ...preferenceCandidateFixture,
        authority: 'user-confirmed',
      }).success,
    ).toBe(false)
  })

  it('requires a non-negative safe candidate revision and ISO timestamps', () => {
    for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0']) {
      expect(
        v.safeParse(PreferenceCandidateSchema, {
          ...preferenceCandidateFixture,
          revision,
        }).success,
      ).toBe(false)
    }
    expect(
      v.safeParse(PreferenceCandidateSchema, {
        ...preferenceCandidateFixture,
        updatedAt: '2026-08-21T03:00:00',
      }).success,
    ).toBe(false)
  })

  it('requires observer provenance IDs to equal the normalized evidence IDs', () => {
    expect(
      v.safeParse(PreferenceCandidateSchema, {
        ...preferenceCandidateFixture,
        provenance: {
          kind: 'observer-evidence',
          evidenceIds: ['evidence-other'],
        },
      }).success,
    ).toBe(false)
  })

  it('requires content-free source host IDs at candidate creation and rejects empty or duplicate values', () => {
    for (const sourceHostIds of [[], ['reference-host', 'reference-host']]) {
      expect(v.safeParse(PreferenceCandidateSchema, {
        ...preferenceCandidateFixture,
        sourceHostIds,
      }).success).toBe(false)
      expect(v.safeParse(PendingCandidateProposalSchema, {
        ...pendingCandidateProposalFixture,
        sourceHostIds,
      }).success).toBe(false)
      expect(v.safeParse(ProposeCandidateCommandSchema, {
        ...proposeCandidateCommandFixture,
        sourceHostIds,
      }).success).toBe(false)
    }
  })

  it('rejects unknown candidate fields and schema versions', () => {
    expect(
      v.safeParse(PreferenceCandidateSchema, {
        ...preferenceCandidateFixture,
        schemaVersion: 2,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(PreferenceCandidateSchema, {
        ...preferenceCandidateFixture,
        modelPrompt: 'private',
      }).success,
    ).toBe(false)
  })

  it('accepts only pending proposal input and rejects already-confirmed Observer output', () => {
    expect(
      v.parse(PendingCandidateProposalSchema, pendingCandidateProposalFixture),
    ).toEqual(pendingCandidateProposalFixture)
    for (const status of ['confirmed', 'rejected', 'active']) {
      expect(
        v.safeParse(PendingCandidateProposalSchema, {
          ...pendingCandidateProposalFixture,
          status,
        }).success,
      ).toBe(false)
    }
    expect(
      v.safeParse(PendingCandidateProposalSchema, {
        ...pendingCandidateProposalFixture,
        authority: 'user-confirmed',
      }).success,
    ).toBe(false)
  })
})

describe('PreferenceRecordSchema authority, revision, and supersession', () => {
  it('accepts a complete active user-authorized record', () => {
    expect(
      v.parse(PreferenceRecordSchema, activePreferenceRecordFixture),
    ).toEqual(activePreferenceRecordFixture)
  })

  it('accepts only user-set or user-confirmed authority', () => {
    expect(v.safeParse(PreferenceAuthoritySchema, 'user-set').success).toBe(true)
    expect(v.safeParse(PreferenceAuthoritySchema, 'user-confirmed').success).toBe(
      true,
    )
    for (const authority of ['observer', 'adapter', 'agent', 'confidence']) {
      expect(v.safeParse(PreferenceAuthoritySchema, authority).success).toBe(
        false,
      )
    }
  })

  it('requires positive safe optimistic-concurrency revisions', () => {
    for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
      expect(
        v.safeParse(PreferenceRecordSchema, {
          ...activePreferenceRecordFixture,
          revision,
        }).success,
      ).toBe(false)
    }
  })

  it('allows a status mutation to advance revision without inventing a predecessor', () => {
    expect(
      v.safeParse(PreferenceRecordSchema, revokedPreferenceRecordFixture).success,
    ).toBe(true)
  })

  it('allows a real replacement edge independently of numeric revision', () => {
    expect(
      v.safeParse(PreferenceRecordSchema, replacementPreferenceRecordFixture)
        .success,
    ).toBe(true)
  })

  it('rejects self-supersession at every valid revision', () => {
    for (const revision of [1, 2]) {
      expect(
        v.safeParse(PreferenceRecordSchema, {
          ...activePreferenceRecordFixture,
          revision,
          supersedes: activePreferenceRecordFixture.id,
        }).success,
      ).toBe(false)
    }
  })

  it('requires superseded status and supersededBy to agree', () => {
    expect(
      v.safeParse(PreferenceRecordSchema, {
        ...activePreferenceRecordFixture,
        status: 'superseded',
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(PreferenceRecordSchema, {
        ...activePreferenceRecordFixture,
        status: 'superseded',
        supersededBy: 'preference-2',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(PreferenceRecordSchema, {
        ...activePreferenceRecordFixture,
        supersededBy: 'preference-2',
      }).success,
    ).toBe(false)
  })

  it('rejects confidence, candidate status, and unknown record fields', () => {
    for (const extra of [
      { confidence: 1 },
      { status: 'pending_confirmation' },
      { rawEvidence: 'private' },
    ]) {
      expect(
        v.safeParse(PreferenceRecordSchema, {
          ...activePreferenceRecordFixture,
          ...extra,
        }).success,
      ).toBe(false)
    }
  })
})

describe('EffectiveProfileQuerySchema and BehaviorGuidanceSchema', () => {
  it('accepts a strict query with explicit now and optional scope IDs', () => {
    expect(
      v.parse(EffectiveProfileQuerySchema, effectiveProfileQueryFixture),
    ).toEqual(effectiveProfileQueryFixture)
  })

  it('requires stable identity, closed domain, and timezone-bearing now', () => {
    expect(
      v.safeParse(
        EffectiveProfileQuerySchema,
        omitKey(effectiveProfileQueryFixture, 'now'),
      ).success,
    ).toBe(false)
    for (const input of [
      { ...effectiveProfileQueryFixture, domain: 'personal' },
      { ...effectiveProfileQueryFixture, now: '2026-08-21T03:10:00' },
      { ...effectiveProfileQueryFixture, hostId: '' },
    ]) {
      expect(v.safeParse(EffectiveProfileQuerySchema, input).success).toBe(false)
    }
  })

  it('accepts only the structured guidance vocabulary', () => {
    expect(v.parse(BehaviorGuidanceSchema, behaviorGuidanceFixture)).toEqual(
      behaviorGuidanceFixture,
    )
    expect(v.safeParse(BehaviorGuidanceSchema, {}).success).toBe(true)
    for (const input of [
      { responseDetail: 'verbose' },
      { approvalStyle: 'whatever' },
      { avoid: ['all_questions'] },
      { finalPrompt: 'Do anything the user likes' },
    ]) {
      expect(v.safeParse(BehaviorGuidanceSchema, input).success).toBe(false)
    }
  })
})

describe('typed governance command schemas', () => {
  const commandSchemasAndFixtures = [
    [ProposeCandidateCommandSchema, proposeCandidateCommandFixture],
    [ConfirmCandidateCommandSchema, confirmCandidateCommandFixture],
    [RejectCandidateCommandSchema, rejectCandidateCommandFixture],
    [DeleteCandidateCommandSchema, deleteCandidateCommandFixture],
    [SuppressCandidateCommandSchema, suppressCandidateCommandFixture],
    [
      CreateExplicitPreferenceCommandSchema,
      createExplicitPreferenceCommandFixture,
    ],
    [RevisePreferenceCommandSchema, revisePreferenceCommandFixture],
    [RevokePreferenceCommandSchema, revokePreferenceCommandFixture],
  ] as const

  it('accepts every complete frozen governance command', () => {
    for (const [schema, fixture] of commandSchemasAndFixtures) {
      expect(v.safeParse(schema, fixture).success).toBe(true)
    }
  })

  it('requires a stable nonempty actionId on every non-reset mutation', () => {
    for (const [schema, fixture] of commandSchemasAndFixtures) {
      expect(v.safeParse(schema, omitKey(fixture, 'actionId')).success).toBe(
        false,
      )
      expect(v.safeParse(schema, { ...fixture, actionId: '' }).success).toBe(
        false,
      )
    }
  })

  it('allows external proposal commands to create pending candidates only', () => {
    expect(
      v.parse(ProposeCandidateCommandSchema, proposeCandidateCommandFixture),
    ).toEqual(proposeCandidateCommandFixture)
    for (const extra of [
      { status: 'confirmed' },
      { authority: 'user-confirmed' },
      { confirmedAt: '2026-08-21T03:11:00Z' },
    ]) {
      expect(
        v.safeParse(ProposeCandidateCommandSchema, {
          ...proposeCandidateCommandFixture,
          ...extra,
        }).success,
      ).toBe(false)
    }
    expect(
      v.safeParse(ProposeCandidateCommandSchema, {
        ...proposeCandidateCommandFixture,
        provenance: observerEvidenceProvenanceFixture,
      }).success,
    ).toBe(false)
  })

  it('requires expected candidate revisions for confirm/reject/delete/suppress', () => {
    for (const [schema, fixture] of [
      [ConfirmCandidateCommandSchema, confirmCandidateCommandFixture],
      [RejectCandidateCommandSchema, rejectCandidateCommandFixture],
      [DeleteCandidateCommandSchema, deleteCandidateCommandFixture],
      [SuppressCandidateCommandSchema, suppressCandidateCommandFixture],
    ] as const) {
      expect(
        v.safeParse(schema, omitKey(fixture, 'expectedCandidateRevision')).success,
      ).toBe(false)
      expect(
        v.safeParse(schema, { ...fixture, expectedCandidateRevision: -1 })
          .success,
      ).toBe(false)
    }
  })

  it('freezes an explicit paired supersession expectation during confirm', () => {
    const expectation = {
      preferenceId: activePreferenceRecordFixture.id,
      expectedRevision: activePreferenceRecordFixture.revision,
    }
    expect(
      v.parse(SupersededPreferenceExpectationSchema, expectation),
    ).toEqual(expectation)
    expect(
      v.safeParse(ConfirmCandidateCommandSchema, {
        ...confirmCandidateCommandFixture,
        supersedesPreference: expectation,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(ConfirmCandidateCommandSchema, {
        ...confirmCandidateCommandFixture,
        supersedesPreference: {
          preferenceId: activePreferenceRecordFixture.id,
        },
      }).success,
    ).toBe(false)
  })

  it('prevents explicit creation from silently replacing an active slot', () => {
    expect(
      v.parse(
        CreateExplicitPreferenceCommandSchema,
        createExplicitPreferenceCommandFixture,
      ),
    ).toEqual(createExplicitPreferenceCommandFixture)
    for (const expectedNoActivePreference of [false, 1, 'true']) {
      expect(
        v.safeParse(CreateExplicitPreferenceCommandSchema, {
          ...createExplicitPreferenceCommandFixture,
          expectedNoActivePreference,
        }).success,
      ).toBe(false)
    }
  })

  it('requires explicit predecessor revision and a different replacement ID', () => {
    expect(
      v.parse(RevisePreferenceCommandSchema, revisePreferenceCommandFixture),
    ).toEqual(revisePreferenceCommandFixture)
    expect(
      v.safeParse(
        RevisePreferenceCommandSchema,
        omitKey(revisePreferenceCommandFixture, 'expectedPreferenceRevision'),
      ).success,
    ).toBe(false)
    expect(
      v.safeParse(RevisePreferenceCommandSchema, {
        ...revisePreferenceCommandFixture,
        replacementPreferenceId: revisePreferenceCommandFixture.preferenceId,
      }).success,
    ).toBe(false)
  })

  it('requires positive expected preference revisions for revise and revoke', () => {
    for (const [schema, fixture] of [
      [RevisePreferenceCommandSchema, revisePreferenceCommandFixture],
      [RevokePreferenceCommandSchema, revokePreferenceCommandFixture],
    ] as const) {
      for (const expectedPreferenceRevision of [0, -1, 1.5, '1']) {
        expect(
          v.safeParse(schema, { ...fixture, expectedPreferenceRevision }).success,
        ).toBe(false)
      }
    }
  })

  it('rejects unknown fields on every governance command', () => {
    for (const [schema, fixture] of commandSchemasAndFixtures) {
      expect(
        v.safeParse(schema, { ...fixture, arbitrary: true }).success,
      ).toBe(false)
    }
  })
})

describe('MutationReceiptSchema', () => {
  it('accepts a content-free replay receipt for a governed command', () => {
    expect(v.parse(MutationReceiptSchema, mutationReceiptFixture)).toEqual(
      mutationReceiptFixture,
    )
  })

  it('accepts only the eleven frozen mutation kinds', () => {
    for (const mutation of [
      'propose-candidate',
      'confirm-candidate',
      'reject-candidate',
      'delete-candidate',
      'suppress-candidate',
      'create-explicit-preference',
      'revise-preference',
      'revoke-preference',
      'update-connection-settings',
      'report-projection-status',
      'delete-evidence',
    ]) {
      expect(v.safeParse(GovernanceMutationKindSchema, mutation).success).toBe(
        true,
      )
    }
    expect(v.safeParse(GovernanceMutationKindSchema, 'reset').success).toBe(
      false,
    )
  })

  it('requires non-sensitive typed results and a lowercase SHA-256 payload hash', () => {
    expect(
      v.safeParse(MutationReceiptResultSchema, { kind: 'none' }).success,
    ).toBe(true)
    for (const input of [
      { ...mutationReceiptFixture, payloadHash: 'not-a-hash' },
      {
        ...mutationReceiptFixture,
        payloadHash: mutationReceiptFixture.payloadHash.toUpperCase(),
      },
      { ...mutationReceiptFixture, actionId: '' },
      { ...mutationReceiptFixture, recordedAt: '2026-08-21T03:12:01' },
      { ...mutationReceiptFixture, requestPayload: { private: true } },
    ]) {
      expect(v.safeParse(MutationReceiptSchema, input).success).toBe(false)
    }
  })

  it('stores only content-free evidence deletion replay metadata', () => {
    expect(v.parse(DeleteEvidenceResultSchema, deleteEvidenceResultFixture)).toEqual(
      deleteEvidenceResultFixture,
    )
    expect(v.parse(MutationReceiptSchema, deleteEvidenceMutationReceiptFixture)).toEqual(
      deleteEvidenceMutationReceiptFixture,
    )
    for (const privateField of ['learningPayload', 'evidence', 'userText', 'assistantText']) {
      expect(
        v.safeParse(DeleteEvidenceResultSchema, {
          ...deleteEvidenceResultFixture,
          [privateField]: 'private',
        }).success,
      ).toBe(false)
    }
  })

  it('allows zero cascade while rejecting empty or duplicate affected IDs', () => {
    expect(
      v.parse(DeleteEvidenceResultSchema, deleteEvidenceNoCascadeResultFixture),
    ).toEqual(deleteEvidenceNoCascadeResultFixture)

    for (const patch of [
      { deletedPendingCandidateIds: [''] },
      { revokedPreferenceIds: [''] },
      { deletedPendingCandidateIds: ['candidate-1', 'candidate-1'] },
      { revokedPreferenceIds: ['preference-1', 'preference-1'] },
    ]) {
      expect(
        v.safeParse(DeleteEvidenceResultSchema, {
          ...deleteEvidenceNoCascadeResultFixture,
          ...patch,
        }).success,
      ).toBe(false)
    }

  })
})

describe('DeleteEvidenceCommandSchema', () => {
  it('accepts the exact identity-targeted explicit deletion command', () => {
    expect(v.parse(DeleteEvidenceCommandSchema, deleteEvidenceCommandFixture)).toEqual(
      deleteEvidenceCommandFixture,
    )
  })

  it('requires action, evidence, identity, audit, time, and explicit cascade intent', () => {
    for (const field of [
      'actionId', 'evidenceId', 'identity', 'auditEventId', 'occurredAt',
      'revokeDependentPreferences',
    ] as const) {
      const input = { ...deleteEvidenceCommandFixture } as Record<string, unknown>
      delete input[field]
      expect(v.safeParse(DeleteEvidenceCommandSchema, input).success).toBe(false)
    }
  })

  it('rejects revisions, settings fences, raw content, and unknown fields', () => {
    for (const extra of [
      { expectedEvidenceRevision: 1 },
      { expectedSettingsRevision: 1 },
      { learningPayload: { userText: 'private' } },
      { arbitrary: true },
    ]) {
      expect(v.safeParse(DeleteEvidenceCommandSchema, {
        ...deleteEvidenceCommandFixture,
        ...extra,
      }).success).toBe(false)
    }
  })
})

describe('T2C2A connection and content-free public contract types', () => {
  it('freezes the closed connection, projection, and policy-decision enums', () => {
    expectTypeOf<AdapterConnectionState>().toEqualTypeOf<
      'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error'
    >()
    expectTypeOf<ProjectionDeliveryState>().toEqualTypeOf<
      | 'locally-written'
      | 'verified-applied'
      | 'tombstone-locally-written'
      | 'verified-guidance-absent'
      | 'error'
    >()
    expectTypeOf<ProjectionDetailCode>().toEqualTypeOf<
      | 'guidance-local-write-completed'
      | 'guidance-snapshot-verified'
      | 'tombstone-local-write-completed'
      | 'guidance-absence-snapshot-verified'
      | 'guidance-absence-manually-verified'
      | 'transport-write-failed'
      | 'verification-failed'
      | 'transport-disconnected'
      | 'runtime-unavailable'
    >()
    expectTypeOf<ContentFreePolicyStage>().toEqualTypeOf<
      'collection' | 'learning' | 'outbound-inference' | 'projection'
    >()
    expectTypeOf<ContentFreePolicyOutcome>().toEqualTypeOf<
      'denied' | 'discarded'
    >()
    expectTypeOf<ContentFreePolicyReasonCode>().toEqualTypeOf<
      | 'observe-disabled'
      | 'collection-disabled'
      | 'learning-disabled'
      | 'outbound-inference-disabled'
      | 'outbound-source-not-allowed'
      | 'projection-disabled'
      | 'projection-scope-not-allowed'
      | 'stale-settings-revision'
      | 'late-result-discarded'
    >()
  })

  it('freezes connection ownership, commands, and content-free decision shapes', () => {
    expectTypeOf<ConnectionSettings>().toEqualTypeOf<{
      schemaVersion: 1
      identity: PreferenceIdentity
      hostId: string
      collectionPolicy: CollectionPolicy
      outboundInferencePolicy: OutboundInferencePolicy
      projectionPolicy: ProjectionPolicy
      observeEnabled: boolean
      learnEnabled: boolean
      applyEnabled: boolean
      revision: number
      projectionStatus?: AdapterProjectionStatus
      updatedAt: string
    }>()
    expectTypeOf<UpdateConnectionSettingsCommand>().toEqualTypeOf<{
      actionId: string
      identity: PreferenceIdentity
      hostId: string
      expectedSettingsRevision: number
      patch: {
        collectionPolicy?: CollectionPolicy
        outboundInferencePolicy?: OutboundInferencePolicy
        projectionPolicy?: ProjectionPolicy
        observeEnabled?: boolean
        learnEnabled?: boolean
        applyEnabled?: boolean
      }
      occurredAt: string
    }>()
    expectTypeOf<ContentFreePolicyDecision>().toEqualTypeOf<{
      schemaVersion: 1
      decisionId: string
      identity: PreferenceIdentity
      hostId: string
      domain: Domain
      settingsRevision: number
      stage: ContentFreePolicyStage
      outcome: ContentFreePolicyOutcome
      reasonCode: ContentFreePolicyReasonCode
      occurredAt: string
    }>()
    expectTypeOf<ReportProjectionStatusCommand>().toEqualTypeOf<
      {
      actionId: string
      identity: PreferenceIdentity
      hostId: string
      domain: Domain
      expectedSettingsRevision: number
      connectionState: AdapterConnectionState
      lastAttemptAt: string
      detailCode: ProjectionDetailCode
      occurredAt: string
      } & (
        | {
            state: 'locally-written' | 'verified-applied'
            lastGuidanceHash: string
          }
        | {
            state:
              | 'tombstone-locally-written'
              | 'verified-guidance-absent'
            lastGuidanceHash?: never
          }
        | { state: 'error'; lastGuidanceHash?: string }
      )
    >()
  })

  it('keeps schema outputs equal to their frozen exported types', () => {
    expectTypeOf<v.InferOutput<typeof AdapterConnectionStateSchema>>().toEqualTypeOf<AdapterConnectionState>()
    expectTypeOf<v.InferOutput<typeof ProjectionDeliveryStateSchema>>().toEqualTypeOf<ProjectionDeliveryState>()
    expectTypeOf<v.InferOutput<typeof ProjectionDetailCodeSchema>>().toEqualTypeOf<ProjectionDetailCode>()
    expectTypeOf<v.InferOutput<typeof AdapterProjectionStatusSchema>>().toEqualTypeOf<AdapterProjectionStatus>()
    expectTypeOf<v.InferOutput<typeof ConnectionSettingsSchema>>().toEqualTypeOf<ConnectionSettings>()
    expectTypeOf<v.InferOutput<typeof UpdateConnectionSettingsCommandSchema>>().toEqualTypeOf<UpdateConnectionSettingsCommand>()
    expectTypeOf<v.InferOutput<typeof ReportProjectionStatusCommandSchema>>().toEqualTypeOf<ReportProjectionStatusCommand>()
    expectTypeOf<v.InferOutput<typeof ContentFreePolicyStageSchema>>().toEqualTypeOf<ContentFreePolicyStage>()
    expectTypeOf<v.InferOutput<typeof ContentFreePolicyOutcomeSchema>>().toEqualTypeOf<ContentFreePolicyOutcome>()
    expectTypeOf<v.InferOutput<typeof ContentFreePolicyReasonCodeSchema>>().toEqualTypeOf<ContentFreePolicyReasonCode>()
    expectTypeOf<v.InferOutput<typeof ContentFreePolicyDecisionSchema>>().toEqualTypeOf<ContentFreePolicyDecision>()
  })
})

describe('T2C2A strict connection settings and projection status oracles', () => {
  it('accepts the frozen fixtures', () => {
    expect(v.parse(AdapterProjectionStatusSchema, adapterProjectionStatusFixture)).toEqual(adapterProjectionStatusFixture)
    expect(v.parse(ConnectionSettingsSchema, connectionSettingsFixture)).toEqual(connectionSettingsFixture)
    expect(v.parse(UpdateConnectionSettingsCommandSchema, updateConnectionSettingsCommandFixture)).toEqual(updateConnectionSettingsCommandFixture)
    expect(v.parse(ReportProjectionStatusCommandSchema, reportProjectionStatusCommandFixture)).toEqual(reportProjectionStatusCommandFixture)
  })

  it('rejects open enums and unknown host-native or content fields', () => {
    for (const [schema, value] of [
      [AdapterConnectionStateSchema, 'online'],
      [ProjectionDeliveryStateSchema, 'cleared'],
      [ProjectionDetailCodeSchema, 'socket-acknowledged'],
    ] as const) expect(v.safeParse(schema, value).success).toBe(false)

    for (const [schema, fixture] of [
      [AdapterProjectionStatusSchema, adapterProjectionStatusFixture],
      [ConnectionSettingsSchema, connectionSettingsFixture],
      [UpdateConnectionSettingsCommandSchema, updateConnectionSettingsCommandFixture],
      [ReportProjectionStatusCommandSchema, reportProjectionStatusCommandFixture],
    ] as const) {
      expect(v.safeParse(schema, { ...fixture, composedMessage: 'private' }).success).toBe(false)
    }
  })

  it('requires non-empty identifiers, ISO timestamps, and safe non-negative revision fences', () => {
    for (const input of [
      { ...connectionSettingsFixture, hostId: '' },
      { ...connectionSettingsFixture, revision: -1 },
      { ...connectionSettingsFixture, revision: 1.5 },
      { ...connectionSettingsFixture, revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...connectionSettingsFixture, updatedAt: 'not-a-time' },
    ]) expect(v.safeParse(ConnectionSettingsSchema, input).success).toBe(false)

    for (const input of [
      { ...updateConnectionSettingsCommandFixture, actionId: '' },
      { ...updateConnectionSettingsCommandFixture, expectedSettingsRevision: -1 },
      { ...updateConnectionSettingsCommandFixture, expectedSettingsRevision: 1.5 },
      { ...updateConnectionSettingsCommandFixture, expectedSettingsRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...updateConnectionSettingsCommandFixture, occurredAt: 'not-a-time' },
    ]) expect(v.safeParse(UpdateConnectionSettingsCommandSchema, input).success).toBe(false)
  })

  it('requires a non-empty strict settings patch while keeping the three policies independent', () => {
    expect(v.safeParse(UpdateConnectionSettingsCommandSchema, {
      ...updateConnectionSettingsCommandFixture,
      patch: {},
    }).success).toBe(false)
    expect(v.safeParse(UpdateConnectionSettingsCommandSchema, {
      ...updateConnectionSettingsCommandFixture,
      patch: { applyEnabled: true, collectionEnabled: true },
    }).success).toBe(false)
    expect(v.parse(UpdateConnectionSettingsCommandSchema, {
      ...updateConnectionSettingsCommandFixture,
      patch: { projectionPolicy: projectionPolicyFixture },
    }).patch).toEqual({ projectionPolicy: projectionPolicyFixture })
  })

  it('never treats local writes or blank tombstones as verified delivery', () => {
    const hash = adapterProjectionStatusFixture.lastGuidanceHash
    for (const input of [
      { ...adapterProjectionStatusFixture, state: 'locally-written', lastGuidanceHash: undefined },
      { ...adapterProjectionStatusFixture, state: 'verified-applied', lastGuidanceHash: undefined },
      { ...adapterProjectionStatusFixture, state: 'tombstone-locally-written', lastGuidanceHash: hash },
      { ...adapterProjectionStatusFixture, state: 'verified-guidance-absent', lastGuidanceHash: hash },
    ]) expect(v.safeParse(AdapterProjectionStatusSchema, input).success).toBe(false)
  })

  it('requires detail codes to describe the reported delivery state', () => {
    const cases = [
      ['locally-written', 'guidance-local-write-completed'],
      ['verified-applied', 'guidance-snapshot-verified'],
      ['tombstone-locally-written', 'tombstone-local-write-completed'],
      ['verified-guidance-absent', 'guidance-absence-snapshot-verified'],
      ['verified-guidance-absent', 'guidance-absence-manually-verified'],
      ['error', 'transport-write-failed'],
      ['error', 'verification-failed'],
      ['error', 'transport-disconnected'],
      ['error', 'runtime-unavailable'],
    ] as const
    for (const [state, detailCode] of cases) {
      const candidate = { ...adapterProjectionStatusFixture, state, detailCode }
      if (state.includes('tombstone') || state === 'verified-guidance-absent') delete (candidate as { lastGuidanceHash?: string }).lastGuidanceHash
      expect(v.safeParse(AdapterProjectionStatusSchema, candidate).success).toBe(true)
    }
    expect(v.safeParse(AdapterProjectionStatusSchema, {
      ...adapterProjectionStatusFixture,
      state: 'locally-written',
      detailCode: 'guidance-snapshot-verified',
    }).success).toBe(false)

    for (const [state, detailCode] of cases) {
      const candidate = { ...reportProjectionStatusCommandFixture, state, detailCode }
      if (state.includes('tombstone') || state === 'verified-guidance-absent') delete (candidate as { lastGuidanceHash?: string }).lastGuidanceHash
      expect(v.safeParse(ReportProjectionStatusCommandSchema, candidate).success).toBe(true)
    }
    expect(v.safeParse(ReportProjectionStatusCommandSchema, {
      ...reportProjectionStatusCommandFixture,
      state: 'verified-applied',
      detailCode: 'guidance-local-write-completed',
    }).success).toBe(false)
  })

  it('requires a lowercase SHA-256 guidance hash whenever guidance is present', () => {
    for (const lastGuidanceHash of ['', 'not-a-hash', 'A'.repeat(64)]) {
      expect(v.safeParse(AdapterProjectionStatusSchema, {
        ...adapterProjectionStatusFixture,
        lastGuidanceHash,
      }).success).toBe(false)
      expect(v.safeParse(ReportProjectionStatusCommandSchema, {
        ...reportProjectionStatusCommandFixture,
        lastGuidanceHash,
      }).success).toBe(false)
    }
  })

  it('rejects retained projection status that belongs elsewhere or leads settings revision', () => {
    for (const projectionStatus of [
      { ...adapterProjectionStatusFixture, hostId: 'other-host' },
      { ...adapterProjectionStatusFixture, identity: { ...preferenceIdentityFixture, userId: 'other-user' } },
      { ...adapterProjectionStatusFixture, settingsRevision: connectionSettingsFixture.revision + 1 },
    ]) expect(v.safeParse(ConnectionSettingsSchema, { ...connectionSettingsFixture, projectionStatus }).success).toBe(false)
  })
})

describe('T2C2A content-free policy decision oracles', () => {
  it('accepts the frozen content-free decision and only closed enums', () => {
    expect(v.parse(ContentFreePolicyDecisionSchema, contentFreePolicyDecisionFixture)).toEqual(contentFreePolicyDecisionFixture)
    expect(v.safeParse(ContentFreePolicyStageSchema, 'retention').success).toBe(false)
    expect(v.safeParse(ContentFreePolicyOutcomeSchema, 'allowed').success).toBe(false)
    expect(v.safeParse(ContentFreePolicyReasonCodeSchema, 'custom-reason').success).toBe(false)
  })

  it('rejects message text, evidence payloads, host events, and arbitrary metadata', () => {
    for (const forbidden of [
      { userText: 'private' },
      { assistantText: 'private' },
      { learningPayload: { userText: 'private' } },
      { evidence: interactionEvidenceFixture },
      { composedMessage: 'private' },
      { contexts: [] },
      { tools: [] },
      { metadata: {} },
    ]) expect(v.safeParse(ContentFreePolicyDecisionSchema, {
      ...contentFreePolicyDecisionFixture,
      ...forbidden,
    }).success).toBe(false)
  })

  it('requires stable identifiers, an ISO timestamp, and a safe non-negative settings revision', () => {
    for (const input of [
      { ...contentFreePolicyDecisionFixture, decisionId: '' },
      { ...contentFreePolicyDecisionFixture, hostId: '' },
      { ...contentFreePolicyDecisionFixture, settingsRevision: -1 },
      { ...contentFreePolicyDecisionFixture, settingsRevision: 1.5 },
      { ...contentFreePolicyDecisionFixture, settingsRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...contentFreePolicyDecisionFixture, occurredAt: 'not-a-time' },
    ]) expect(v.safeParse(ContentFreePolicyDecisionSchema, input).success).toBe(false)
  })

  it('keeps each content-free reason bound to its policy stage and outcome', () => {
    const cases = [
      ['collection', 'denied', 'observe-disabled'],
      ['collection', 'denied', 'collection-disabled'],
      ['learning', 'denied', 'learning-disabled'],
      ['outbound-inference', 'denied', 'outbound-inference-disabled'],
      ['outbound-inference', 'denied', 'outbound-source-not-allowed'],
      ['outbound-inference', 'discarded', 'stale-settings-revision'],
      ['outbound-inference', 'discarded', 'late-result-discarded'],
      ['projection', 'denied', 'projection-disabled'],
      ['projection', 'denied', 'projection-scope-not-allowed'],
      ['projection', 'discarded', 'stale-settings-revision'],
    ] as const

    for (const [stage, outcome, reasonCode] of cases) {
      expect(v.safeParse(ContentFreePolicyDecisionSchema, {
        ...contentFreePolicyDecisionFixture,
        stage,
        outcome,
        reasonCode,
      }).success).toBe(true)
    }
    for (const input of [
      { stage: 'projection', outcome: 'denied', reasonCode: 'learning-disabled' },
      { stage: 'collection', outcome: 'discarded', reasonCode: 'observe-disabled' },
      { stage: 'learning', outcome: 'denied', reasonCode: 'late-result-discarded' },
    ]) expect(v.safeParse(ContentFreePolicyDecisionSchema, {
      ...contentFreePolicyDecisionFixture,
      ...input,
    }).success).toBe(false)
  })
})

describe('T2C2B MCP principal and capability contracts', () => {
  it('freezes the configured principal and closed pending-only operations', () => {
    expectTypeOf<McpOperation>().toEqualTypeOf<
      | 'read-effective-profile'
      | 'explain-preference'
      | 'list-pending-candidates'
      | 'propose-pending-candidate'
    >()
    expectTypeOf<McpCapability>().toEqualTypeOf<{
      allowedDomains: Domain[]
      allowedOperations: McpOperation[]
    }>()
    expectTypeOf<McpPrincipal>().toEqualTypeOf<{
      schemaVersion: 1
      principalId: string
      identity: PreferenceIdentity
      hostId: string
      capability: McpCapability
    }>()
    expectTypeOf<v.InferOutput<typeof McpPrincipalSchema>>().toEqualTypeOf<McpPrincipal>()
  })

  it('accepts the frozen principal but rejects spoofing fields and forbidden operations', () => {
    expect(v.parse(McpPrincipalSchema, mcpPrincipalFixture)).toEqual(mcpPrincipalFixture)
    for (const operation of ['confirm-candidate', 'reject-candidate', 'revoke-preference', 'activate-preference', 'observe-turns']) {
      expect(v.safeParse(McpOperationSchema, operation).success).toBe(false)
    }
    for (const forbidden of [
      { userId: 'override' }, { companionId: 'override' }, { relationshipId: 'override' },
      { allowedHosts: ['other-host'] }, { allowedDomains: ['companion'] },
      { learningPayload: { userText: 'private' } }, { composedMessage: 'private' },
    ]) expect(v.safeParse(McpPrincipalSchema, { ...mcpPrincipalFixture, ...forbidden }).success).toBe(false)
  })

  it('requires non-empty fixed identity/host and non-empty duplicate-free capability lists', () => {
    for (const input of [
      { ...mcpPrincipalFixture, principalId: '' },
      { ...mcpPrincipalFixture, hostId: '' },
      { ...mcpPrincipalFixture, identity: { ...mcpPrincipalFixture.identity, userId: '' } },
      { ...mcpPrincipalFixture, capability: { ...mcpPrincipalFixture.capability, allowedDomains: [] } },
      { ...mcpPrincipalFixture, capability: { ...mcpPrincipalFixture.capability, allowedOperations: [] } },
      { ...mcpPrincipalFixture, capability: { ...mcpPrincipalFixture.capability, allowedDomains: ['work', 'work'] } },
      { ...mcpPrincipalFixture, capability: { ...mcpPrincipalFixture.capability, allowedOperations: ['read-effective-profile', 'read-effective-profile'] } },
    ]) expect(v.safeParse(McpPrincipalSchema, input).success).toBe(false)
  })
})

describe('T2C2B content-free audit contracts', () => {
  it('accepts one record-specific audit event for an ordinary revocation', () => {
    expect(preferenceRevokedAuditEventFixture.entity.preferenceId).toBe(
      revokedPreferenceRecordFixture.id,
    )
    expect(preferenceRevokedAuditEventFixture.revision).toBe(
      revokedPreferenceRecordFixture.revision,
    )
    expect(
      v.parse(AuditEventSchema, preferenceRevokedAuditEventFixture),
    ).toEqual(preferenceRevokedAuditEventFixture)
  })

  it('accepts two record-specific audit events for one supersession action', () => {
    const [previousEvent, replacementEvent] =
      preferenceSupersessionAuditEventsFixture

    expect(previousEvent.actionId).toBe(replacementEvent.actionId)
    expect(previousEvent.entity.preferenceId).not.toBe(
      replacementEvent.entity.preferenceId,
    )
    expect(previousEvent.revision).toBe(2)
    expect(replacementEvent.revision).toBe(1)
    for (const event of preferenceSupersessionAuditEventsFixture) {
      expect(v.safeParse(AuditEventSchema, event).success).toBe(true)
    }
  })

  it('freezes closed actors, kinds, reason codes, entity references, event, and query', () => {
    expectTypeOf<v.InferOutput<typeof AuditActorSchema>>().toEqualTypeOf<AuditActor>()
    expectTypeOf<v.InferOutput<typeof AuditEventKindSchema>>().toEqualTypeOf<AuditEventKind>()
    expectTypeOf<v.InferOutput<typeof AuditReasonCodeSchema>>().toEqualTypeOf<AuditReasonCode>()
    expectTypeOf<v.InferOutput<typeof AuditEntityReferenceSchema>>().toEqualTypeOf<AuditEntityReference>()
    expectTypeOf<v.InferOutput<typeof AuditEventSchema>>().toEqualTypeOf<AuditEvent>()
    expectTypeOf<v.InferOutput<typeof AuditQuerySchema>>().toEqualTypeOf<AuditQuery>()
  })

  it('accepts frozen content-free event/query fixtures and rejects open enums', () => {
    expect(v.parse(AuditEventSchema, auditEventFixture)).toEqual(auditEventFixture)
    expect(v.parse(AuditEventSchema, observerCandidateProposedAuditEventFixture)).toEqual(observerCandidateProposedAuditEventFixture)
    expect(v.parse(AuditQuerySchema, auditQueryFixture)).toEqual(auditQueryFixture)
    for (const [schema, value] of [[AuditActorSchema, 'admin'], [AuditEventKindSchema, 'message-recorded'], [AuditReasonCodeSchema, 'custom']] as const) {
      expect(v.safeParse(schema, value).success).toBe(false)
    }
  })

  it('rejects raw content, secrets, transport bodies, tokens, tools, and unknown fields', () => {
    const forbidden = ['conversation', 'evidencePayload', 'learningPayload', 'systemPrompt', 'toolTrace', 'token', 'requestBody', 'responseBody']
    for (const field of forbidden) {
      expect(v.safeParse(AuditEventSchema, { ...auditEventFixture, [field]: 'private' }).success).toBe(false)
      expect(v.safeParse(AuditQuerySchema, { ...auditQueryFixture, [field]: 'private' }).success).toBe(false)
    }
  })

  it('requires strict identifiers, timestamps, revisions, action IDs, query bounds, and matching entities', () => {
    for (const input of [
      { ...auditEventFixture, id: '' },
      { ...auditEventFixture, occurredAt: 'not-a-time' },
      { ...auditEventFixture, actionId: '' },
      { ...auditEventFixture, revision: -1 },
      { ...auditEventFixture, revision: 1.5 },
      { ...auditEventFixture, kind: 'candidate-proposed', entity: { kind: 'preference', preferenceId: 'preference-1' } },
    ]) expect(v.safeParse(AuditEventSchema, input).success).toBe(false)
    for (const input of [
      { ...auditQueryFixture, limit: 0 },
      { ...auditQueryFixture, limit: 1001 },
      { ...auditQueryFixture, limit: 1.5 },
      { ...auditQueryFixture, occurredAtOrAfter: 'not-a-time' },
      { ...auditQueryFixture, occurredBefore: '2026-08-20T00:00:00Z' },
      { ...auditQueryFixture, actors: [] },
      { ...auditQueryFixture, kinds: [] },
    ]) expect(v.safeParse(AuditQuerySchema, input).success).toBe(false)
  })

  it('accepts the complete frozen kind/entity/reason matrix', () => {
    const accepted = [
      ['adapter', 'evidence-ingested', 'evidence', 'accepted'],
      ['adapter', 'evidence-ingested', 'evidence', 'duplicate'],
      ['observer', 'evidence-processing-completed', 'evidence', 'accepted'],
      ['observer', 'evidence-processing-completed', 'evidence', 'stale-settings-revision'],
      ['observer', 'evidence-processing-completed', 'evidence', 'late-result-discarded'],
      ['user', 'evidence-deleted', 'evidence', 'user-requested'],
      ['observer', 'processing-failed', 'evidence', 'invalid-observer-output'],
      ['runtime', 'processing-failed', 'evidence', 'retry-exhausted'],
      ['observer', 'candidate-proposed', 'candidate', 'accepted'],
      ['mcp-agent', 'candidate-proposed', 'candidate', 'accepted'],
      ['user', 'candidate-proposed', 'candidate', 'duplicate'],
      ['user', 'candidate-confirmed', 'candidate', 'accepted'],
      ['user', 'candidate-rejected', 'candidate', 'not-a-preference'],
      ['user', 'candidate-rejected', 'candidate', 'user-requested'],
      ['user', 'candidate-deleted', 'candidate', 'user-requested'],
      ['user', 'candidate-suppressed', 'candidate', 'do-not-suggest-again'],
      ['user', 'preference-created', 'preference', 'accepted'],
      ['user', 'preference-revised', 'preference', 'superseded'],
      ['user', 'preference-revoked', 'preference', 'user-requested'],
      ['user', 'connection-settings-updated', 'connection', 'accepted'],
      ['adapter', 'projection-status-reported', 'connection', 'accepted'],
      ['adapter', 'projection-status-reported', 'connection', 'transport-write-failed'],
      ['adapter', 'projection-status-reported', 'connection', 'verification-failed'],
      ['adapter', 'projection-status-reported', 'connection', 'transport-disconnected'],
      ['adapter', 'projection-status-reported', 'connection', 'runtime-unavailable'],
      ['adapter', 'policy-decision-recorded', 'policy-decision', 'observe-disabled'],
      ['runtime', 'policy-decision-recorded', 'policy-decision', 'collection-disabled'],
      ['runtime', 'policy-decision-recorded', 'policy-decision', 'learning-disabled'],
      ['runtime', 'policy-decision-recorded', 'policy-decision', 'outbound-inference-disabled'],
      ['runtime', 'policy-decision-recorded', 'policy-decision', 'outbound-source-not-allowed'],
      ['adapter', 'policy-decision-recorded', 'policy-decision', 'projection-disabled'],
      ['adapter', 'policy-decision-recorded', 'policy-decision', 'projection-scope-not-allowed'],
      ['runtime', 'policy-decision-recorded', 'policy-decision', 'stale-settings-revision'],
      ['runtime', 'policy-decision-recorded', 'policy-decision', 'late-result-discarded'],
    ] as const

    const entities = {
      evidence: { kind: 'evidence', evidenceId: 'evidence-1' },
      candidate: { kind: 'candidate', candidateId: 'candidate-1' },
      preference: { kind: 'preference', preferenceId: 'preference-1' },
      connection: { kind: 'connection', hostId: 'reference-host' },
      'policy-decision': { kind: 'policy-decision', decisionId: 'decision-1' },
    } as const

    for (const [actor, kind, entityKind, reasonCode] of accepted) {
      const event: Record<string, unknown> = {
        ...auditEventFixture,
        actor,
        kind,
        entity: entities[entityKind],
        reasonCode,
      }
      delete event.actionId
      delete event.revision
      delete event.settingsRevision
      if (kind.startsWith('candidate-') || kind.startsWith('preference-')) event.revision = 1
      if (kind === 'evidence-processing-completed' || kind === 'processing-failed' || kind === 'connection-settings-updated' || kind === 'projection-status-reported' || kind === 'policy-decision-recorded') event.settingsRevision = 1
      if (kind === 'evidence-deleted' || (kind.startsWith('candidate-') && actor !== 'observer') || kind.startsWith('preference-') || kind === 'connection-settings-updated' || kind === 'projection-status-reported') event.actionId = 'action-1'
      expect(v.safeParse(AuditEventSchema, event).success).toBe(true)
    }
  })

  it('rejects wrong entity and reason combinations for every event group', () => {
    const rejected = [
      ['evidence-ingested', { kind: 'candidate', candidateId: 'candidate-1' }, 'accepted'],
      ['evidence-processing-completed', { kind: 'preference', preferenceId: 'preference-1' }, 'accepted'],
      ['evidence-deleted', { kind: 'connection', hostId: 'host-1' }, 'user-requested'],
      ['processing-failed', { kind: 'policy-decision', decisionId: 'decision-1' }, 'retry-exhausted'],
      ['candidate-proposed', { kind: 'evidence', evidenceId: 'evidence-1' }, 'accepted'],
      ['candidate-confirmed', { kind: 'candidate', candidateId: 'candidate-1' }, 'collection-disabled'],
      ['candidate-rejected', { kind: 'candidate', candidateId: 'candidate-1' }, 'accepted'],
      ['candidate-deleted', { kind: 'candidate', candidateId: 'candidate-1' }, 'duplicate'],
      ['candidate-suppressed', { kind: 'candidate', candidateId: 'candidate-1' }, 'user-requested'],
      ['preference-created', { kind: 'candidate', candidateId: 'candidate-1' }, 'accepted'],
      ['preference-revised', { kind: 'preference', preferenceId: 'preference-1' }, 'accepted'],
      ['preference-revoked', { kind: 'preference', preferenceId: 'preference-1' }, 'superseded'],
      ['connection-settings-updated', { kind: 'preference', preferenceId: 'preference-1' }, 'accepted'],
      ['projection-status-reported', { kind: 'connection', hostId: 'host-1' }, 'collection-disabled'],
      ['policy-decision-recorded', { kind: 'policy-decision', decisionId: 'decision-1' }, 'accepted'],
    ] as const
    for (const [kind, entity, reasonCode] of rejected) {
      expect(v.safeParse(AuditEventSchema, {
        ...auditEventFixture,
        kind,
        entity,
        reasonCode,
      }).success).toBe(false)
    }
  })

  it('rejects a wrong causal actor for every event kind', () => {
    const base = {
      schemaVersion: 1,
      id: 'audit-actor-probe',
      identity: preferenceIdentityFixture,
      occurredAt: '2026-08-21T03:25:00Z',
    } as const
    const wrongActorEvents = [
      { ...base, actor: 'user', kind: 'evidence-ingested', reasonCode: 'accepted', entity: { kind: 'evidence', evidenceId: 'e-1' } },
      { ...base, actor: 'adapter', kind: 'evidence-processing-completed', reasonCode: 'accepted', entity: { kind: 'evidence', evidenceId: 'e-1' }, settingsRevision: 1 },
      { ...base, actor: 'runtime', kind: 'evidence-deleted', reasonCode: 'user-requested', entity: { kind: 'evidence', evidenceId: 'e-1' }, actionId: 'a-1' },
      { ...base, actor: 'adapter', kind: 'processing-failed', reasonCode: 'retry-exhausted', entity: { kind: 'evidence', evidenceId: 'e-1' }, settingsRevision: 1 },
      { ...base, actor: 'adapter', kind: 'candidate-proposed', reasonCode: 'accepted', entity: { kind: 'candidate', candidateId: 'c-1' }, revision: 0 },
      { ...base, actor: 'mcp-agent', kind: 'candidate-confirmed', reasonCode: 'accepted', entity: { kind: 'candidate', candidateId: 'c-1' }, actionId: 'a-1', revision: 1 },
      { ...base, actor: 'observer', kind: 'candidate-rejected', reasonCode: 'not-a-preference', entity: { kind: 'candidate', candidateId: 'c-1' }, actionId: 'a-1', revision: 1 },
      { ...base, actor: 'runtime', kind: 'candidate-deleted', reasonCode: 'user-requested', entity: { kind: 'candidate', candidateId: 'c-1' }, actionId: 'a-1', revision: 1 },
      { ...base, actor: 'adapter', kind: 'candidate-suppressed', reasonCode: 'do-not-suggest-again', entity: { kind: 'candidate', candidateId: 'c-1' }, actionId: 'a-1', revision: 1 },
      { ...base, actor: 'observer', kind: 'preference-created', reasonCode: 'accepted', entity: { kind: 'preference', preferenceId: 'p-1' }, actionId: 'a-1', revision: 1 },
      { ...base, actor: 'runtime', kind: 'preference-revised', reasonCode: 'superseded', entity: { kind: 'preference', preferenceId: 'p-1' }, actionId: 'a-1', revision: 2 },
      { ...base, actor: 'mcp-agent', kind: 'preference-revoked', reasonCode: 'user-requested', entity: { kind: 'preference', preferenceId: 'p-1' }, actionId: 'a-1', revision: 2 },
      { ...base, actor: 'adapter', kind: 'connection-settings-updated', reasonCode: 'accepted', entity: { kind: 'connection', hostId: 'h-1' }, actionId: 'a-1', settingsRevision: 2 },
      { ...base, actor: 'user', kind: 'projection-status-reported', reasonCode: 'accepted', entity: { kind: 'connection', hostId: 'h-1' }, actionId: 'a-1', settingsRevision: 2 },
      { ...base, actor: 'user', kind: 'policy-decision-recorded', reasonCode: 'collection-disabled', entity: { kind: 'policy-decision', decisionId: 'd-1' }, settingsRevision: 2 },
    ]
    for (const input of wrongActorEvents) expect(v.safeParse(AuditEventSchema, input).success).toBe(false)
  })

  it('requires only the action and revision fences appropriate to each event', () => {
    for (const input of [
      { ...auditEventFixture, actionId: undefined },
      { ...auditEventFixture, revision: undefined },
      { ...observerCandidateProposedAuditEventFixture, actionId: 'not-allowed' },
      { ...auditEventFixture, actor: 'mcp-agent', actionId: undefined },
      {
        schemaVersion: 1,
        id: 'audit-ingest-extra-fence',
        identity: preferenceIdentityFixture,
        actor: 'adapter',
        kind: 'evidence-ingested',
        reasonCode: 'accepted',
        entity: { kind: 'evidence', evidenceId: 'evidence-1' },
        occurredAt: '2026-08-21T03:25:00Z',
        actionId: 'not-allowed',
      },
      {
        schemaVersion: 1,
        id: 'audit-processing-1',
        identity: preferenceIdentityFixture,
        actor: 'observer',
        kind: 'evidence-processing-completed',
        reasonCode: 'accepted',
        entity: { kind: 'evidence', evidenceId: 'evidence-1' },
        occurredAt: '2026-08-21T03:25:00Z',
      },
      {
        ...auditEventFixture,
        actor: 'user',
        kind: 'connection-settings-updated',
        entity: { kind: 'connection', hostId: 'reference-host' },
        reasonCode: 'accepted',
        revision: undefined,
        settingsRevision: undefined,
      },
      {
        ...auditEventFixture,
        actor: 'runtime',
        kind: 'policy-decision-recorded',
        entity: { kind: 'policy-decision', decisionId: 'decision-1' },
        reasonCode: 'collection-disabled',
        actionId: undefined,
        revision: undefined,
        settingsRevision: undefined,
      },
    ]) expect(v.safeParse(AuditEventSchema, input).success).toBe(false)
  })
})

describe('T2C2C host-neutral HTTP DTO contracts', () => {
  it('accepts the frozen requests, principal, and strict response envelopes', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    expect(v.parse(s.HttpPrincipalSchema, f.httpPrincipalFixture)).toEqual(
      f.httpPrincipalFixture,
    )
    expect(
      v.parse(
        s.IngestEvidenceHttpRequestSchema,
        f.ingestEvidenceHttpRequestFixture,
      ),
    ).toEqual(f.ingestEvidenceHttpRequestFixture)
    expect(
      v.parse(
        s.EffectiveProfileHttpRequestSchema,
        f.effectiveProfileHttpRequestFixture,
      ),
    ).toEqual(f.effectiveProfileHttpRequestFixture)
    expect(
      v.parse(
        s.GovernanceMutationHttpRequestSchema,
        f.governanceMutationHttpRequestFixture,
      ),
    ).toEqual(f.governanceMutationHttpRequestFixture)
    expect(
      v.parse(
        s.GovernanceMutationHttpRequestSchema,
        f.deleteEvidenceHttpRequestFixture,
      ),
    ).toEqual(f.deleteEvidenceHttpRequestFixture)
    expect(v.parse(
      s.RecordPolicyDecisionHttpRequestSchema,
      f.recordPolicyDecisionHttpRequestFixture,
    )).toEqual(f.recordPolicyDecisionHttpRequestFixture)
    expect(v.parse(
      s.ExportDataHttpRequestSchema,
      f.exportDataHttpRequestFixture,
    )).toEqual(f.exportDataHttpRequestFixture)
    expect(v.parse(
      s.PreferenceListHttpRequestSchema,
      f.preferenceListHttpRequestFixture,
    )).toEqual(f.preferenceListHttpRequestFixture)
    expect(v.parse(
      s.ConnectionListHttpRequestSchema,
      f.connectionListHttpRequestFixture,
    )).toEqual(f.connectionListHttpRequestFixture)
    expect(v.parse(
      s.ConnectionListHttpResultSchema,
      f.connectionListHttpResultFixture,
    )).toEqual(f.connectionListHttpResultFixture)
    expect(v.parse(
      s.PreferenceDataExportHttpResultSchema,
      f.preferenceDataExportHttpResultFixture,
    )).toEqual(f.preferenceDataExportHttpResultFixture)
    expect(v.parse(
      s.ResetHttpRequestSchema,
      f.resetHttpRequestFixture,
    )).toEqual(f.resetHttpRequestFixture)
    expect(v.parse(
      s.ResetHttpResultSchema,
      f.resetHttpResultFixture,
    )).toEqual(f.resetHttpResultFixture)
    expect(
      v.parse(
        s.HttpResponseSchema(s.GovernanceMutationHttpResultSchema),
        f.mutationSuccessHttpResponseFixture,
      ),
    ).toEqual(f.mutationSuccessHttpResponseFixture)
    expect(
      v.parse(
        s.HttpResponseSchema(s.GovernanceMutationHttpResultSchema),
        f.revisionErrorHttpResponseFixture,
      ),
    ).toEqual(f.revisionErrorHttpResponseFixture)
    expect(v.parse(
      s.IngestEvidenceHttpResultSchema,
      f.acceptedIngestEvidenceHttpResultFixture,
    )).toEqual(f.acceptedIngestEvidenceHttpResultFixture)
    expect(v.parse(
      s.IngestEvidenceHttpResultSchema,
      f.discardedIngestEvidenceHttpResultFixture,
    )).toEqual(f.discardedIngestEvidenceHttpResultFixture)

    expectTypeOf<v.InferOutput<typeof s.HttpPrincipalSchema>>().toEqualTypeOf<
      import('./schemas.js').HttpPrincipal
    >()
    expectTypeOf<
      v.InferOutput<typeof s.GovernanceMutationHttpRequestSchema>
    >().toEqualTypeOf<import('./schemas.js').GovernanceMutationHttpRequest>()
    expectTypeOf<
      v.InferOutput<ReturnType<typeof s.HttpResponseSchema<import('./schemas.js').GovernanceMutationHttpResult>>>
    >().toEqualTypeOf<import('./schemas.js').HttpResponse<import('./schemas.js').GovernanceMutationHttpResult>>()
    expectTypeOf<
      v.InferOutput<typeof s.RecordPolicyDecisionHttpRequestSchema>
    >().toEqualTypeOf<import('./schemas.js').RecordPolicyDecisionHttpRequest>()
    expectTypeOf<
      v.InferOutput<typeof s.PreferenceDataExportHttpResultSchema>
    >().toEqualTypeOf<import('./schemas.js').PreferenceDataExportHttpResult>()
    expectTypeOf<
      v.InferOutput<typeof s.ConnectionListHttpRequestSchema>
    >().toEqualTypeOf<import('./schemas.js').ConnectionListHttpRequest>()
    expectTypeOf<
      v.InferOutput<typeof s.ConnectionListHttpResultSchema>
    >().toEqualTypeOf<import('./schemas.js').ConnectionListHttpResult>()
    expectTypeOf<
      v.InferOutput<typeof s.ResetHttpRequestSchema>
    >().toEqualTypeOf<import('./schemas.js').ResetHttpRequest>()
    expectTypeOf<
      v.InferOutput<typeof s.ResetHttpResultSchema>
    >().toEqualTypeOf<import('./schemas.js').ResetHttpResult>()

    expect(
      v.safeParse(s.HttpResponseSchema(s.GovernanceMutationHttpResultSchema), {
        ...f.mutationSuccessHttpResponseFixture,
        data: { ...f.mutationSuccessHttpResponseFixture.data, actionId: '' },
      }).success,
    ).toBe(false)
  })

  it('never accepts an authenticated principal or bearer token from a request body', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    for (const injected of [
      { principal: f.httpPrincipalFixture },
      { bearerToken: 'secret-token' },
    ]) {
      expect(
        v.safeParse(s.GovernanceMutationHttpRequestSchema, {
          ...f.governanceMutationHttpRequestFixture,
          ...injected,
        }).success,
      ).toBe(false)
    }
  })

  it('keeps destructive reset exact, strict, and content-free', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    for (const request of [
      { confirmation: '' },
      { confirmation: s.RESET_CONFIRMATION_PHRASE.toLowerCase() },
      { confirmation: `${s.RESET_CONFIRMATION_PHRASE} ` },
      { ...f.resetHttpRequestFixture, bearerToken: 'secret-token' },
      { ...f.resetHttpRequestFixture, reason: 'private' },
    ]) {
      expect(v.safeParse(s.ResetHttpRequestSchema, request).success).toBe(false)
    }
    for (const result of [
      {},
      { status: 'completed' },
      { ...f.resetHttpResultFixture, deletedRecords: 42 },
      { ...f.resetHttpResultFixture, databasePath: '/private/runtime.sqlite' },
    ]) {
      expect(v.safeParse(s.ResetHttpResultSchema, result).success).toBe(false)
    }
  })

  it('retains action idempotency and optimistic revision fences in mutation payloads', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    for (const command of [
      f.proposeCandidateCommandFixture,
      f.confirmCandidateCommandFixture,
      f.rejectCandidateCommandFixture,
      f.deleteCandidateCommandFixture,
      f.suppressCandidateCommandFixture,
      f.createExplicitPreferenceCommandFixture,
      f.revisePreferenceCommandFixture,
      f.revokePreferenceCommandFixture,
      f.updateConnectionSettingsCommandFixture,
      f.reportProjectionStatusCommandFixture,
      f.deleteEvidenceCommandFixture,
    ]) {
      expect(v.safeParse(s.GovernanceMutationHttpRequestSchema, { command }).success).toBe(true)
      const { actionId: _actionId, ...withoutActionId } = command
      expect(v.safeParse(s.GovernanceMutationHttpRequestSchema, {
        command: withoutActionId,
      }).success).toBe(false)
    }

    for (const patch of [
      { actionId: '' },
      { actionId: undefined },
      { expectedCandidateRevision: -1 },
      { expectedCandidateRevision: undefined },
    ]) {
      expect(
        v.safeParse(s.GovernanceMutationHttpRequestSchema, {
          command: { ...f.confirmCandidateCommandFixture, ...patch },
        }).success,
      ).toBe(false)
    }

    for (const input of [
      { decision: f.contentFreePolicyDecisionFixture },
      { actionId: '', decision: f.contentFreePolicyDecisionFixture },
      {
        ...f.recordPolicyDecisionHttpRequestFixture,
        bearerToken: 'secret-token',
      },
    ]) {
      expect(v.safeParse(s.RecordPolicyDecisionHttpRequestSchema, input).success).toBe(false)
    }
  })

  it('keeps transport errors closed, content-free, and revision-safe', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    for (const input of [
      { ...f.revisionErrorHttpResponseFixture, token: 'secret-token' },
      {
        ...f.revisionErrorHttpResponseFixture,
        error: {
          ...f.revisionErrorHttpResponseFixture.error,
          learningPayload: { userText: 'private' },
        },
      },
      {
        ...f.revisionErrorHttpResponseFixture,
        error: {
          ...f.revisionErrorHttpResponseFixture.error,
          code: 'database-exploded',
        },
      },
      {
        ...f.revisionErrorHttpResponseFixture,
        error: {
          ...f.revisionErrorHttpResponseFixture.error,
          currentRevision: -1,
        },
      },
    ]) {
      expect(
        v.safeParse(s.HttpResponseSchema(s.GovernanceMutationHttpResultSchema), input)
          .success,
      ).toBe(false)
    }

    for (const field of [
      'evidence',
      'composedMessage',
      'contexts',
      'prompts',
      'tools',
      'metadata',
      'stack',
      'cause',
      'database',
    ]) {
      expect(
        v.safeParse(s.HttpErrorDetailSchema, {
          ...f.revisionErrorHttpResponseFixture.error,
          [field]: 'private',
        }).success,
      ).toBe(false)
    }

    expect(
      v.safeParse(s.HttpResponseSchema(s.GovernanceMutationHttpResultSchema), {
        ...f.mutationSuccessHttpResponseFixture,
        error: f.revisionErrorHttpResponseFixture.error,
      }).success,
    ).toBe(false)
  })

  it('keeps list taxonomies, result revisions, and audit results strict', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    expect(
      v.safeParse(s.CandidateListHttpRequestSchema, {
        identity: f.preferenceIdentityFixture,
        statuses: ['active'],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(s.PreferenceListHttpRequestSchema, {
        identity: f.identityContextFixture,
        statuses: ['pending_confirmation'],
      }).success,
    ).toBe(false)
    for (const statuses of [[], ['confirmed', 'confirmed']]) {
      expect(
        v.safeParse(s.CandidateListHttpRequestSchema, {
          identity: f.preferenceIdentityFixture,
          statuses,
        }).success,
      ).toBe(false)
    }
    for (const statuses of [[], ['active'], ['active', 'active']]) {
      expect(
        v.safeParse(s.PreferenceListHttpRequestSchema, {
          identity: f.identityContextFixture,
          statuses,
        }).success,
      ).toBe(false)
    }
    for (const expectedSettingsRevision of [-1, 0, 1]) {
      expect(
        v.safeParse(s.IngestEvidenceHttpRequestSchema, {
          ...f.ingestEvidenceHttpRequestFixture,
          expectedSettingsRevision,
        }).success,
      ).toBe(false)
    }
    expect(
      v.safeParse(s.EffectiveProfileHttpResultSchema, {
        guidance: f.behaviorGuidanceFixture,
        profileRevision: 1,
        settingsRevision: 1,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(s.AuditHttpResultSchema, {
        events: [f.auditEventFixture],
        composedMessage: 'private',
      }).success,
    ).toBe(false)
    expect(v.safeParse(s.PreferenceDataExportHttpResultSchema, {
      ...f.preferenceDataExportHttpResultFixture,
      learningPayload: { userText: 'private' },
    }).success).toBe(false)
    for (const input of [
      {},
      { identity: f.preferenceIdentityFixture, hostId: 'airi' },
      { identity: { ...f.preferenceIdentityFixture, sessionId: 'session-private' } },
      { identity: f.preferenceIdentityFixture, bearerToken: 'secret-token' },
    ]) {
      expect(v.safeParse(s.ConnectionListHttpRequestSchema, input).success).toBe(false)
    }
    for (const connections of [
      [f.connectionSettingsFixture, f.airiConnectionSettingsFixture],
      [f.airiConnectionSettingsFixture, f.airiConnectionSettingsFixture],
    ]) {
      expect(v.safeParse(s.ConnectionListHttpResultSchema, { connections }).success).toBe(false)
    }
  })

  it('freezes canonical ingest, replay result, and lifecycle-unavailable semantics', async () => {
    const s = await import('./schemas.js')
    const f = await import('./fixtures.js')

    for (const result of [
      f.acceptedIngestEvidenceHttpResultFixture,
      { ...f.acceptedIngestEvidenceHttpResultFixture, disposition: 'duplicate' },
      f.discardedIngestEvidenceHttpResultFixture,
    ]) {
      expect(v.safeParse(s.IngestEvidenceHttpResultSchema, result).success).toBe(true)
    }
    for (const result of [
      { ...f.discardedIngestEvidenceHttpResultFixture, reasonCode: 'learning-disabled' },
      { ...f.discardedIngestEvidenceHttpResultFixture, learningPayload: { userText: 'private' } },
      { ...f.acceptedIngestEvidenceHttpResultFixture, reasonCode: 'observe-disabled' },
    ]) {
      expect(v.safeParse(s.IngestEvidenceHttpResultSchema, result).success).toBe(false)
    }

    const actionResults = [
      { kind: 'candidate', actionId: f.proposeCandidateCommandFixture.actionId, candidate: f.preferenceCandidateFixture },
      { kind: 'preference', actionId: f.confirmCandidateCommandFixture.actionId, preference: f.activePreferenceRecordFixture },
      { kind: 'connection-settings', actionId: f.updateConnectionSettingsCommandFixture.actionId, settings: f.connectionSettingsFixture },
      { kind: 'projection-status', actionId: f.reportProjectionStatusCommandFixture.actionId, projectionStatus: f.adapterProjectionStatusFixture },
      { kind: 'evidence-deletion', actionId: f.deleteEvidenceCommandFixture.actionId, result: f.deleteEvidenceResultFixture },
      { kind: 'completed', actionId: f.rejectCandidateCommandFixture.actionId },
    ]
    for (const result of actionResults) {
      expect(v.safeParse(s.GovernanceMutationHttpResultSchema, result).success).toBe(true)
      expect(v.safeParse(s.GovernanceMutationHttpResultSchema, { ...result, actionId: '' }).success).toBe(false)
    }
    expect(v.safeParse(s.GovernanceMutationHttpResultSchema, f.mutationReceiptFixture).success).toBe(false)

    for (const [code, retryable] of [
      ['runtime-maintenance', true],
      ['runtime-closed', false],
    ] as const) {
      expect(v.safeParse(s.HttpErrorResponseSchema, {
        ok: false,
        requestId: `request-${code}`,
        error: { code, message: 'Runtime unavailable.', retryable },
      }).success).toBe(true)
    }
    expect(v.safeParse(s.HttpErrorCodeSchema, 'reset-in-progress').success).toBe(false)
  })
})
