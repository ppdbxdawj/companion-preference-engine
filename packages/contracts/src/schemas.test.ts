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
