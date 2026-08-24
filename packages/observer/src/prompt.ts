import { createHash } from 'node:crypto'
import type {
  PendingCandidateProposal,
  Preference,
  PreferenceRiskCategory,
  PreferenceScope,
} from '@companion-preference/contracts'

import type {
  JsonObject,
  JsonValue,
  ObserverPromptEvidence,
  ObserverPromptInput,
  OpenAICompatibleObserverCodec,
} from './openai-compatible.js'
import type { ObserverProposal } from './observer.js'

const SYSTEM_PROMPT = `You are a preference-observation component. Propose only durable interaction preferences directly supported by the supplied approved evidence window. Never invent evidence, identity, scope identifiers, or permissions. Never confirm or activate a preference. Abstain whenever evidence is insufficient, ambiguous, contradictory, temporary, or merely task-specific.

Allowed preference key/value pairs:
- interaction.response_detail: concise | balanced | detailed
- interaction.directness: gentle | balanced | direct
- interaction.initiative: ask_first | low_risk_auto | proactive
- interaction.interruption_policy: never_interrupt | important_only | allowed
- work.approval_style: always_ask | risk_based | review_after
- work.verification_depth: minimal | targeted | exhaustive
- companion.support_style: listen_first | acknowledge_then_act | direct_action

Return only JSON matching the supplied strict schema. Use decision "abstain" with an empty proposals array when no safe proposal is justified. Every proposal must remain pending_confirmation and cite only evidence IDs from the supplied window.`

const preferenceValues = {
  'interaction.response_detail': ['concise', 'balanced', 'detailed'],
  'interaction.directness': ['gentle', 'balanced', 'direct'],
  'interaction.initiative': ['ask_first', 'low_risk_auto', 'proactive'],
  'interaction.interruption_policy': [
    'never_interrupt',
    'important_only',
    'allowed',
  ],
  'work.approval_style': ['always_ask', 'risk_based', 'review_after'],
  'work.verification_depth': ['minimal', 'targeted', 'exhaustive'],
  'companion.support_style': [
    'listen_first',
    'acknowledge_then_act',
    'direct_action',
  ],
} as const

type PreferenceKey = keyof typeof preferenceValues

const nonemptyStringSchema = { type: 'string', minLength: 1 } as const
const uniqueStringArraySchema = {
  type: 'array',
  items: nonemptyStringSchema,
  uniqueItems: true,
} as const

const strictObjectSchema = (
  properties: Record<string, JsonValue>,
  required: readonly string[],
): JsonObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: [...required],
})

const preferenceSchema = {
  oneOf: Object.entries(preferenceValues).map(([key, values]) =>
    strictObjectSchema(
      {
        key: { type: 'string', const: key },
        value: { type: 'string', enum: [...values] },
      },
      ['key', 'value'],
    ),
  ),
} satisfies JsonObject

const scopeSchema = {
  oneOf: [
    strictObjectSchema(
      { kind: { const: 'task' }, taskId: nonemptyStringSchema },
      ['kind', 'taskId'],
    ),
    strictObjectSchema(
      { kind: { const: 'workspace' }, workspaceId: nonemptyStringSchema },
      ['kind', 'workspaceId'],
    ),
    strictObjectSchema(
      { kind: { const: 'host' }, hostId: nonemptyStringSchema },
      ['kind', 'hostId'],
    ),
    strictObjectSchema(
      {
        kind: { const: 'domain' },
        domain: { type: 'string', enum: ['work', 'companion'] },
      },
      ['kind', 'domain'],
    ),
    strictObjectSchema({ kind: { const: 'global' } }, ['kind']),
  ],
} satisfies JsonObject

const candidateSchema = strictObjectSchema(
  {
    preference: preferenceSchema,
    scope: scopeSchema,
    evidenceIds: { ...uniqueStringArraySchema, minItems: 1 },
    counterEvidenceIds: uniqueStringArraySchema,
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    riskCategory: { type: 'string', enum: ['standard', 'sensitive'] },
    status: { type: 'string', const: 'pending_confirmation' },
  },
  [
    'preference',
    'scope',
    'evidenceIds',
    'counterEvidenceIds',
    'confidence',
    'riskCategory',
    'status',
  ],
)

const RESPONSE_SCHEMA = strictObjectSchema(
  {
    decision: { type: 'string', enum: ['abstain', 'propose'] },
    proposals: { type: 'array', items: candidateSchema },
  },
  ['decision', 'proposals'],
)

function minimizedEvidence(item: ObserverPromptEvidence): JsonObject {
  const learningPayload: JsonObject = { userText: item.learningPayload.userText }
  if (item.learningPayload.assistantText !== undefined) {
    learningPayload.assistantText = item.learningPayload.assistantText
  }
  return {
    schemaVersion: 1,
    id: item.id,
    identity: {
      hostId: item.identity.hostId,
      domain: item.identity.domain,
    },
    occurredAt: item.occurredAt,
    source: {
      kind: item.source.kind,
      contentCategory: item.source.contentCategory,
    },
    learningPayload,
    projection: {
      allowedHosts: [...item.projection.allowedHosts],
      allowedDomains: [...item.projection.allowedDomains],
    },
  }
}

