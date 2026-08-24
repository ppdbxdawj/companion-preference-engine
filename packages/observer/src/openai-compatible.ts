import type {
  InteractionEvidence,
  OutboundInferencePolicy,
  PendingCandidateProposal,
  TypedHostSource,
} from '@companion-preference/contracts'

import type {
  ObserverInput,
  ObserverProposal,
  PreferenceObserver,
} from './observer.js'

export type JsonPrimitive = boolean | null | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

/**
 * The data-minimized input visible to request construction. Host-native fields,
 * session IDs, source references, consent metadata, and policy snapshots never
 * cross this boundary.
 */
export type ObserverPromptEvidence = Readonly<{
  schemaVersion: 1
  id: string
  identity: Readonly<{
    userId: string
    companionId: string
    relationshipId: string
    hostId: string
    domain: InteractionEvidence['identity']['domain']
  }>
  occurredAt: string
  source: Readonly<TypedHostSource>
  learningPayload: Readonly<{
    userText: string
    assistantText?: string
  }>
  projection: Readonly<{
    allowedHosts: readonly string[]
    allowedDomains: readonly InteractionEvidence['identity']['domain'][]
  }>
}>

export type ObserverPromptInput = Readonly<{
  evidenceWindow: readonly ObserverPromptEvidence[]
}>

/** Pure request/response mechanics implemented separately from network policy. */
export interface OpenAICompatibleObserverCodec {
  buildRequest(input: ObserverPromptInput): JsonObject
  parseResponse(
    responseBody: unknown,
    input: ObserverPromptInput,
  ): ObserverProposal[]
}

/** Content-free metadata exposed to the canonical revocation fence. */
export type ObserverDispatchAuthorizationContext = Readonly<{
  mode: Exclude<OutboundInferencePolicy['mode'], 'disabled'>
  evidence: readonly Readonly<{
    id: string
    source: Readonly<TypedHostSource>
    settingsRevision: number
  }>[]
}>

export type OpenAICompatibleObserverErrorCode =
  | 'invalid-configuration'
  | 'endpoint-not-allowed'
  | 'invalid-request'
  | 'network-error'
  | 'request-timeout'
  | 'redirect-rejected'
  | 'http-error'

/** Error messages are deliberately content-free and safe for runtime audit. */
export class OpenAICompatibleObserverError extends Error {
  readonly code: OpenAICompatibleObserverErrorCode

  constructor(code: OpenAICompatibleObserverErrorCode, message: string) {
    super(message)
    this.name = 'OpenAICompatibleObserverError'
    this.code = code
  }
}

export type OpenAICompatibleObserverConfig = Readonly<{
  /** Explicit configuration only. This adapter never reads process.env. */
  baseUrl: string
  model: string
  apiKey?: string
  outboundPolicy: OutboundInferencePolicy
  codec: OpenAICompatibleObserverCodec
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  maxResponseBytes?: number
  /**
   * Synchronous by design: callers can recheck canonical settings without an
   * await-sized time-of-check/time-of-use gap before fetch starts.
   */
  isDispatchAuthorized?: (
    context: ObserverDispatchAuthorizationContext,
  ) => boolean
}>

type FrozenConfig = Readonly<{
  endpoint: URL
  model: string
  apiKey?: string
  outboundPolicy: OutboundInferencePolicy
  codec: OpenAICompatibleObserverCodec
  fetch: typeof globalThis.fetch
  timeoutMs: number
  maxResponseBytes: number
  isDispatchAuthorized: (
    context: ObserverDispatchAuthorizationContext,
  ) => boolean
}>

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000
const MAX_RESPONSE_BYTES = 4_000_000
const REDACTION = '[REDACTED]'

