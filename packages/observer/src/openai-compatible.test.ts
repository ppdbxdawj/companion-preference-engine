import type {
  InteractionEvidence,
  OutboundInferencePolicy,
  PendingCandidateProposal,
} from '@companion-preference/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OpenAICompatibleObserverError,
  OpenAICompatiblePreferenceObserver,
  redactObserverSecrets,
  type OpenAICompatibleObserverCodec,
  type OpenAICompatibleObserverConfig,
  type ObserverDispatchAuthorizationContext,
} from './openai-compatible.js'
import { openAICompatibleObserverCodec } from './prompt.js'

const ordinarySource = {
  kind: 'chat-turn',
  contentCategory: 'ordinary-conversation',
} as const

const localPolicy: OutboundInferencePolicy = {
  mode: 'local-only',
  allowedSources: [ordinarySource],
}

const remotePolicy: OutboundInferencePolicy = {
  mode: 'allow-configured-remote',
  allowedSources: [ordinarySource],
}

function evidence(
  outboundInference: OutboundInferencePolicy = remotePolicy,
  overrides: Partial<InteractionEvidence> = {},
): InteractionEvidence {
  return {
    schemaVersion: 1,
    id: 'evidence-1',
    identity: {
      userId: 'synthetic-user',
      companionId: 'synthetic-companion',
      relationshipId: 'synthetic-relationship',
      hostId: 'reference-host',
      sessionId: 'secret-session-id',
      domain: 'work',
    },
    occurredAt: '2026-08-24T00:00:00Z',
    sourceRef: 'private-host-reference',
    source: ordinarySource,
    consent: { purpose: 'preference-learning', policyVersion: 'policy-v1' },
    learningPayload: { userText: 'Please keep work answers concise.' },
    policySnapshot: {
      collection: { allowedSources: [ordinarySource], retainContent: true },
      outboundInference,
      projection: {
        allowedHosts: ['reference-host'],
        allowedDomains: ['work'],
      },
      settingsRevision: 7,
    },
    ...overrides,
  }
}

const proposal: PendingCandidateProposal = {
  identity: {
    userId: 'synthetic-user',
    companionId: 'synthetic-companion',
    relationshipId: 'synthetic-relationship',
  },
  preference: { key: 'interaction.response_detail', value: 'concise' },
  scope: { kind: 'domain', domain: 'work' },
  projection: { allowedHosts: ['reference-host'], allowedDomains: ['work'] },
  provenance: { kind: 'observer-evidence', evidenceIds: ['evidence-1'] },
  sourceHostIds: ['reference-host'],
  evidenceIds: ['evidence-1'],
  counterEvidenceIds: [],
  confidence: 0.9,
  riskCategory: 'standard',
  status: 'pending_confirmation',
  idempotencyKey: {
    version: 1,
    algorithm: 'sha256',
    digest: 'b3fbbd10ac6687f53bdafa076f18e3c7321229fd66a891a2bef0c6359ddc1668',
  },
}

