// @vitest-environment happy-dom

import {
  activePreferenceRecordFixture,
  preferenceCandidateFixture,
  preferenceIdentityFixture,
  type CandidateListHttpResult,
  type ConfirmCandidateCommand,
  type GovernanceMutationHttpResult,
  type IdentityContext,
  type PreferenceListHttpResult,
  type RejectCandidateCommand,
  type SuppressCandidateCommand,
} from '@companion-preference/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PendingPage from './PendingPage.vue'

type PendingApi = {
  listCandidates: () => Promise<CandidateListHttpResult>
  listPreferences: (identity: IdentityContext) => Promise<PreferenceListHttpResult>
  confirmCandidate: (command: ConfirmCandidateCommand) => Promise<GovernanceMutationHttpResult>
  rejectCandidate: (command: RejectCandidateCommand) => Promise<GovernanceMutationHttpResult>
  suppressCandidate: (command: SuppressCandidateCommand) => Promise<GovernanceMutationHttpResult>
}

const identityContext: IdentityContext = {
  ...preferenceIdentityFixture,
  hostId: 'reference-host',
  sessionId: 'inspector-session-1',
  domain: 'work',
}
const now = '2026-08-24T10:00:00.000Z'
const apiWith = (overrides: Partial<PendingApi> = {}): PendingApi => ({
  listCandidates: vi.fn(async () => ({ candidates: [preferenceCandidateFixture] })),
  listPreferences: vi.fn(async () => ({ preferences: [activePreferenceRecordFixture] })),
  confirmCandidate: vi.fn(async () => ({ kind: 'preference', actionId: 'action-1', preference: activePreferenceRecordFixture })),
  rejectCandidate: vi.fn(async () => ({ kind: 'completed', actionId: 'action-1' })),
  suppressCandidate: vi.fn(async () => ({ kind: 'completed', actionId: 'action-1' })),
  ...overrides,
})
const page = (api: PendingApi) => mount(PendingPage, {
  props: {
    identity: preferenceIdentityFixture,
    profileIdentity: identityContext,
    api,
    createActionId: () => 'action-1',
    createPreferenceId: () => 'preference-created-1',
    createSuppressionId: () => 'suppression-1',
    now: () => now,
    pollIntervalMs: 1_000,
  },
})

describe('T12 Pending Inspector truth oracle', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps loading, empty, and typed runtime-error states separate', async () => {
    const pending = new Promise<CandidateListHttpResult>(() => undefined)
    const loading = page(apiWith({ listCandidates: vi.fn(() => pending) }))
    expect(loading.get('[data-testid="pending-loading"]').text()).toBe('Loading pending candidates…')

    const empty = page(apiWith({ listCandidates: vi.fn(async () => ({ candidates: [] })) }))
    await flushPromises()
    expect(empty.get('[data-testid="pending-empty"]').text()).toBe('No pending candidates')

    const secret = 'raw evidence payload must not surface'
    const failure = page(apiWith({ listCandidates: vi.fn(async () => { throw { status: 503, code: 'runtime-closed', rawBody: secret } }) }))
    await flushPromises()
    expect(failure.get('[role="alert"]').text()).toBe('Runtime unavailable (503: runtime-closed)')
    expect(failure.text()).not.toContain(secret)
  })

  it('polls only while the Pending page is visible', async () => {
    vi.useFakeTimers()
    const api = apiWith()
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const wrapper = page(api)
    await flushPromises()
    expect(api.listCandidates).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(api.listCandidates).toHaveBeenCalledTimes(2)
    visible.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(api.listCandidates).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('waits for a confirm receipt, then refreshes both canonical pending and active profile data', async () => {
    let resolve!: (value: GovernanceMutationHttpResult) => void
    const receipt = new Promise<GovernanceMutationHttpResult>(onResolve => { resolve = onResolve })
    const api = apiWith({ confirmCandidate: vi.fn(() => receipt) })
    const wrapper = page(api)
    await flushPromises()
    await wrapper.get(`button[aria-label="Confirm ${preferenceCandidateFixture.id}"]`).trigger('click')

    expect(api.confirmCandidate).toHaveBeenCalledWith(expect.objectContaining({
      actionId: 'action-1', candidateId: preferenceCandidateFixture.id,
      expectedCandidateRevision: preferenceCandidateFixture.revision,
      preferenceId: 'preference-created-1', occurredAt: now,
    }))
    expect(wrapper.find(`[data-candidate-id="${preferenceCandidateFixture.id}"]`).exists()).toBe(true)
    resolve({ kind: 'preference', actionId: 'action-1', preference: activePreferenceRecordFixture })
    await flushPromises()
    expect(api.listCandidates).toHaveBeenCalledTimes(2)
    expect(api.listPreferences).toHaveBeenCalledWith(identityContext)
  })

  it('refreshes canonical state on revision conflict without exposing error detail', async () => {
    const secret = 'stale raw candidate detail'
    const api = apiWith({ confirmCandidate: vi.fn(async () => { throw { status: 409, code: 'revision-conflict', rawBody: secret } }) })
    const wrapper = page(api)
    await flushPromises()
    await wrapper.get(`button[aria-label="Confirm ${preferenceCandidateFixture.id}"]`).trigger('click')
    await flushPromises()
    expect(api.listCandidates).toHaveBeenCalledTimes(2)
    expect(api.listPreferences).toHaveBeenCalledWith(identityContext)
    expect(wrapper.get('[role="status"]').text()).toBe('Candidate changed elsewhere; refreshed current data.')
    expect(wrapper.text()).not.toContain(secret)
  })

  it('submits content-free reject and suppression commands with the candidate revision', async () => {
    const api = apiWith()
    const wrapper = page(api)
    await flushPromises()
    await wrapper.get(`button[aria-label="Reject ${preferenceCandidateFixture.id}"]`).trigger('click')
    await wrapper.get(`button[aria-label="Suppress similar ${preferenceCandidateFixture.id}"]`).trigger('click')
    expect(api.rejectCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidateId: preferenceCandidateFixture.id, expectedCandidateRevision: 0, actionId: 'action-1', occurredAt: now }))
    expect(api.suppressCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidateId: preferenceCandidateFixture.id, expectedCandidateRevision: 0, suppressionId: 'suppression-1', actionId: 'action-1', occurredAt: now }))
  })

  it('builds edited-preference and changed-scope confirmations from the pending revision', async () => {
    const api = apiWith()
    const wrapper = page(api)
    await flushPromises()
    await wrapper.get(`button[aria-label="Edit and confirm ${preferenceCandidateFixture.id}"]`).trigger('click')
    await wrapper.get(`button[aria-label="Change scope and confirm ${preferenceCandidateFixture.id}"]`).trigger('click')

    expect(api.confirmCandidate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      candidateId: preferenceCandidateFixture.id,
      expectedCandidateRevision: preferenceCandidateFixture.revision,
      preference: { key: 'interaction.response_detail', value: 'detailed' },
      scope: preferenceCandidateFixture.scope,
    }))
    expect(api.confirmCandidate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      candidateId: preferenceCandidateFixture.id,
      expectedCandidateRevision: preferenceCandidateFixture.revision,
      preference: preferenceCandidateFixture.preference,
      scope: { kind: 'global' },
    }))
  })
})