function observerError(
  code: OpenAICompatibleObserverErrorCode,
  message: string,
): OpenAICompatibleObserverError {
  return new OpenAICompatibleObserverError(code, message)
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError')
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function sameSource(left: TypedHostSource, right: TypedHostSource): boolean {
  return (
    left.kind === right.kind &&
    left.contentCategory === right.contentCategory
  )
}

function policyAllowsSource(
  policy: OutboundInferencePolicy,
  source: TypedHostSource,
): boolean {
  return (
    policy.mode !== 'disabled' &&
    policy.allowedSources.some((allowed) => sameSource(allowed, source))
  )
}

function cloneOutboundPolicy(
  policy: OutboundInferencePolicy,
): OutboundInferencePolicy {
  if (policy.mode === 'disabled') return { mode: 'disabled' }
  return {
    mode: policy.mode,
    allowedSources: policy.allowedSources.map((source) => ({ ...source })),
  }
}

function rawHostname(value: string): string | undefined {
  const match = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(value)
  if (!match) return undefined
  const authority = match[1]!
  const withoutCredentials = authority.slice(authority.lastIndexOf('@') + 1)
  if (withoutCredentials.startsWith('[')) {
    const end = withoutCredentials.indexOf(']')
    return end === -1 ? undefined : withoutCredentials.slice(0, end + 1)
  }
  return withoutCredentials.split(':', 1)[0]
}

function isCanonicalLoopbackLiteral(value: string, parsed: URL): boolean {
  const raw = rawHostname(value)
  if (!raw) return false
  if (raw.toLowerCase() === '[::1]') return parsed.hostname === '[::1]'
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return false
  const octets = raw.split('.')
  if (
    octets.some(
      (octet) =>
        Number(octet) > 255 ||
        (octet.length > 1 && octet.startsWith('0')) ||
        String(Number(octet)) !== octet,
    )
  ) {
    return false
  }
  return Number(octets[0]) === 127 && parsed.hostname === raw
}

function isDeniedRemoteIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false
  const [first, second] = hostname.split('.').map(Number)
  if (first === undefined || second === undefined) return true
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0) ||
    first >= 224
  )
}

function endpointFor(
  baseUrl: string,
  mode: OutboundInferencePolicy['mode'],
): URL {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw observerError('invalid-configuration', 'Observer endpoint is invalid')
  }

  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw observerError('endpoint-not-allowed', 'Observer endpoint is not allowed')
  }

  if (mode === 'local-only') {
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !isCanonicalLoopbackLiteral(baseUrl, parsed)
    ) {
      throw observerError('endpoint-not-allowed', 'Observer endpoint is not allowed')
    }
  } else {
    const hostname = parsed.hostname.toLowerCase()
    const raw = rawHostname(baseUrl)?.toLowerCase()
    const isIpv6Literal = raw?.startsWith('[') === true
    const localName =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    if (
      parsed.protocol !== 'https:' ||
      hostname === '' ||
      localName ||
      isIpv6Literal ||
      isDeniedRemoteIpv4(hostname)
    ) {
      throw observerError('endpoint-not-allowed', 'Observer endpoint is not allowed')
    }
  }

  const path = parsed.pathname.replace(/\/+$/, '')
  parsed.pathname = `${path}/chat/completions`.replace(/^\/\//, '/')
  return parsed
}

function validPositiveInteger(
  value: number,
  maximum: number,
): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
}

function freezeConfig(config: OpenAICompatibleObserverConfig): FrozenConfig {
  if (config.model.trim() === '') {
    throw observerError('invalid-configuration', 'Observer model is invalid')
  }
  if (config.apiKey !== undefined && config.apiKey.trim() === '') {
    throw observerError('invalid-configuration', 'Observer API key is invalid')
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!validPositiveInteger(timeoutMs, MAX_TIMEOUT_MS)) {
    throw observerError('invalid-configuration', 'Observer timeout is invalid')
  }
  const maxResponseBytes =
    config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  if (!validPositiveInteger(maxResponseBytes, MAX_RESPONSE_BYTES)) {
    throw observerError(
      'invalid-configuration',
      'Observer response limit is invalid',
    )
  }
  const outboundPolicy = cloneOutboundPolicy(config.outboundPolicy)
  return {
    endpoint: endpointFor(config.baseUrl, outboundPolicy.mode),
    model: config.model,
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    outboundPolicy,
    codec: config.codec,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    timeoutMs,
    maxResponseBytes,
    isDispatchAuthorized: config.isDispatchAuthorized ?? (() => true),
  }
}

function redactString(value: string): string {
  if (/-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)* PRIVATE KEY-----/i.test(value)) {
    return REDACTION
  }

  return value
    .replace(/\bBearer\s+[A-Za-z\d._~+/=-]{8,}/gi, REDACTION)
    .replace(/\bsk-[A-Za-z\d_-]{16,}/g, REDACTION)
    .replace(/\bgh[pousr]_[A-Za-z\d]{20,}/gi, REDACTION)
    .replace(/\bAKIA[A-Z\d]{16}\b/g, REDACTION)
    .replace(
      /\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password|secret)\s*([:=])\s*[^\s,;]+/gi,
      (_match, name: string, separator: string) =>
        `${name}${separator === ':' ? ': ' : '='}${REDACTION}`,
    )
}

