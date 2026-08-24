import {
  acceptedIngestEvidenceHttpResultFixture,
  activePreferenceRecordFixture,
  adapterProjectionStatusFixture,
  auditEventFixture,
  auditQueryFixture,
  confirmCandidateCommandFixture,
  connectionListHttpRequestFixture,
  connectionListHttpResultFixture,
  connectionSettingsFixture,
  contentFreePolicyDecisionFixture,
  createExplicitPreferenceCommandFixture,
  deleteCandidateCommandFixture,
  deleteEvidenceCommandFixture,
  deleteEvidenceResultFixture,
  effectiveProfileHttpRequestFixture,
  exportDataHttpRequestFixture,
  ingestEvidenceHttpRequestFixture,
  liveEvidenceProvenanceFixture,
  preferenceCandidateFixture,
  preferenceIdentityFixture,
  preferenceListHttpRequestFixture,
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
  type AuditHttpRequest,
  type AuditHttpResult,
  type ConnectionSettings,
  type ConnectionSettingsHttpRequest,
  type ConnectionListHttpRequest,
  type ConnectionListHttpResult,
  type CreateExplicitPreferenceCommand,
  type DeleteCandidateCommand,
  type DeleteEvidenceCommand,
  type EffectiveProfileHttpRequest,
  type EffectiveProfileHttpResult,
  type ExportDataHttpRequest,
  type GovernanceMutationHttpResult,
  type PreferenceDataExportHttpResult,
  type PreferenceListHttpRequest,
  type PreferenceListHttpResult,
  type ProposeCandidateCommand,
  type RecordPolicyDecisionHttpRequest,
  type RejectCandidateCommand,
  type ReportProjectionStatusCommand,
  type ResetHttpRequest,
  type RevisePreferenceCommand,
  type RevokePreferenceCommand,
  type SuppressCandidateCommand,
  type UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type DeepReadonly,
  RuntimeClient,
  RuntimeClientError,
  RuntimeClientProtocolError,
} from './client.js'

type RemainingRuntimeClientSurface = {
  proposeCandidate(command: DeepReadonly<ProposeCandidateCommand>): Promise<GovernanceMutationHttpResult>
  rejectCandidate(command: DeepReadonly<RejectCandidateCommand>): Promise<GovernanceMutationHttpResult>
  suppressCandidate(command: DeepReadonly<SuppressCandidateCommand>): Promise<GovernanceMutationHttpResult>
  deleteCandidate(command: DeepReadonly<DeleteCandidateCommand>): Promise<GovernanceMutationHttpResult>
  listPreferences(request: DeepReadonly<PreferenceListHttpRequest>): Promise<PreferenceListHttpResult>
  createExplicitPreference(command: DeepReadonly<CreateExplicitPreferenceCommand>): Promise<GovernanceMutationHttpResult>
  revisePreference(command: DeepReadonly<RevisePreferenceCommand>): Promise<GovernanceMutationHttpResult>
  revokePreference(command: DeepReadonly<RevokePreferenceCommand>): Promise<GovernanceMutationHttpResult>
  getEffectiveProfile(request: DeepReadonly<EffectiveProfileHttpRequest>): Promise<EffectiveProfileHttpResult>
  getConnectionSettings(request: DeepReadonly<ConnectionSettingsHttpRequest>): Promise<ConnectionSettings>
  listConnections(request: DeepReadonly<ConnectionListHttpRequest>): Promise<ConnectionListHttpResult>
  updateConnectionSettings(command: DeepReadonly<UpdateConnectionSettingsCommand>): Promise<GovernanceMutationHttpResult>
  reportProjectionStatus(command: DeepReadonly<ReportProjectionStatusCommand>): Promise<GovernanceMutationHttpResult>
  recordPolicyDecision(request: DeepReadonly<RecordPolicyDecisionHttpRequest>): Promise<GovernanceMutationHttpResult>
  listAuditEvents(request: DeepReadonly<AuditHttpRequest>): Promise<AuditHttpResult>
  exportData(request: DeepReadonly<ExportDataHttpRequest>): Promise<PreferenceDataExportHttpResult>
  deleteEvidence(command: DeepReadonly<DeleteEvidenceCommand>): Promise<GovernanceMutationHttpResult>
}

const remainingSurface = (client: RuntimeClient): RuntimeClient & RemainingRuntimeClientSurface => (
  client as RuntimeClient & RemainingRuntimeClientSurface
)

const token = 't'.repeat(32)
const baseUrl = 'http://127.0.0.1:43120'

const response = (data: unknown, status = 200, headers: HeadersInit = {}): Response => new Response(
  status === 304 ? null : JSON.stringify(data),
  { status, headers: { ...(status === 304 ? {} : { 'content-type': 'application/json' }), ...headers } },
)

