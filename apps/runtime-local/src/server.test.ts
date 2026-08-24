import {
  activePreferenceRecordFixture,
  adapterProjectionStatusFixture,
  auditEventFixture,
  auditQueryFixture,
  confirmCandidateCommandFixture,
  connectionListHttpResultFixture,
  connectionSettingsFixture,
  createExplicitPreferenceCommandFixture,
  deleteCandidateCommandFixture,
  deleteEvidenceCommandFixture,
  deleteEvidenceResultFixture,
  effectiveProfileHttpRequestFixture,
  exportDataHttpRequestFixture,
  identityContextFixture,
  ingestEvidenceHttpRequestFixture,
  interactionEvidenceFixture,
  liveEvidenceProvenanceFixture,
  preferenceCandidateFixture,
  preferenceIdentityFixture,
  proposeCandidateCommandFixture,
  recordPolicyDecisionHttpRequestFixture,
  rejectCandidateCommandFixture,
  reportProjectionStatusCommandFixture,
  resetHttpRequestFixture,
  resetHttpResultFixture,
  revisePreferenceCommandFixture,
  revokePreferenceCommandFixture,
  suppressCandidateCommandFixture,
  updateConnectionSettingsCommandFixture,
} from '@companion-preference/contracts'
import {
  ActivePreferenceSlotOccupiedError,
  ActionPayloadConflictError,
  CandidateIdempotencyConflictError,
  InvalidTransitionError,
  RevisionConflictError,
} from '@companion-preference/preference-core'
import type { ServerType } from '@hono/node-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RuntimeUnavailableError } from './runtime-lifecycle.js'
import {
  createRuntimeHttpApp,
  createRuntimeNodeServerOptions,
  RESET_CONFIRMATION_PHRASE,
  RUNTIME_LOOPBACK_HOST,
  startRuntimeLoopbackServer,
} from './server.js'

const token = 't'.repeat(32)
const requestId = 'request-t10-1'
const identityQuery = new URLSearchParams(preferenceIdentityFixture).toString()
const identityContextQuery = new URLSearchParams(identityContextFixture).toString()

const authorized = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  return { ...init, headers }
}

const json = (value: unknown): string => JSON.stringify(value)

