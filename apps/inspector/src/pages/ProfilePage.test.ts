// @vitest-environment happy-dom

import {
  activePreferenceRecordFixture,
  preferenceIdentityFixture,
  type GovernanceMutationHttpResult,
  type IdentityContext,
  type PreferenceListHttpResult,
  type RevisePreferenceCommand,
  type RevokePreferenceCommand,
} from '@companion-preference/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ProfilePage from './ProfilePage.vue'

const identity: IdentityContext = {
  ...preferenceIdentityFixture,
  hostId: 'reference-host',
  sessionId: 'inspector-session-1',
  domain: 'work',
}
const workRecord = {
  ...activePreferenceRecordFixture,
  id: 'preference-work-1',
  preference: { key: 'work.approval_style', value: 'risk_based' },
  scope: { kind: 'global' as const },
}
const companionRecord = {
  ...activePreferenceRecordFixture,
  id: 'preference-companion-1',
  preference: { key: 'companion.support_style', value: 'listen_first' },
}
type ProfileApi = {
  listPreferences: (identity: IdentityContext) => Promise<PreferenceListHttpResult>
  revisePreference: (command: RevisePreferenceCommand) => Promise<GovernanceMutationHttpResult>
  revokePreference: (command: RevokePreferenceCommand) => Promise<GovernanceMutationHttpResult>
}
const apiWith = (overrides: Partial<ProfileApi> = {}): ProfileApi => ({
  listPreferences: vi.fn(async () => ({ preferences: [workRecord, companionRecord] })),
  revisePreference: vi.fn(async () => ({ kind: 'preference', actionId: 'action-profile-1', preference: workRecord })),
  revokePreference: vi.fn(async () => ({ kind: 'preference', actionId: 'action-profile-1', preference: workRecord })),
  ...overrides,
})
const page = (api: ProfileApi) => mount(ProfilePage, {
  props: {
    identity,
    api,
    createActionId: () => 'action-profile-1',
    createPreferenceId: () => 'preference-replacement-1',
    now: () => '2026-08-24T10:00:00.000Z',
  },
})

describe('T12 Profile Inspector truth oracle', () => {
  it('requires a complete explicit identity context instead of fabricating host, session, or domain', () => {
    expect(() => mount(ProfilePage, {
      props: {
        api: apiWith(),
        createActionId: () => 'action-profile-1',
        createPreferenceId: () => 'preference-replacement-1',
        now: () => '2026-08-24T10:00:00.000Z',
      },
    })).toThrow()
  })

  it('shows only active records grouped by preference domain and scope with content-free evidence references', async () => {
    const wrapper = page(apiWith({ listPreferences: vi.fn(async () => ({
      preferences: [workRecord, companionRecord, { ...activePreferenceRecordFixture, status: 'revoked' as const }],
    })) }))
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-domain-work"]').text()).toContain('work.approval_style')
    expect(wrapper.get('[data-testid="profile-domain-companion"]').text()).toContain('companion.support_style')
    expect(wrapper.text()).toContain('global')
    expect(wrapper.text()).toContain('workspace: workspace-1')
    expect(wrapper.text()).toContain('user-confirmed')
    expect(wrapper.text()).toContain('Evidence: 1 (evidence-1)')
    expect(wrapper.text()).not.toContain('preference-1')
    expect(wrapper.text()).not.toMatch(/assistantText|userText|learningPayload/i)
  })

  it('does not optimistically remove a revoked preference and refreshes only after a transaction receipt', async () => {
    let resolve!: (value: GovernanceMutationHttpResult) => void
    const receipt = new Promise<GovernanceMutationHttpResult>(onResolve => { resolve = onResolve })
    const api = apiWith({ revokePreference: vi.fn(() => receipt) })
    const wrapper = page(api)
    await flushPromises()
    await wrapper.get('button[aria-label="Revoke preference-work-1"]').trigger('click')
    expect(wrapper.find('[data-preference-id="preference-work-1"]').exists()).toBe(true)
    resolve({ kind: 'preference', actionId: 'action-profile-1', preference: workRecord })
    await flushPromises()
    expect(api.listPreferences).toHaveBeenCalledTimes(2)
  })

  it('submits an atomic revision command and refreshes canonical records on conflict', async () => {
    const api = apiWith({ revisePreference: vi.fn(async () => { throw { status: 409, code: 'revision-conflict', rawBody: 'private profile conflict' } }) })
    const wrapper = page(api)
    await flushPromises()
    await wrapper.get('button[aria-label="Revise preference-work-1"]').trigger('click')
    await flushPromises()
    expect(api.revisePreference).toHaveBeenCalledWith(expect.objectContaining({
      actionId: 'action-profile-1', preferenceId: 'preference-work-1', expectedPreferenceRevision: 1,
      replacementPreferenceId: 'preference-replacement-1', occurredAt: '2026-08-24T10:00:00.000Z',
    }))
    expect(api.listPreferences).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="status"]').text()).toBe('Profile changed elsewhere; refreshed current data.')
    expect(wrapper.text()).not.toContain('private profile conflict')
  })
})