function jsonResponse(
  value: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function codec(
  proposals: unknown = [proposal],
): OpenAICompatibleObserverCodec {
  return {
    buildRequest(input) {
      return {
        messages: [
          {
            role: 'user',
            content: JSON.stringify(input.evidenceWindow),
          },
        ],
      }
    },
    parseResponse: vi.fn(() => proposals as PendingCandidateProposal[]),
  }
}

function config(
  overrides: Partial<OpenAICompatibleObserverConfig> = {},
): OpenAICompatibleObserverConfig {
  return {
    baseUrl: 'https://observer.example/v1',
    model: 'observer-model',
    apiKey: 'test-provider-key',
    outboundPolicy: remotePolicy,
    timeoutMs: 5_000,
    fetch: vi.fn(async () => jsonResponse({ choices: [] })),
    codec: codec(),
    isDispatchAuthorized: () => true,
    ...overrides,
  }
}

function fetchMock(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  const mock = vi.fn(implementation)
  return mock as typeof mock & typeof fetch
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('OpenAICompatiblePreferenceObserver outbound admission', () => {
  it('sends only a minimized, redacted copy of the currently approved evidence window', async () => {
    const fetch = fetchMock(async () => jsonResponse({ choices: [] }))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ fetch, codec: openAICompatibleObserverCodec }),
    )
    const approved = evidence(remotePolicy, {
      learningPayload: {
        userText: 'Use key sk-1234567890abcdefghijkl and password=hunter2secret.',
        assistantText: 'Bearer abcdefghijklmnopqrstuvwxyz',
      },
    })
    ;(approved as InteractionEvidence & { composedMessage?: string }).composedMessage =
      'must-never-leave-process'

    await observer.propose({ evidenceWindow: [approved] })

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://observer.example/v1/chat/completions')
    expect(init?.redirect).toBe('manual')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      authorization: 'Bearer test-provider-key',
      'content-type': 'application/json',
    })
    const body = String(init?.body)
    expect(body).toContain('[REDACTED]')
    expect(body).not.toContain('sk-1234567890abcdefghijkl')
    expect(body).not.toContain('hunter2secret')
    expect(body).not.toContain('abcdefghijklmnopqrstuvwxyz')
    expect(body).not.toContain('must-never-leave-process')
    expect(body).not.toContain('secret-session-id')
    expect(body).not.toContain('private-host-reference')
    expect(body).not.toContain('policy-v1')
    expect(body).not.toContain('synthetic-user')
    expect(body).not.toContain('synthetic-companion')
    expect(body).not.toContain('synthetic-relationship')
    expect(approved.learningPayload.userText).toContain('sk-1234567890abcdefghijkl')
  })

  it.each([
    ['disabled canonical policy', { mode: 'disabled' } as OutboundInferencePolicy, evidence(remotePolicy)],
    ['disabled evidence snapshot', remotePolicy, evidence({ mode: 'disabled' })],
    [
      'source absent from canonical allowlist',
      { mode: 'allow-configured-remote', allowedSources: [] } as OutboundInferencePolicy,
      evidence(remotePolicy),
    ],
    [
      'source absent from evidence allowlist',
      remotePolicy,
      evidence({ mode: 'allow-configured-remote', allowedSources: [] }),
    ],
  ])('performs no network write for %s', async (_name, outboundPolicy, item) => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ outboundPolicy, fetch }),
    )

    await expect(observer.propose({ evidenceWindow: [item] })).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires the canonical and captured policy modes to match exactly', async () => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ outboundPolicy: remotePolicy, fetch }),
    )

    await expect(
      observer.propose({ evidenceWindow: [evidence(localPolicy)] }),
    ).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires retained, collection-authorized evidence in addition to outbound authorization', async () => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(config({ fetch }))
    const notRetained = evidence(remotePolicy)
    notRetained.policySnapshot.collection.retainContent = false

    await expect(
      observer.propose({ evidenceWindow: [notRetained] }),
    ).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['code', 'terminal', 'tool-trace'] as const)(
    'fails closed for %s content even if both policies list it',
    async (contentCategory) => {
      const source = { kind: 'chat-turn', contentCategory } as const
      const outboundPolicy: OutboundInferencePolicy = {
        mode: 'allow-configured-remote',
        allowedSources: [source],
      }
      const fetch = fetchMock(async () => jsonResponse({}))
      const observer = new OpenAICompatiblePreferenceObserver(
        config({ outboundPolicy, fetch }),
      )

      await expect(
        observer.propose({
          evidenceWindow: [
            evidence(outboundPolicy, {
              source,
              learningPayload: { userText: 'typed sensitive content' },
            }),
          ],
        }),
      ).resolves.toEqual([])
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('returns without calling the codec or network for an empty window', async () => {
    const requestCodec = codec()
    const buildSpy = vi.spyOn(requestCodec, 'buildRequest')
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ codec: requestCodec, fetch }),
    )

    await expect(observer.propose({ evidenceWindow: [] })).resolves.toEqual([])
    expect(buildSpy).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed for a mixed identity evidence window', async () => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(config({ fetch }))
    const other = evidence(remotePolicy, {
      id: 'evidence-2',
      identity: { ...evidence().identity, userId: 'other-user' },
    })

    await expect(
      observer.propose({ evidenceWindow: [evidence(), other] }),
    ).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rechecks synchronous authorization immediately before fetch', async () => {
    let allowed = true
    const requestCodec: OpenAICompatibleObserverCodec = {
      buildRequest() {
        allowed = false
        return { messages: [] }
      },
      parseResponse: () => [proposal],
    }
    const authorization = vi.fn(
      (_context: ObserverDispatchAuthorizationContext) => allowed,
    )
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({
        codec: requestCodec,
        fetch,
        isDispatchAuthorized: authorization,
      }),
    )

    await expect(observer.propose({ evidenceWindow: [evidence()] })).resolves.toEqual([])
    expect(authorization).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(authorization.mock.calls)).not.toContain(
      'Please keep work answers concise.',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the canonical authorization callback throws', async () => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({
        fetch,
        isDispatchAuthorized: () => {
          throw new Error('private settings failure')
        },
      }),
    )

    await expect(observer.propose({ evidenceWindow: [evidence()] })).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a non-object codec request before network dispatch', async () => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({
        fetch,
        codec: {
          buildRequest: () => null as unknown as Record<string, never>,
          parseResponse: () => [],
        },
      }),
    )

    await expect(
      observer.propose({ evidenceWindow: [evidence()] }),
    ).rejects.toMatchObject({ code: 'invalid-request' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('OpenAICompatiblePreferenceObserver URL and redirect policy', () => {
  it.each([
    'http://127.0.0.1:11434/v1',
    'http://127.1.2.3:11434/v1/',
    'http://[::1]:11434/v1',
  ])('accepts a literal loopback URL in local-only mode: %s', async (baseUrl) => {
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ baseUrl, outboundPolicy: localPolicy, fetch }),
    )

    await observer.propose({ evidenceWindow: [evidence(localPolicy)] })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    'http://localhost:11434/v1',
    'http://0x7f000001:11434/v1',
    'http://2130706433:11434/v1',
    'http://192.168.1.4:11434/v1',
    'https://observer.example/v1',
    'file:///tmp/observer.sock',
  ])('rejects a non-literal-loopback local-only URL: %s', (baseUrl) => {
    expect(
      () =>
        new OpenAICompatiblePreferenceObserver(
          config({ baseUrl, outboundPolicy: localPolicy }),
        ),
    ).toThrowError(
      expect.objectContaining<Partial<OpenAICompatibleObserverError>>({
        code: 'endpoint-not-allowed',
      }),
    )
  })

  it.each([
    'http://observer.example/v1',
    'https://localhost/v1',
    'https://127.0.0.1/v1',
    'https://10.0.0.4/v1',
    'https://169.254.169.254/latest',
    'https://[::1]/v1',
    'https://user:password@observer.example/v1',
    'https://observer.example/v1?token=secret',
    'https://observer.example/v1#fragment',
  ])('rejects an unsafe configured-remote URL: %s', (baseUrl) => {
    expect(
      () => new OpenAICompatiblePreferenceObserver(config({ baseUrl })),
    ).toThrowError(
      expect.objectContaining<Partial<OpenAICompatibleObserverError>>({
        code: 'endpoint-not-allowed',
      }),
    )
  })

  it.each([301, 302, 303, 307, 308])(
    'rejects redirect status %s without reading or following it',
    async (status) => {
      const response = new Response(null, {
        status,
        headers: { location: 'https://other.example/v1/chat/completions' },
      })
      const fetch = fetchMock(async () => response)
      const observer = new OpenAICompatiblePreferenceObserver(config({ fetch }))

      await expect(
        observer.propose({ evidenceWindow: [evidence()] }),
      ).rejects.toMatchObject({ code: 'redirect-rejected' })
      expect(fetch).toHaveBeenCalledOnce()
      expect(fetch.mock.calls[0]![1]?.redirect).toBe('manual')
    },
  )

  it('rejects a response reported as implicitly redirected', async () => {
    const response = {
      ok: true,
      status: 200,
      redirected: true,
      url: 'https://other.example/v1/chat/completions',
      text: vi.fn(async () => '{}'),
    } as unknown as Response
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ fetch: fetchMock(async () => response) }),
    )

    await expect(
      observer.propose({ evidenceWindow: [evidence()] }),
    ).rejects.toMatchObject({ code: 'redirect-rejected' })
    expect(response.text).not.toHaveBeenCalled()
  })
})