describe('T10 authenticated loopback runtime server', () => {
  let application: Record<string, ReturnType<typeof vi.fn>>
  let coordinator: {
    state: string
    execute: ReturnType<typeof vi.fn>
    resetAllData: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    application = {
      ingestEvidence: vi.fn(async () => ({ disposition: 'inserted', settingsRevision: 1 })),
      listCandidates: vi.fn(async () => [structuredClone(preferenceCandidateFixture)]),
      confirmCandidate: vi.fn(async () => structuredClone(activePreferenceRecordFixture)),
      proposeCandidate: vi.fn(async () => structuredClone(preferenceCandidateFixture)),
      rejectCandidate: vi.fn(async () => undefined),
      suppressCandidate: vi.fn(async () => undefined),
      deleteCandidate: vi.fn(async () => undefined),
      listActivePreferences: vi.fn(async () => [structuredClone(activePreferenceRecordFixture)]),
      createExplicitPreference: vi.fn(async () => structuredClone(activePreferenceRecordFixture)),
      revisePreference: vi.fn(async () => structuredClone(activePreferenceRecordFixture)),
      revokePreference: vi.fn(async () => structuredClone(activePreferenceRecordFixture)),
      getEffectiveProfile: vi.fn(async () => ({ guidance: {}, applied: [], excluded: [], conflicts: [], settingsRevision: 1 })),
      getConnectionSettings: vi.fn(async () => structuredClone(connectionSettingsFixture)),
      listConnectionSettings: vi.fn(async () => structuredClone(connectionListHttpResultFixture.connections)),
      updateConnectionSettings: vi.fn(async () => structuredClone(connectionSettingsFixture)),
      reportAdapterProjectionStatus: vi.fn(async () => structuredClone(adapterProjectionStatusFixture)),
      recordPolicyDecision: vi.fn(async () => undefined),
      listAuditEvents: vi.fn(async () => [structuredClone(auditEventFixture)]),
      exportData: vi.fn(async () => ({
        evidence: [structuredClone(liveEvidenceProvenanceFixture)],
        candidates: [structuredClone(preferenceCandidateFixture)],
        activePreferences: [structuredClone(activePreferenceRecordFixture)],
        connectionSettings: structuredClone(connectionSettingsFixture),
        auditEvents: [structuredClone(auditEventFixture)],
      })),
      deleteEvidence: vi.fn(async () => structuredClone(deleteEvidenceResultFixture)),
    }
    coordinator = {
      state: 'running',
      execute: vi.fn(async (operation: (value: typeof application) => unknown) => operation(application)),
      resetAllData: vi.fn(async () => undefined),
    }
  })

  const app = () => createRuntimeHttpApp({
    coordinator,
    token,
    allowedOrigins: ['http://127.0.0.1:5173'],
    requestIdFactory: () => requestId,
  })

  const fakeNodeServer = (result: 'listening' | 'error') => {
    let listening = false
    let errorListener: ((error: Error) => void) | undefined
    const server = {
      get listening() {
        return listening
      },
      once: vi.fn((event: string, listener: (error: Error) => void) => {
        if (event === 'error') errorListener = listener
        return server
      }),
      off: vi.fn((event: string, listener: (error: Error) => void) => {
        if (event === 'error' && errorListener === listener) errorListener = undefined
        return server
      }),
      listen: vi.fn((_port: number, _hostname: string, onListening: () => void) => {
        listening = true
        queueMicrotask(() => {
          if (result === 'listening') onListening()
          else errorListener?.(new Error('loopback bind failed'))
        })
        return server
      }),
      close: vi.fn((callback: (error?: Error) => void) => {
        listening = false
        queueMicrotask(() => callback())
        return server
      }),
    }
    return server
  }

  it('freezes a literal IPv4 loopback bind and explicit port', () => {
    expect(RUNTIME_LOOPBACK_HOST).toBe('127.0.0.1')
    const fetch = vi.fn()
    expect(createRuntimeNodeServerOptions({ fetch, port: 43_120 })).toEqual({
      fetch,
      hostname: '127.0.0.1',
      port: 43_120,
    })
  })

  it('starts explicitly on loopback and returns one idempotent stop operation', async () => {
    const server = fakeNodeServer('listening')
    const nodeServerFactory = vi.fn(() => server as unknown as ServerType)
    const handle = await startRuntimeLoopbackServer({
      coordinator,
      token,
      allowedOrigins: ['http://127.0.0.1:5173'],
      port: 43_120,
      nodeServerFactory,
      requestIdFactory: () => requestId,
    })

    expect(nodeServerFactory).toHaveBeenCalledWith(expect.objectContaining({
      fetch: expect.any(Function),
      hostname: '127.0.0.1',
      port: 43_120,
    }))
    expect(server.listen).toHaveBeenCalledWith(43_120, '127.0.0.1', expect.any(Function))
    expect(handle).toMatchObject({ hostname: '127.0.0.1', port: 43_120 })

    const firstStop = handle.stop()
    const replayedStop = handle.stop()
    expect(replayedStop).toBe(firstStop)
    await firstStop
    await handle.stop()
    expect(server.close).toHaveBeenCalledOnce()
  })

  it('closes a partially listening adapter before rejecting a failed start', async () => {
    const server = fakeNodeServer('error')
    const nodeServerFactory = vi.fn(() => server as unknown as ServerType)

    await expect(startRuntimeLoopbackServer({
      coordinator,
      token,
      allowedOrigins: [],
      port: 43_120,
      nodeServerFactory,
    })).rejects.toThrow('loopback bind failed')
    expect(server.close).toHaveBeenCalledOnce()
  })

  it('rejects an invalid explicit port before constructing a Node server', async () => {
    const nodeServerFactory = vi.fn()
    await expect(startRuntimeLoopbackServer({
      coordinator,
      token,
      allowedOrigins: [],
      port: 0,
      nodeServerFactory,
    })).rejects.toThrow('explicit valid port')
    expect(nodeServerFactory).not.toHaveBeenCalled()
  })

  it('authenticates health, rejects unapproved browser origins, and exposes no private data', async () => {
    const runtime = app()
    expect((await runtime.request('/health')).status).toBe(401)
    expect((await runtime.request('/health', {
      headers: { authorization: `Bearer ${'x'.repeat(32)}` },
    })).status).toBe(401)
    expect((await runtime.request('/health', authorized({
      headers: { origin: 'http://127.0.0.1:9999' },
    }))).status).toBe(403)

    const response = await runtime.request('/health', authorized())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      requestId,
      data: { apiVersion: 1, status: 'ok' },
    })
    expect(JSON.stringify(await (await runtime.request('/health', authorized())).json())).not.toMatch(
      /evidence|candidate|preference|identity|userId/i,
    )
  })

  it('strictly validates evidence and returns a governed 202 disposition', async () => {
    const runtime = app()
    const accepted = await runtime.request('/v1/evidence', authorized({
      method: 'POST',
      body: json(ingestEvidenceHttpRequestFixture),
    }))
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({
      ok: true,
      requestId,
      data: {
        evidenceId: interactionEvidenceFixture.id,
        disposition: 'accepted',
        settingsRevision: 1,
      },
    })
    expect(application.ingestEvidence).toHaveBeenCalledWith(interactionEvidenceFixture)

    const invalid = await runtime.request('/v1/evidence', authorized({
      method: 'POST',
      body: json({ ...ingestEvidenceHttpRequestFixture, composedMessage: 'private' }),
    }))
    expect(invalid.status).toBe(400)
    expect(application.ingestEvidence).toHaveBeenCalledTimes(1)

    application.ingestEvidence.mockResolvedValueOnce({
      disposition: 'discarded',
      reasonCode: 'observe-disabled',
      settingsRevision: 2,
    })
    const discarded = await runtime.request('/v1/evidence', authorized({
      method: 'POST',
      body: json(ingestEvidenceHttpRequestFixture),
    }))
    expect(discarded.status).toBe(202)
    expect(await discarded.json()).toMatchObject({
      data: { disposition: 'discarded', reasonCode: 'observe-disabled', settingsRevision: 2 },
    })
  })

  it('returns stable ETags and a bodyless 304 for an unchanged conditional read', async () => {
    const runtime = app()
    const first = await runtime.request(`/v1/candidates?${identityQuery}`, authorized())
    expect(first.status).toBe(200)
    const etag = first.headers.get('etag')
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/)
    expect(await first.json()).toMatchObject({ data: { candidates: [preferenceCandidateFixture] } })

    const unchanged = await runtime.request(`/v1/candidates?${identityQuery}`, authorized({
      headers: { 'if-none-match': etag! },
    }))
    expect(unchanged.status).toBe(304)
    expect(await unchanged.text()).toBe('')
    expect(unchanged.headers.get('etag')).toBe(etag)
  })

  it('replays action results, enforces path identity, and maps conflicts to 409', async () => {
    const runtime = app()
    const call = (command = confirmCandidateCommandFixture, pathId = command.candidateId) => runtime.request(
      `/v1/candidates/${pathId}/confirm`,
      authorized({ method: 'POST', body: json({ command }) }),
    )

    const first = await call()
    const replay = await call()
    expect(first.status).toBe(200)
    expect(await replay.json()).toEqual(await first.json())
    expect(application.confirmCandidate).toHaveBeenCalledTimes(2)

    expect((await call(confirmCandidateCommandFixture, 'different-candidate')).status).toBe(400)

    application.confirmCandidate.mockRejectedValueOnce(new RevisionConflictError(0, 2))
    const revision = await call()
    expect(revision.status).toBe(409)
    expect(await revision.json()).toMatchObject({
      error: { code: 'revision-conflict', retryable: false, currentRevision: 2 },
    })

    application.confirmCandidate.mockRejectedValueOnce(
      new ActionPayloadConflictError(confirmCandidateCommandFixture.actionId),
    )
    const action = await call()
    expect(action.status).toBe(409)
    expect(await action.json()).toMatchObject({
      error: { code: 'action-payload-conflict', retryable: false },
    })
  })

  it('freezes every remaining candidate and preference governance route', async () => {
    const runtime = app()
    const cases = [
      {
        method: 'POST',
        path: '/v1/candidates',
        command: proposeCandidateCommandFixture,
        status: 201,
        applicationMethod: 'proposeCandidate',
        result: { kind: 'candidate', actionId: proposeCandidateCommandFixture.actionId, candidate: preferenceCandidateFixture },
      },
      {
        method: 'POST',
        path: `/v1/candidates/${rejectCandidateCommandFixture.candidateId}/reject`,
        command: rejectCandidateCommandFixture,
        status: 200,
        applicationMethod: 'rejectCandidate',
        result: { kind: 'completed', actionId: rejectCandidateCommandFixture.actionId },
      },
      {
        method: 'POST',
        path: `/v1/candidates/${suppressCandidateCommandFixture.candidateId}/suppress`,
        command: suppressCandidateCommandFixture,
        status: 200,
        applicationMethod: 'suppressCandidate',
        result: { kind: 'completed', actionId: suppressCandidateCommandFixture.actionId },
      },
      {
        method: 'DELETE',
        path: `/v1/candidates/${deleteCandidateCommandFixture.candidateId}`,
        command: deleteCandidateCommandFixture,
        status: 200,
        applicationMethod: 'deleteCandidate',
        result: { kind: 'completed', actionId: deleteCandidateCommandFixture.actionId },
      },
      {
        method: 'POST',
        path: '/v1/preferences',
        command: createExplicitPreferenceCommandFixture,
        status: 201,
        applicationMethod: 'createExplicitPreference',
        result: { kind: 'preference', actionId: createExplicitPreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture },
      },
      {
        method: 'POST',
        path: `/v1/preferences/${revisePreferenceCommandFixture.preferenceId}/revise`,
        command: revisePreferenceCommandFixture,
        status: 200,
        applicationMethod: 'revisePreference',
        result: { kind: 'preference', actionId: revisePreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture },
      },
      {
        method: 'POST',
        path: `/v1/preferences/${revokePreferenceCommandFixture.preferenceId}/revoke`,
        command: revokePreferenceCommandFixture,
        status: 200,
        applicationMethod: 'revokePreference',
        result: { kind: 'preference', actionId: revokePreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture },
      },
    ] as const

    for (const testCase of cases) {
      const response = await runtime.request(testCase.path, authorized({
        method: testCase.method,
        body: json({ command: testCase.command }),
      }))
      expect(response.status, `${testCase.method} ${testCase.path}`).toBe(testCase.status)
      expect(await response.json()).toEqual({ ok: true, requestId, data: testCase.result })
      expect(application[testCase.applicationMethod]).toHaveBeenCalledWith(testCase.command)
    }

    for (const [path, command] of [
      ['/v1/candidates/different/reject', rejectCandidateCommandFixture],
      ['/v1/candidates/different/suppress', suppressCandidateCommandFixture],
      ['/v1/candidates/different', deleteCandidateCommandFixture],
      ['/v1/preferences/different/revise', revisePreferenceCommandFixture],
      ['/v1/preferences/different/revoke', revokePreferenceCommandFixture],
    ] as const) {
      expect((await runtime.request(path, authorized({
        method: path === '/v1/candidates/different' ? 'DELETE' : 'POST',
        body: json({ command }),
      }))).status).toBe(400)
    }
  })

  it('freezes profile, active-preference, connection, audit, and export reads', async () => {
    const runtime = app()

    const preferences = await runtime.request(`/v1/preferences?${identityContextQuery}`, authorized())
    expect(preferences.status).toBe(200)
    expect(await preferences.json()).toEqual({
      ok: true,
      requestId,
      data: { preferences: [activePreferenceRecordFixture] },
    })

    const effective = await runtime.request('/v1/profile/effective', authorized({
      method: 'POST',
      body: json(effectiveProfileHttpRequestFixture),
    }))
    expect(effective.status).toBe(200)
    expect(await effective.json()).toEqual({
      ok: true,
      requestId,
      data: { guidance: {}, settingsRevision: 1 },
    })
    expect(application.getEffectiveProfile).toHaveBeenCalledWith(effectiveProfileHttpRequestFixture.query)

    const connection = await runtime.request(
      `/v1/connections/${connectionSettingsFixture.hostId}?${identityQuery}`,
      authorized(),
    )
    expect(connection.status).toBe(200)
    expect(await connection.json()).toEqual({ ok: true, requestId, data: connectionSettingsFixture })
    expect(application.getConnectionSettings).toHaveBeenCalledWith(
      preferenceIdentityFixture,
      connectionSettingsFixture.hostId,
    )

    const connections = await runtime.request(`/v1/connections?${identityQuery}`, authorized())
    expect(connections.status).toBe(200)
    expect(await connections.json()).toEqual({
      ok: true,
      requestId,
      data: connectionListHttpResultFixture,
    })
    expect(application.listConnectionSettings).toHaveBeenCalledWith(preferenceIdentityFixture)

    for (const query of [
      new URLSearchParams({
        userId: preferenceIdentityFixture.userId,
        companionId: preferenceIdentityFixture.companionId,
      }).toString(),
      `${identityQuery}&hostId=private-host`,
      `${identityQuery}&userId=other-user`,
    ]) {
      expect((await runtime.request(`/v1/connections?${query}`, authorized())).status).toBe(400)
    }
    expect(application.listConnectionSettings).toHaveBeenCalledOnce()

    const audit = await runtime.request('/v1/audit/query', authorized({
      method: 'POST',
      body: json({ query: auditQueryFixture }),
    }))
    expect(audit.status).toBe(200)
    expect(await audit.json()).toEqual({ ok: true, requestId, data: { events: [auditEventFixture] } })

    const exported = await runtime.request('/v1/export', authorized({
      method: 'POST',
      body: json(exportDataHttpRequestFixture),
    }))
    expect(exported.status).toBe(200)
    const exportBody = await exported.json()
    expect(exportBody).toEqual({
      ok: true,
      requestId,
      data: {
        evidence: [liveEvidenceProvenanceFixture],
        candidates: [preferenceCandidateFixture],
        activePreferences: [activePreferenceRecordFixture],
        connectionSettings: connectionSettingsFixture,
        auditEvents: [auditEventFixture],
      },
    })
    expect(JSON.stringify(exportBody)).not.toMatch(/bearer|token/i)
  })

  it('freezes connection, projection, and evidence-delete mutations', async () => {
    const runtime = app()
    const cases = [
      {
        method: 'PATCH',
        path: `/v1/connections/${updateConnectionSettingsCommandFixture.hostId}`,
        body: { command: updateConnectionSettingsCommandFixture },
        applicationMethod: 'updateConnectionSettings',
        applicationArgument: updateConnectionSettingsCommandFixture,
        result: {
          kind: 'connection-settings',
          actionId: updateConnectionSettingsCommandFixture.actionId,
          settings: connectionSettingsFixture,
        },
      },
      {
        method: 'POST',
        path: `/v1/connections/${reportProjectionStatusCommandFixture.hostId}/projection-status`,
        body: { command: reportProjectionStatusCommandFixture },
        applicationMethod: 'reportAdapterProjectionStatus',
        applicationArgument: reportProjectionStatusCommandFixture,
        result: {
          kind: 'projection-status',
          actionId: reportProjectionStatusCommandFixture.actionId,
          projectionStatus: adapterProjectionStatusFixture,
        },
      },
      {
        method: 'DELETE',
        path: `/v1/evidence/${deleteEvidenceCommandFixture.evidenceId}`,
        body: { command: deleteEvidenceCommandFixture },
        applicationMethod: 'deleteEvidence',
        applicationArgument: deleteEvidenceCommandFixture,
        result: {
          kind: 'evidence-deletion',
          actionId: deleteEvidenceCommandFixture.actionId,
          result: deleteEvidenceResultFixture,
        },
      },
    ] as const

    for (const testCase of cases) {
      const response = await runtime.request(testCase.path, authorized({
        method: testCase.method,
        body: json(testCase.body),
      }))
      expect(response.status, `${testCase.method} ${testCase.path}`).toBe(200)
      expect(await response.json()).toEqual({ ok: true, requestId, data: testCase.result })
      expect(application[testCase.applicationMethod]).toHaveBeenCalledWith(testCase.applicationArgument)
    }

    const policyDecision = await runtime.request('/v1/policy-decisions', authorized({
      method: 'POST',
      body: json(recordPolicyDecisionHttpRequestFixture),
    }))
    expect(policyDecision.status).toBe(503)
    expect(await policyDecision.json()).toEqual({
      ok: false,
      requestId,
      error: {
        code: 'runtime-maintenance',
        message: 'The runtime is temporarily in maintenance mode',
        retryable: true,
      },
    })
    expect(application.recordPolicyDecision).not.toHaveBeenCalled()

    for (const [method, path, command] of [
      ['PATCH', '/v1/connections/different', updateConnectionSettingsCommandFixture],
      ['POST', '/v1/connections/different/projection-status', reportProjectionStatusCommandFixture],
      ['DELETE', '/v1/evidence/different', deleteEvidenceCommandFixture],
    ] as const) {
      expect((await runtime.request(path, authorized({ method, body: json({ command }) }))).status).toBe(400)
    }
  })

  it('maps maintenance and closed admission to content-free 503 responses', async () => {
    const runtime = app()
    for (const [runtimeCode, httpCode, retryable] of [
      ['RUNTIME_MAINTENANCE', 'runtime-maintenance', true],
      ['RUNTIME_CLOSED', 'runtime-closed', false],
    ] as const) {
      coordinator.execute.mockRejectedValueOnce(new RuntimeUnavailableError(runtimeCode))
      const response = await runtime.request(`/v1/candidates?${identityQuery}`, authorized())
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: { code: httpCode, retryable },
      })
    }

    const privateFailure = new Error('database contained private-learning-payload')
    coordinator.execute.mockRejectedValueOnce(privateFailure)
    const response = await runtime.request(`/v1/candidates?${identityQuery}`, authorized())
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('private-learning-payload')
  })

  it('maps all verified governance conflicts to closed content-free 409 codes', async () => {
    const runtime = app()
    const cases = [
      [
        'proposeCandidate',
        '/v1/candidates',
        proposeCandidateCommandFixture,
        new CandidateIdempotencyConflictError(),
        'candidate-idempotency-conflict',
      ],
      [
        'createExplicitPreference',
        '/v1/preferences',
        createExplicitPreferenceCommandFixture,
        new ActivePreferenceSlotOccupiedError(),
        'active-preference-conflict',
      ],
      [
        'rejectCandidate',
        `/v1/candidates/${rejectCandidateCommandFixture.candidateId}/reject`,
        rejectCandidateCommandFixture,
        new InvalidTransitionError('candidate-not-pending', 'private transition detail'),
        'invalid-transition',
      ],
      [
        'updateConnectionSettings',
        `/v1/connections/${updateConnectionSettingsCommandFixture.hostId}`,
        updateConnectionSettingsCommandFixture,
        new RevisionConflictError(4, 5),
        'settings-revision-conflict',
      ],
    ] as const

    for (const [applicationMethod, path, command, error, code] of cases) {
      application[applicationMethod].mockRejectedValueOnce(error)
      const response = await runtime.request(path, authorized({
        method: applicationMethod === 'updateConnectionSettings' ? 'PATCH' : 'POST',
        body: json({ command }),
      }))
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toMatchObject({ error: { code, retryable: false } })
      expect(JSON.stringify(body)).not.toContain('private transition detail')
      if (code === 'settings-revision-conflict') {
        expect(body).toMatchObject({ error: { currentRevision: 5 } })
      }
    }
  })

  it('requires the exact destructive reset phrase and delegates only to the coordinator', async () => {
    const runtime = app()
    for (const confirmation of ['', RESET_CONFIRMATION_PHRASE.toLowerCase(), `${RESET_CONFIRMATION_PHRASE} `]) {
      const response = await runtime.request('/v1/reset', authorized({
        method: 'POST',
        body: json({ confirmation }),
      }))
      expect(response.status).toBe(400)
    }
    expect((await runtime.request('/v1/reset', authorized({
      method: 'POST',
      body: json({ ...resetHttpRequestFixture, privateReason: 'private' }),
    }))).status).toBe(400)
    expect(coordinator.resetAllData).not.toHaveBeenCalled()

    const response = await runtime.request('/v1/reset', authorized({
      method: 'POST',
      body: json(resetHttpRequestFixture),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      requestId,
      data: resetHttpResultFixture,
    })
    expect(coordinator.resetAllData).toHaveBeenCalledOnce()
  })
})