function isSecretField(key: string): boolean {
  return [
    'apikey',
    'authorization',
    'credential',
    'credentials',
    'password',
    'privatekey',
    'secret',
    'token',
    'accesstoken',
    'refreshtoken',
  ].includes(key.replace(/[-_\s]/g, '').toLowerCase())
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value)
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw observerError('invalid-request', 'Observer request is invalid')
    }
    seen.add(value)
    const result = value.map((item) => redactUnknown(item, seen))
    seen.delete(value)
    return result
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw observerError('invalid-request', 'Observer request is invalid')
    }
    seen.add(value)
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSecretField(key)
        ? REDACTION
        : redactUnknown(item, seen)
    }
    seen.delete(value)
    return result
  }
  throw observerError('invalid-request', 'Observer request is invalid')
}

/** Returns a deep redacted copy and never mutates its input. */
export function redactObserverSecrets<T>(value: T): T {
  return redactUnknown(value, new WeakSet()) as T
}

function safePromptInput(input: ObserverInput): ObserverPromptInput {
  return {
    evidenceWindow: input.evidenceWindow.map((item) => {
      const learningPayload = {
        userText: redactString(item.learningPayload.userText),
        ...(item.learningPayload.assistantText === undefined
          ? {}
          : { assistantText: redactString(item.learningPayload.assistantText) }),
      }
      return {
        schemaVersion: 1 as const,
        id: item.id,
        identity: {
          userId: item.identity.userId,
          companionId: item.identity.companionId,
          relationshipId: item.identity.relationshipId,
          hostId: item.identity.hostId,
          domain: item.identity.domain,
        },
        occurredAt: item.occurredAt,
        source: { ...item.source },
        learningPayload,
        projection: {
          allowedHosts: [...item.policySnapshot.projection.allowedHosts],
          allowedDomains: [...item.policySnapshot.projection.allowedDomains],
        },
      }
    }),
  }
}

function sameIdentity(
  left: InteractionEvidence,
  right: InteractionEvidence,
): boolean {
  return (
    left.identity.userId === right.identity.userId &&
    left.identity.companionId === right.identity.companionId &&
    left.identity.relationshipId === right.identity.relationshipId &&
    left.identity.hostId === right.identity.hostId &&
    left.identity.domain === right.identity.domain
  )
}

function dispatchContext(
  input: ObserverInput,
  mode: Exclude<OutboundInferencePolicy['mode'], 'disabled'>,
): ObserverDispatchAuthorizationContext {
  return {
    mode,
    evidence: input.evidenceWindow.map((item) => ({
      id: item.id,
      source: { ...item.source },
      settingsRevision: item.policySnapshot.settingsRevision,
    })),
  }
}

function dispatchIsAdmitted(
  input: ObserverInput,
  policy: OutboundInferencePolicy,
): policy is Exclude<OutboundInferencePolicy, { mode: 'disabled' }> {
  if (input.evidenceWindow.length === 0 || policy.mode === 'disabled') {
    return false
  }
  const first = input.evidenceWindow[0]!
  return input.evidenceWindow.every((item) => {
    const captured = item.policySnapshot.outboundInference
    return (
      sameIdentity(first, item) &&
      item.source.contentCategory === 'ordinary-conversation' &&
      item.consent.purpose === 'preference-learning' &&
      item.policySnapshot.collection.retainContent &&
      item.policySnapshot.collection.allowedSources.some((allowed) =>
        sameSource(allowed, item.source),
      ) &&
      captured.mode === policy.mode &&
      policyAllowsSource(policy, item.source) &&
      policyAllowsSource(captured, item.source)
    )
  })
}

function authorizationAllows(
  authorize: FrozenConfig['isDispatchAuthorized'],
  context: ObserverDispatchAuthorizationContext,
): boolean {
  try {
    return authorize(context) === true
  } catch {
    return false
  }
}