const success = (data: unknown) => ({ ok: true, requestId: 'request-client-1', data })

describe('T10 host-neutral runtime client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('accepts only an explicit literal-loopback base URL and token', () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    expect(() => new RuntimeClient({ baseUrl, token, fetch })).not.toThrow()
    for (const invalidBaseUrl of [
      'http://localhost:43120',
      'http://[::1]:43120',
      'https://127.0.0.1:43120',
      'http://127.0.0.1',
      'http://127.0.0.1:43120/path',
      'http://127.0.0.1:43120?token=secret',
      'http://user:pass@127.0.0.1:43120',
      'http://192.168.1.2:43120',
    ]) {
      expect(() => new RuntimeClient({ baseUrl: invalidBaseUrl, token, fetch })).toThrow()
    }
    expect(() => new RuntimeClient({ baseUrl, token: 'short', fetch })).toThrow()
  })

  it('sends credentials only in Authorization and never consults persistent browser storage', async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(success({ apiVersion: 1, status: 'ok' })))
    const client = new RuntimeClient({ baseUrl, token, fetch })

    await expect(client.health()).resolves.toEqual({ apiVersion: 1, status: 'ok' })
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()

    const [input, init] = fetch.mock.calls[0]!
    expect(String(input)).toBe(`${baseUrl}/health`)
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error' })
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`)
    expect(String(init?.body ?? '')).not.toContain(token)
    expect(String(input)).not.toContain(token)
  })

  it('uses frozen evidence and action routes with strict request envelopes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(success(acceptedIngestEvidenceHttpResultFixture), 202))
      .mockResolvedValueOnce(response(success({
        kind: 'preference',
        actionId: confirmCandidateCommandFixture.actionId,
        preference: activePreferenceRecordFixture,
      })))
    const client = new RuntimeClient({ baseUrl, token, fetch })

    await expect(client.ingestEvidence(ingestEvidenceHttpRequestFixture)).resolves.toEqual(
      acceptedIngestEvidenceHttpResultFixture,
    )
    await expect(client.confirmCandidate(confirmCandidateCommandFixture)).resolves.toMatchObject({
      kind: 'preference',
      actionId: confirmCandidateCommandFixture.actionId,
      preference: activePreferenceRecordFixture,
    })

    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${baseUrl}/v1/evidence`)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(ingestEvidenceHttpRequestFixture)
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      `${baseUrl}/v1/candidates/${confirmCandidateCommandFixture.candidateId}/confirm`,
    )
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      command: confirmCandidateCommandFixture,
    })
  })

  it('freezes the remaining candidate and preference client surface', async () => {
    const candidateResults = [
      { kind: 'candidate', actionId: proposeCandidateCommandFixture.actionId, candidate: preferenceCandidateFixture },
      { kind: 'completed', actionId: rejectCandidateCommandFixture.actionId },
      { kind: 'completed', actionId: suppressCandidateCommandFixture.actionId },
      { kind: 'completed', actionId: deleteCandidateCommandFixture.actionId },
    ] as const
    const preferenceResults = [
      { preferences: [activePreferenceRecordFixture] },
      { kind: 'preference', actionId: createExplicitPreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture },
      { kind: 'preference', actionId: revisePreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture },
      { kind: 'preference', actionId: revokePreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture },
    ] as const
    const fetch = vi.fn<typeof globalThis.fetch>()
    for (const [index, result] of [...candidateResults, ...preferenceResults].entries()) {
      fetch.mockResolvedValueOnce(response(success(result), index === 0 || index === 5 ? 201 : 200))
    }
    const client = remainingSurface(new RuntimeClient({ baseUrl, token, fetch }))

    await expect(client.proposeCandidate(proposeCandidateCommandFixture)).resolves.toEqual(candidateResults[0])
    await expect(client.rejectCandidate(rejectCandidateCommandFixture)).resolves.toEqual(candidateResults[1])
    await expect(client.suppressCandidate(suppressCandidateCommandFixture)).resolves.toEqual(candidateResults[2])
    await expect(client.deleteCandidate(deleteCandidateCommandFixture)).resolves.toEqual(candidateResults[3])
    await expect(client.listPreferences(preferenceListHttpRequestFixture)).resolves.toEqual(preferenceResults[0])
    await expect(client.createExplicitPreference(createExplicitPreferenceCommandFixture)).resolves.toEqual(preferenceResults[1])
    await expect(client.revisePreference(revisePreferenceCommandFixture)).resolves.toEqual(preferenceResults[2])
    await expect(client.revokePreference(revokePreferenceCommandFixture)).resolves.toEqual(preferenceResults[3])

    expect(fetch.mock.calls.map(call => [
      call[1]?.method,
      String(call[0]).replace(baseUrl, ''),
    ])).toEqual([
      ['POST', '/v1/candidates'],
      ['POST', `/v1/candidates/${rejectCandidateCommandFixture.candidateId}/reject`],
      ['POST', `/v1/candidates/${suppressCandidateCommandFixture.candidateId}/suppress`],
      ['DELETE', `/v1/candidates/${deleteCandidateCommandFixture.candidateId}`],
      ['GET', `/v1/preferences?${new URLSearchParams(preferenceListHttpRequestFixture.identity).toString()}`],
      ['POST', '/v1/preferences'],
      ['POST', `/v1/preferences/${revisePreferenceCommandFixture.preferenceId}/revise`],
      ['POST', `/v1/preferences/${revokePreferenceCommandFixture.preferenceId}/revoke`],
    ])
    for (const index of [0, 1, 2, 3, 5, 6, 7]) {
      expect(JSON.parse(String(fetch.mock.calls[index]?.[1]?.body))).toEqual({
        command: [
          proposeCandidateCommandFixture,
          rejectCandidateCommandFixture,
          suppressCandidateCommandFixture,
          deleteCandidateCommandFixture,
          undefined,
          createExplicitPreferenceCommandFixture,
          revisePreferenceCommandFixture,
          revokePreferenceCommandFixture,
        ][index],
      })
    }
  })

  it('freezes profile, connection, audit, export, policy, and erasure methods', async () => {
    const exportResult = {
      evidence: [liveEvidenceProvenanceFixture],
      candidates: [preferenceCandidateFixture],
      activePreferences: [activePreferenceRecordFixture],
      connectionSettings: connectionSettingsFixture,
      auditEvents: [auditEventFixture],
    }
    const mutationResults = [
      {
        kind: 'connection-settings',
        actionId: updateConnectionSettingsCommandFixture.actionId,
        settings: connectionSettingsFixture,
      },
      {
        kind: 'projection-status',
        actionId: reportProjectionStatusCommandFixture.actionId,
        projectionStatus: adapterProjectionStatusFixture,
      },
      {
        kind: 'evidence-deletion',
        actionId: deleteEvidenceCommandFixture.actionId,
        result: deleteEvidenceResultFixture,
      },
    ] as const
    const policyUnavailable = {
      ok: false,
      requestId: 'request-client-policy-unavailable',
      error: {
        code: 'runtime-maintenance',
        message: 'The runtime is temporarily in maintenance mode',
        retryable: true,
      },
    } as const
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(success({ guidance: {}, settingsRevision: 1 })))
      .mockResolvedValueOnce(response(success(connectionSettingsFixture)))
      .mockResolvedValueOnce(response(success(mutationResults[0])))
      .mockResolvedValueOnce(response(success(mutationResults[1])))
      .mockResolvedValueOnce(response(policyUnavailable, 503))
      .mockResolvedValueOnce(response(success({ events: [auditEventFixture] })))
      .mockResolvedValueOnce(response(success(exportResult)))
      .mockResolvedValueOnce(response(success(mutationResults[2])))
    const client = remainingSurface(new RuntimeClient({ baseUrl, token, fetch }))

    await expect(client.getEffectiveProfile(effectiveProfileHttpRequestFixture)).resolves.toEqual({
      guidance: {},
      settingsRevision: 1,
    })
    await expect(client.getConnectionSettings({
      identity: preferenceIdentityFixture,
      hostId: connectionSettingsFixture.hostId,
    })).resolves.toEqual(connectionSettingsFixture)
    await expect(client.updateConnectionSettings(updateConnectionSettingsCommandFixture)).resolves.toEqual(mutationResults[0])
    await expect(client.reportProjectionStatus(reportProjectionStatusCommandFixture)).resolves.toEqual(mutationResults[1])
    await expect(client.recordPolicyDecision(recordPolicyDecisionHttpRequestFixture)).rejects.toMatchObject({
      status: 503,
      code: 'runtime-maintenance',
      retryable: true,
    })
    await expect(client.listAuditEvents({ query: auditQueryFixture })).resolves.toEqual({ events: [auditEventFixture] })
    await expect(client.exportData(exportDataHttpRequestFixture)).resolves.toEqual(exportResult)
    await expect(client.deleteEvidence(deleteEvidenceCommandFixture)).resolves.toEqual(mutationResults[2])

    expect(fetch.mock.calls.map(call => [call[1]?.method, String(call[0]).replace(baseUrl, '')])).toEqual([
      ['POST', '/v1/profile/effective'],
      ['GET', `/v1/connections/${connectionSettingsFixture.hostId}?${new URLSearchParams(preferenceIdentityFixture).toString()}`],
      ['PATCH', `/v1/connections/${connectionSettingsFixture.hostId}`],
      ['POST', `/v1/connections/${connectionSettingsFixture.hostId}/projection-status`],
      ['POST', '/v1/policy-decisions'],
      ['POST', '/v1/audit/query'],
      ['POST', '/v1/export'],
      ['DELETE', `/v1/evidence/${deleteEvidenceCommandFixture.evidenceId}`],
    ])
    expect(JSON.parse(String(fetch.mock.calls[4]?.[1]?.body))).toEqual(recordPolicyDecisionHttpRequestFixture)
    expect(JSON.parse(String(fetch.mock.calls[7]?.[1]?.body))).toEqual({ command: deleteEvidenceCommandFixture })
    for (const [input, init] of fetch.mock.calls) {
      expect(String(input)).not.toContain(token)
      expect(String(init?.body ?? '')).not.toContain(token)
    }
    expect(JSON.stringify(contentFreePolicyDecisionFixture)).not.toMatch(/learningPayload|composedMessage/i)
  })

  it('lists canonical connections for one strict readonly identity', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(success(connectionListHttpResultFixture)))
    const client = remainingSurface(new RuntimeClient({ baseUrl, token, fetch }))
    const request = structuredClone(connectionListHttpRequestFixture)
    Object.freeze(request.identity)
    Object.freeze(request)

    await expect(client.listConnections(request)).resolves.toEqual(
      connectionListHttpResultFixture,
    )
    expect(request).toEqual(connectionListHttpRequestFixture)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET')
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      `${baseUrl}/v1/connections?${new URLSearchParams(preferenceIdentityFixture).toString()}`,
    )
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(`Bearer ${token}`)
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain(token)

    await expect(client.listConnections({
      ...connectionListHttpRequestFixture,
      bearerToken: 'must-not-be-sent',
    } as never)).rejects.toBeInstanceOf(RuntimeClientProtocolError)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('supports ETag polling and treats 304 as a bodyless typed result', async () => {
    const etag = `"${'a'.repeat(64)}"`
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(success({ candidates: [preferenceCandidateFixture] }), 200, { etag }))
      .mockResolvedValueOnce(response(undefined, 304, { etag }))
    const client = new RuntimeClient({ baseUrl, token, fetch })

    await expect(client.listCandidates({
      identity: preferenceIdentityFixture,
      statuses: ['pending_confirmation'] as const,
    })).resolves.toEqual({
      notModified: false,
      data: { candidates: [preferenceCandidateFixture] },
      etag,
    })
    await expect(client.listCandidates(
      { identity: preferenceIdentityFixture },
      { etag },
    )).resolves.toEqual({ notModified: true, etag })
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('if-none-match')).toBe(etag)
  })

  it('sends an exact readonly destructive reset request and validates the minimal result', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(success(resetHttpResultFixture)))
    const client = new RuntimeClient({ baseUrl, token, fetch })

    await expect(client.reset(resetHttpRequestFixture)).resolves.toEqual(resetHttpResultFixture)
    expect(fetch).toHaveBeenCalledOnce()
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${baseUrl}/v1/reset`)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(resetHttpRequestFixture)

    for (const invalid of [
      { confirmation: resetHttpRequestFixture.confirmation.toLowerCase() },
      { ...resetHttpRequestFixture, privateReason: 'private' },
    ]) {
      await expect(client.reset(
        invalid as unknown as DeepReadonly<ResetHttpRequest>,
      )).rejects.toBeInstanceOf(RuntimeClientProtocolError)
    }
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('validates success/error responses and never logs or exposes raw bodies', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const secret = 'private-learning-payload'
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ ok: true, requestId: 'r', data: { status: 'ok', apiVersion: 1, secret } }))
      .mockResolvedValueOnce(response({
        ok: false,
        requestId: 'r2',
        error: {
          code: 'revision-conflict',
          message: 'The expected revision is stale.',
          retryable: false,
          currentRevision: 2,
        },
      }, 409))
      .mockResolvedValueOnce(new Response(secret, { status: 500 }))
    const client = new RuntimeClient({ baseUrl, token, fetch })

    const malformed = await client.health().catch(error => error)
    expect(malformed).toBeInstanceOf(RuntimeClientProtocolError)
    expect(String(malformed)).not.toContain(secret)

    const conflict = await client.confirmCandidate(confirmCandidateCommandFixture).catch(error => error)
    expect(conflict).toBeInstanceOf(RuntimeClientError)
    expect(conflict).toMatchObject({
      status: 409,
      code: 'revision-conflict',
      retryable: false,
      currentRevision: 2,
    })

    const invalidBody = await client.health().catch(error => error)
    expect(invalidBody).toBeInstanceOf(RuntimeClientProtocolError)
    expect(String(invalidBody)).not.toContain(secret)
    expect(consoleLog).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })
})