describe('OpenAICompatiblePreferenceObserver abort, timeout, and response safety', () => {
  it('does no work and no network write when pre-aborted', async () => {
    const requestCodec = codec()
    const buildSpy = vi.spyOn(requestCodec, 'buildRequest')
    const fetch = fetchMock(async () => jsonResponse({}))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ codec: requestCodec, fetch }),
    )
    const controller = new AbortController()
    controller.abort()

    await expect(
      observer.propose({ evidenceWindow: [evidence()] }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(buildSpy).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('propagates caller abort to the in-flight fetch', async () => {
    let receivedSignal: AbortSignal | undefined
    const fetch = fetchMock(async (_url, init) => {
      receivedSignal = init?.signal ?? undefined
      return await new Promise<Response>((_resolve, reject) => {
        receivedSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      })
    })
    const observer = new OpenAICompatiblePreferenceObserver(config({ fetch }))
    const controller = new AbortController()
    const pending = observer.propose({ evidenceWindow: [evidence()] }, controller.signal)

    await vi.waitFor(() => expect(receivedSignal).toBeDefined())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('aborts the in-flight fetch at the configured timeout with a content-free error', async () => {
    vi.useFakeTimers()
    const fetch = fetchMock(async (_url, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      }),
    )
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ fetch, timeoutMs: 25 }),
    )
    const pending = observer.propose({ evidenceWindow: [evidence()] })
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'request-timeout',
      message: 'Observer request timed out',
    })

    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })

  it('enforces the timeout while the response body is being read', async () => {
    vi.useFakeTimers()
    const fetch = fetchMock(async (_url, init) => ({
      ok: true,
      status: 200,
      redirected: false,
      url: '',
      text: async () =>
        await new Promise<string>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    } as unknown as Response))
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ fetch, timeoutMs: 25 }),
    )
    const pending = observer.propose({ evidenceWindow: [evidence()] })
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'request-timeout',
    })

    await vi.advanceTimersByTimeAsync(25)
    await rejection
  })

  it('returns zero proposals for malformed JSON or parser failure', async () => {
    const malformedFetch = fetchMock(async () => new Response('{not-json'))
    const throwingCodec = codec()
    throwingCodec.parseResponse = () => {
      throw new Error('private model output')
    }
    const malformedObserver = new OpenAICompatiblePreferenceObserver(
      config({ fetch: malformedFetch }),
    )
    const invalidObserver = new OpenAICompatiblePreferenceObserver(
      config({
        fetch: fetchMock(async () => jsonResponse({ invalid: true })),
        codec: throwingCodec,
      }),
    )

    await expect(
      malformedObserver.propose({ evidenceWindow: [evidence()] }),
    ).resolves.toEqual([])
    await expect(
      invalidObserver.propose({ evidenceWindow: [evidence()] }),
    ).resolves.toEqual([])
  })

  it('never emits a non-pending result even if a codec violates its type', async () => {
    const unsafeCodec = codec([
      proposal,
      { ...proposal, status: 'confirmed' },
      null,
    ])
    const observer = new OpenAICompatiblePreferenceObserver(
      config({ codec: unsafeCodec }),
    )

    await expect(observer.propose({ evidenceWindow: [evidence()] })).resolves.toEqual([
      proposal,
    ])
  })

  it('returns zero proposals without parsing an oversized response', async () => {
    const requestCodec = codec()
    const observer = new OpenAICompatiblePreferenceObserver(
      config({
        codec: requestCodec,
        maxResponseBytes: 8,
        fetch: fetchMock(async () => new Response('{"large":true}')),
      }),
    )

    await expect(observer.propose({ evidenceWindow: [evidence()] })).resolves.toEqual([])
    expect(requestCodec.parseResponse).not.toHaveBeenCalled()
  })

  it('wraps network failures without leaking their message', async () => {
    const observer = new OpenAICompatiblePreferenceObserver(
      config({
        fetch: fetchMock(async () => {
          throw new Error('secret upstream DNS detail')
        }),
      }),
    )

    try {
      await observer.propose({ evidenceWindow: [evidence()] })
      throw new Error('expected observer failure')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'network-error',
        message: 'Observer network request failed',
      })
      expect(String(error)).not.toContain('secret upstream DNS detail')
    }
  })

  it('does not include response bodies or endpoint details in transport errors', async () => {
    const observer = new OpenAICompatiblePreferenceObserver(
      config({
        baseUrl: 'https://private-provider.example/secret-path',
        fetch: fetchMock(async () =>
          new Response('provider-secret-response', { status: 500 }),
        ),
      }),
    )

    await expect(
      observer.propose({ evidenceWindow: [evidence()] }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'http-error',
        message: 'Observer endpoint returned an error',
      }),
    )
    try {
      await observer.propose({ evidenceWindow: [evidence()] })
    } catch (error) {
      expect(String(error)).not.toContain('private-provider')
      expect(String(error)).not.toContain('secret-path')
      expect(String(error)).not.toContain('provider-secret-response')
    }
  })
})

describe('redactObserverSecrets', () => {
  it('redacts common inline tokens, assignments, private keys, and secret-valued fields', () => {
    const input = {
      authorization: 'Bearer abcdefghijklmnop',
      apiKey: 'plain-secret-value',
      nested: [
        'ghp_1234567890abcdefghijklmnop',
        'AKIA1234567890ABCDEF',
        'password: swordfish-secret',
        '-----BEGIN PRIVATE KEY-----\nprivate material\n-----END PRIVATE KEY-----',
      ],
      safe: 'keep this',
    }

    expect(redactObserverSecrets(input)).toEqual({
      authorization: '[REDACTED]',
      apiKey: '[REDACTED]',
      nested: ['[REDACTED]', '[REDACTED]', 'password: [REDACTED]', '[REDACTED]'],
      safe: 'keep this',
    })
    expect(input.apiKey).toBe('plain-secret-value')
  })
})