function serializeRequest(
  model: string,
  request: JsonObject,
): string {
  if (
    typeof request !== 'object' ||
    request === null ||
    Array.isArray(request)
  ) {
    throw observerError('invalid-request', 'Observer request is invalid')
  }
  let body: string | undefined
  try {
    const redacted = redactObserverSecrets(request)
    body = JSON.stringify({ ...redacted, model })
  } catch (error) {
    if (error instanceof OpenAICompatibleObserverError) throw error
    throw observerError('invalid-request', 'Observer request is invalid')
  }
  if (body === undefined) {
    throw observerError('invalid-request', 'Observer request is invalid')
  }
  return body
}

function responseWasRedirected(response: Response, endpoint: URL): boolean {
  if (response.status >= 300 && response.status < 400) return true
  if (response.redirected) return true
  if (response.url === '') return false
  try {
    return new URL(response.url).href !== endpoint.href
  } catch {
    return true
  }
}

async function readBoundedResponseText(
  response: Response,
  maxResponseBytes: number,
): Promise<string | undefined> {
  const contentLength = response.headers?.get('content-length')
  if (contentLength !== null && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength)
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxResponseBytes) {
      return undefined
    }
  }

  if (response.body === null || response.body === undefined) {
    const responseText = await response.text()
    return new TextEncoder().encode(responseText).byteLength <= maxResponseBytes
      ? responseText
      : undefined
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxResponseBytes) {
        try {
          await reader.cancel()
        } catch {
          // The response is already rejected; cancellation is best effort.
        }
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function pendingOnly(value: unknown): ObserverProposal[] {
  if (!Array.isArray(value)) return []
  return structuredClone(
    value.filter(
      (item): item is PendingCandidateProposal =>
        typeof item === 'object' &&
        item !== null &&
        'status' in item &&
        item.status === 'pending_confirmation',
    ),
  )
}

export class OpenAICompatiblePreferenceObserver implements PreferenceObserver {
  private readonly config: FrozenConfig

  constructor(config: OpenAICompatibleObserverConfig) {
    this.config = freezeConfig(config)
  }

  async propose(
    input: ObserverInput,
    signal?: AbortSignal,
  ): Promise<ObserverProposal[]> {
    assertNotAborted(signal)
    if (!dispatchIsAdmitted(input, this.config.outboundPolicy)) return []

    const context = dispatchContext(input, this.config.outboundPolicy.mode)
    if (!authorizationAllows(this.config.isDispatchAuthorized, context)) return []

    const promptInput = safePromptInput(input)
    let request: JsonObject
    try {
      request = this.config.codec.buildRequest(promptInput)
    } catch {
      return []
    }
    const body = serializeRequest(this.config.model, request)

    assertNotAborted(signal)
    if (!authorizationAllows(this.config.isDispatchAuthorized, context)) return []

    const controller = new AbortController()
    let timedOut = false
    const onCallerAbort = () => controller.abort()
    signal?.addEventListener('abort', onCallerAbort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.config.timeoutMs)

    try {
      assertNotAborted(signal)
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      }
      if (this.config.apiKey !== undefined) {
        headers.authorization = `Bearer ${this.config.apiKey}`
      }
      const response = await this.config.fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      })

      assertNotAborted(signal)
      if (timedOut) {
        throw observerError('request-timeout', 'Observer request timed out')
      }
      if (responseWasRedirected(response, this.config.endpoint)) {
        throw observerError('redirect-rejected', 'Observer redirect was rejected')
      }
      if (!response.ok) {
        throw observerError('http-error', 'Observer endpoint returned an error')
      }

      const responseText = await readBoundedResponseText(
        response,
        this.config.maxResponseBytes,
      )
      assertNotAborted(signal)
      if (timedOut) {
        throw observerError('request-timeout', 'Observer request timed out')
      }
      if (responseText === undefined) return []

      let responseBody: unknown
      try {
        responseBody = JSON.parse(responseText) as unknown
      } catch {
        return []
      }

      try {
        return pendingOnly(
          this.config.codec.parseResponse(responseBody, promptInput),
        )
      } catch {
        return []
      }
    } catch (error) {
      if (signal?.aborted) throw abortError()
      if (timedOut) {
        throw observerError('request-timeout', 'Observer request timed out')
      }
      if (error instanceof OpenAICompatibleObserverError) throw error
      throw observerError('network-error', 'Observer network request failed')
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onCallerAbort)
    }
  }
}
