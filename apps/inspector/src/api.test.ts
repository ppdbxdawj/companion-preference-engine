// @vitest-environment happy-dom

import {
  activePreferenceRecordFixture,
  confirmCandidateCommandFixture,
  preferenceCandidateFixture,
  preferenceListHttpRequestFixture,
  rejectCandidateCommandFixture,
  revisePreferenceCommandFixture,
  suppressCandidateCommandFixture,
  connectionListHttpRequestFixture,
  connectionListHttpResultFixture,
  connectionSettingsFixture,
} from '@companion-preference/contracts'
import { describe, expect, it, vi } from 'vitest'

import { createInspectorConnectionsApi } from './api.js'

type T12InspectorApi = ReturnType<typeof createInspectorConnectionsApi> & {
  listCandidates: (request: { identity: typeof preferenceCandidateFixture.identity, statuses: ['pending_confirmation'] }) => Promise<{ candidates: [typeof preferenceCandidateFixture] }>
  confirmCandidate: (command: typeof confirmCandidateCommandFixture) => Promise<unknown>
  rejectCandidate: (command: typeof rejectCandidateCommandFixture) => Promise<unknown>
  suppressCandidate: (command: typeof suppressCandidateCommandFixture) => Promise<unknown>
  listPreferences: (request: typeof preferenceListHttpRequestFixture) => Promise<{ preferences: [typeof activePreferenceRecordFixture] }>
  revisePreference: (command: typeof revisePreferenceCommandFixture) => Promise<unknown>
  revokePreference: (command: { readonly actionId: string }) => Promise<unknown>
}

const t12Api = (api: ReturnType<typeof createInspectorConnectionsApi>): T12InspectorApi => (
  api as T12InspectorApi
)

const success = (data: unknown) => ({ ok: true, requestId: 'inspector-request-1', data })

const response = (data: unknown): Response => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json' },
})

describe('Inspector same-origin API boundary', () => {
  it('uses an unauthenticated browser request and omits browser credentials', async () => {
    const requestFetch = vi.fn<typeof globalThis.fetch>(async () => (
      response(success(connectionListHttpResultFixture))
    ))
    const api = createInspectorConnectionsApi(requestFetch)

    await expect(api.listConnections(connectionListHttpRequestFixture)).resolves.toEqual(
      connectionListHttpResultFixture,
    )
    expect(requestFetch).toHaveBeenCalledWith(
      `/api/v1/connections?${new URLSearchParams(connectionListHttpRequestFixture.identity).toString()}`,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'omit',
      },
    )
    expect(new Headers(requestFetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBeNull()
  })

  it('omits browser credentials on revision-fenced settings updates', async () => {
    const requestFetch = vi.fn<typeof globalThis.fetch>(async () => response(success({
      kind: 'connection-settings',
      actionId: 'action-inspector-update-1',
      settings: connectionSettingsFixture,
    })))
    const api = createInspectorConnectionsApi(requestFetch)
    const command = {
      actionId: 'action-inspector-update-1',
      identity: connectionListHttpRequestFixture.identity,
      hostId: connectionSettingsFixture.hostId,
      expectedSettingsRevision: connectionSettingsFixture.revision,
      patch: { observeEnabled: true },
      occurredAt: '2026-08-24T10:00:00.000Z',
    } as const

    await api.updateConnectionSettings(command)
    expect(requestFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      credentials: 'omit',
    })
    expect(new Headers(requestFetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBeNull()
  })

  it('freezes same-origin, content-free candidate and active-profile wrappers', async () => {
    const requestFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(success({ candidates: [preferenceCandidateFixture] })))
      .mockResolvedValueOnce(response(success({ kind: 'preference', actionId: confirmCandidateCommandFixture.actionId, preference: activePreferenceRecordFixture })))
      .mockResolvedValueOnce(response(success({ kind: 'completed', actionId: rejectCandidateCommandFixture.actionId })))
      .mockResolvedValueOnce(response(success({ kind: 'completed', actionId: suppressCandidateCommandFixture.actionId })))
      .mockResolvedValueOnce(response(success({ preferences: [activePreferenceRecordFixture] })))
      .mockResolvedValueOnce(response(success({ kind: 'preference', actionId: revisePreferenceCommandFixture.actionId, preference: activePreferenceRecordFixture })))
    const api = t12Api(createInspectorConnectionsApi(requestFetch))

    await api.listCandidates({ identity: preferenceCandidateFixture.identity, statuses: ['pending_confirmation'] })
    await api.confirmCandidate(confirmCandidateCommandFixture)
    await api.rejectCandidate(rejectCandidateCommandFixture)
    await api.suppressCandidate(suppressCandidateCommandFixture)
    await api.listPreferences(preferenceListHttpRequestFixture)
    await api.revisePreference(revisePreferenceCommandFixture)

    expect(requestFetch.mock.calls.map(([input, init]) => [String(input), init?.method, init?.credentials])).toEqual([
      [`/api/v1/candidates?${new URLSearchParams({ ...preferenceCandidateFixture.identity, statuses: 'pending_confirmation' }).toString()}`, 'GET', 'omit'],
      [`/api/v1/candidates/${preferenceCandidateFixture.id}/confirm`, 'POST', 'omit'],
      [`/api/v1/candidates/${preferenceCandidateFixture.id}/reject`, 'POST', 'omit'],
      [`/api/v1/candidates/${preferenceCandidateFixture.id}/suppress`, 'POST', 'omit'],
      [`/api/v1/preferences?${new URLSearchParams(preferenceListHttpRequestFixture.identity).toString()}`, 'GET', 'omit'],
      [`/api/v1/preferences/${activePreferenceRecordFixture.id}/revise`, 'POST', 'omit'],
    ])
    for (const [, init] of requestFetch.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBeNull()
    }
  })
})