export function buildOpenAICompatibleRequest(
  input: ObserverPromptInput,
): JsonObject {
  return {
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          evidenceWindow: input.evidenceWindow.map(minimizedEvidence),
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'companion_preference_observer_result',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key)
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function uniqueStrings(value: unknown, min = 0): value is string[] {
  if (!Array.isArray(value) || value.length < min) return false
  return value.every(nonemptyString) && new Set(value).size === value.length
}

function preference(value: unknown): value is Preference {
  if (!isRecord(value) || !hasExactKeys(value, ['key', 'value'])) return false
  const key = value.key
  const allowed = typeof key === 'string' && key in preferenceValues
    ? preferenceValues[key as PreferenceKey]
    : undefined
  return allowed !== undefined && typeof value.value === 'string' && allowed.includes(value.value as never)
}

function scope(value: unknown): value is PreferenceScope {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'global') return hasExactKeys(value, ['kind'])
  if (value.kind === 'task') return false
  if (value.kind === 'workspace') return false
  if (value.kind === 'host') return hasExactKeys(value, ['hostId', 'kind']) && nonemptyString(value.hostId)
  return value.kind === 'domain' && hasExactKeys(value, ['domain', 'kind']) &&
    (value.domain === 'work' || value.domain === 'companion')
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  const keys = Object.keys(object).filter((key) => object[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function citedProjection(
  evidence: readonly ObserverPromptEvidence[],
  evidenceIds: readonly string[],
): { allowedHosts: string[]; allowedDomains: ('work' | 'companion')[] } | undefined {
  const cited = evidence.filter((item) => evidenceIds.includes(item.id))
  if (cited.length !== evidenceIds.length) return undefined
  const first = cited[0]
  if (first === undefined) return undefined
  const allowedHosts = first.projection.allowedHosts.filter((host) =>
    cited.every((item) => item.projection.allowedHosts.includes(host)),
  )
  const allowedDomains = first.projection.allowedDomains.filter((domain) =>
    cited.every((item) => item.projection.allowedDomains.includes(domain)),
  )
  if (allowedHosts.length === 0 || allowedDomains.length === 0) return undefined
  return { allowedHosts, allowedDomains }
}

function parseCandidate(
  value: unknown,
  input: ObserverPromptInput,
  identity: PendingCandidateProposal['identity'],
  evidenceById: ReadonlyMap<string, ObserverPromptEvidence>,
): ObserverProposal | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    'confidence', 'counterEvidenceIds', 'evidenceIds', 'preference', 'riskCategory', 'scope', 'status',
  ])) return undefined
  if (!preference(value.preference) || !scope(value.scope)) return undefined
  if (!uniqueStrings(value.evidenceIds, 1) || !uniqueStrings(value.counterEvidenceIds)) return undefined
  const evidenceIds = value.evidenceIds
  const counterEvidenceIds = value.counterEvidenceIds
  if (evidenceIds.some((id) => !evidenceById.has(id)) || counterEvidenceIds.some((id) => !evidenceById.has(id))) return undefined
  if (evidenceIds.some((id) => counterEvidenceIds.includes(id))) return undefined
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return undefined
  if (value.riskCategory !== 'standard' && value.riskCategory !== 'sensitive') return undefined
  if (value.status !== 'pending_confirmation') return undefined
  const confidence = value.confidence
  const riskCategory = value.riskCategory as PreferenceRiskCategory

  const cited = evidenceIds.map((id) => evidenceById.get(id)!).filter(Boolean)
  const selectedScope = value.scope
  if (selectedScope.kind === 'host' && !cited.every((item) => item.identity.hostId === selectedScope.hostId)) return undefined
  if (selectedScope.kind === 'domain' && !cited.every((item) => item.identity.domain === selectedScope.domain)) return undefined
  const projection = citedProjection(input.evidenceWindow, evidenceIds)
  if (projection === undefined) return undefined

  const proposalBase = {
    identity,
    preference: value.preference,
    scope: selectedScope,
    projection,
    provenance: { kind: 'observer-evidence' as const, evidenceIds: [...evidenceIds] },
    sourceHostIds: [...new Set(cited.map(item => item.identity.hostId))].sort(),
    evidenceIds: [...evidenceIds],
    counterEvidenceIds: [...counterEvidenceIds],
    confidence,
    riskCategory,
    status: 'pending_confirmation' as const,
  }
  return {
    ...proposalBase,
    idempotencyKey: {
      version: 1,
      algorithm: 'sha256',
      digest: digest(proposalBase),
    },
  }
}

export function parseOpenAICompatibleResponse(
  responseBody: unknown,
  input: ObserverPromptInput,
): ObserverProposal[] {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) return []
  const firstChoice = responseBody.choices[0]
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string') return []
  let document: unknown
  try {
    document = JSON.parse(firstChoice.message.content) as unknown
  } catch {
    return []
  }
  if (!isRecord(document) || !hasExactKeys(document, ['decision', 'proposals']) || !Array.isArray(document.proposals)) return []
  if (document.decision !== 'abstain' && document.decision !== 'propose') return []
  if (document.decision === 'abstain') return document.proposals.length === 0 ? [] : []
  if (document.proposals.length === 0) return []

  const evidence = input.evidenceWindow
  if (evidence.length === 0) return []
  const identity = evidence[0]!.identity
  if (!evidence.every((item) =>
    item.identity.userId === identity.userId &&
    item.identity.companionId === identity.companionId &&
    item.identity.relationshipId === identity.relationshipId,
  )) return []
  const ids = evidence.map((item) => item.id)
  if (ids.some((id) => !nonemptyString(id)) || new Set(ids).size !== ids.length) return []
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const resolvedIdentity = {
    userId: identity.userId,
    companionId: identity.companionId,
    relationshipId: identity.relationshipId,
  }
  const proposals = document.proposals.map((item) => parseCandidate(item, input, resolvedIdentity, evidenceById))
  return proposals.every((item): item is ObserverProposal => item !== undefined) ? proposals : []
}

export const openAICompatibleObserverCodec: OpenAICompatibleObserverCodec = {
  buildRequest: buildOpenAICompatibleRequest,
  parseResponse: parseOpenAICompatibleResponse,
}
