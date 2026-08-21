import * as v from 'valibot'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CollectionPolicySchema,
  ContentCategorySchema,
  DomainSchema,
  HostSourceKindSchema,
  IdentityContextSchema,
  OutboundInferenceModeSchema,
  OutboundInferencePolicySchema,
  ProjectionPolicySchema,
  TypedHostSourceSchema,
  type CollectionPolicy,
  type ContentCategory,
  type Domain,
  type HostSourceKind,
  type IdentityContext,
  type OutboundInferenceMode,
  type OutboundInferencePolicy,
  type ProjectionPolicy,
  type TypedHostSource,
} from './schemas.js'
import {
  chatTurnSourceFixture,
  collectionPolicyFixture,
  disabledOutboundInferencePolicyFixture,
  identityContextFixture,
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
