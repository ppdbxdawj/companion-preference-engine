// @vitest-environment happy-dom

import {
  adapterProjectionStatusFixture,
  airiConnectionSettingsFixture,
  connectionListHttpResultFixture,
  connectionSettingsFixture,
  preferenceIdentityFixture,
  type ConnectionListHttpRequest,
  type ConnectionListHttpResult,
  type ConnectionSettings,
  type GovernanceMutationHttpResult,
  type UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ConnectionsPage from './ConnectionsPage.vue'

type InspectorConnectionsApi = {
  listConnections(request: ConnectionListHttpRequest): Promise<ConnectionListHttpResult>
  updateConnectionSettings(command: UpdateConnectionSettingsCommand): Promise<GovernanceMutationHttpResult>
}

type Deferred<T> = {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const actionId = 'inspector-action-1'
const occurredAt = '2026-08-24T10:00:00.000Z'

const page = (api: InspectorConnectionsApi) => mount(ConnectionsPage, {
  props: {
    identity: preferenceIdentityFixture,
    api,
    createActionId: () => actionId,
    now: () => occurredAt,
  },
})

const apiWith = (
  listConnections: InspectorConnectionsApi['listConnections'],
  updateConnectionSettings: InspectorConnectionsApi['updateConnectionSettings'] = vi.fn(),
): InspectorConnectionsApi => ({ listConnections, updateConnectionSettings })

const updatedSettingsResult = (
  settings: ConnectionSettings,
): GovernanceMutationHttpResult => ({
  kind: 'connection-settings',
  actionId,
  settings,
})

const switchFor = (wrapper: ReturnType<typeof page>, control: string, hostId: string) => (
  wrapper.get(`[role="switch"][aria-label="${control} ${hostId}"]`)
)

const switchChecked = (wrapper: ReturnType<typeof page>, control: string, hostId: string) => (
  (switchFor(wrapper, control, hostId).element as HTMLInputElement).checked
)

describe('T11 Connections Inspector truth oracle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps loading, empty, runtime error, and populated states distinct without leaking raw errors', async () => {
    const pending = deferred<ConnectionListHttpResult>()
    const loading = page(apiWith(vi.fn(() => pending.promise)))
    expect(loading.get('[data-testid="connections-loading"]').text()).toBe('Loading connections…')
    expect(loading.find('[data-testid="connections-empty"]').exists()).toBe(false)
    expect(loading.find('[role="alert"]').exists()).toBe(false)
    pending.resolve({ connections: [] })
    await flushPromises()
    expect(loading.get('[data-testid="connections-empty"]').text()).toBe('No configured connections')
    expect(loading.find('[data-testid="connections-loading"]').exists()).toBe(false)

    const secret = 'sqlite:///private/user/secret.db bearer-secret'
    const unavailable = page(apiWith(vi.fn(async () => {
      throw { status: 503, code: 'runtime-closed', rawBody: secret }
    })))
    await flushPromises()
    expect(unavailable.get('[role="alert"]').text()).toBe('Runtime unavailable (503: runtime-closed)')
    expect(unavailable.text()).not.toContain(secret)

    const populated = page(apiWith(vi.fn(async () => structuredClone(connectionListHttpResultFixture))))
    await flushPromises()
    expect(populated.findAll('[data-connection-host]').map(card => card.attributes('data-connection-host')))
      .toEqual(['airi', 'reference-host'])
    expect(populated.findAll('[data-testid="observer-label"]').map(label => label.text()))
      .toEqual([
        'Local Fake Observer — no external model configured',
        'Local Fake Observer — no external model configured',
      ])
    expect(switchChecked(populated, 'Observe', 'airi')).toBe(true)
    expect(switchChecked(populated, 'Learn', 'airi')).toBe(false)
    expect(switchChecked(populated, 'Apply', 'airi')).toBe(true)
    expect(populated.get('[aria-label="Proactive airi"]').attributes('aria-disabled')).toBe('true')
    expect(populated.get('[aria-label="Proactive airi"]').text()).toBe('Proactive — unavailable in T11')
  })

  it('renders only canonical returned connections and never invents AIRI', async () => {
    const wrapper = page(apiWith(vi.fn(async () => ({
      connections: [structuredClone(connectionSettingsFixture)],
    }))))
    await flushPromises()
    expect(wrapper.find('[data-connection-host="airi"]').exists()).toBe(false)
    expect(wrapper.get('[data-connection-host="reference-host"]').exists()).toBe(true)
  })

  it.each([
    ['Observe', 'observeEnabled', true],
    ['Learn', 'learnEnabled', false],
    ['Apply', 'applyEnabled', false],
  ] as const)('updates %s independently with the current revision', async (label, field, currentValue) => {
    const initial = structuredClone(connectionSettingsFixture)
    initial[field] = currentValue
    const updated = { ...structuredClone(initial), [field]: !currentValue, revision: initial.revision + 1 }
    const update = vi.fn(async () => updatedSettingsResult(updated))
    const wrapper = page(apiWith(vi.fn(async () => ({ connections: [initial] })), update))
    await flushPromises()
    await switchFor(wrapper, label, initial.hostId).trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith({
      actionId,
      identity: preferenceIdentityFixture,
      hostId: initial.hostId,
      expectedSettingsRevision: initial.revision,
      patch: { [field]: !currentValue },
      occurredAt,
    })
    expect(Object.keys(update.mock.calls[0]![0].patch)).toEqual([field])
  })

  it('requires confirmation before disabling Apply and does not claim success optimistically', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const receipt = deferred<GovernanceMutationHttpResult>()
    const update = vi.fn(() => receipt.promise)
    const initial = structuredClone(airiConnectionSettingsFixture)
    const wrapper = page(apiWith(vi.fn(async () => ({ connections: [initial] })), update))
    await flushPromises()

    await switchFor(wrapper, 'Apply', initial.hostId).trigger('click')
    expect(confirmation).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    expect(switchChecked(wrapper, 'Apply', initial.hostId)).toBe(true)

    await switchFor(wrapper, 'Apply', initial.hostId).trigger('click')
    expect(update).toHaveBeenCalledOnce()
    expect(switchChecked(wrapper, 'Apply', initial.hostId)).toBe(true)
    expect(wrapper.get('[data-testid="projection-state"]').text())
      .not.toContain('host confirmed guidance absent')

    receipt.resolve(updatedSettingsResult({
      ...initial,
      applyEnabled: false,
      revision: initial.revision + 1,
      updatedAt: occurredAt,
    }))
    await flushPromises()
    expect(switchChecked(wrapper, 'Apply', initial.hostId)).toBe(false)
    expect(update).toHaveBeenCalledWith({
      actionId,
      identity: preferenceIdentityFixture,
      hostId: initial.hostId,
      expectedSettingsRevision: initial.revision,
      patch: { applyEnabled: false },
      occurredAt,
    })
  })

  it('refreshes canonical settings after a revision conflict', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const initial = structuredClone(airiConnectionSettingsFixture)
    const refreshed = {
      ...structuredClone(initial),
      applyEnabled: false,
      revision: initial.revision + 1,
      updatedAt: occurredAt,
    }
    const list = vi.fn()
      .mockResolvedValueOnce({ connections: [initial] })
      .mockResolvedValueOnce({ connections: [refreshed] })
    const update = vi.fn(async () => {
      throw { status: 409, code: 'settings-revision-conflict', rawBody: 'private conflict detail' }
    })
    const wrapper = page(apiWith(list, update))
    await flushPromises()
    await switchFor(wrapper, 'Apply', initial.hostId).trigger('click')
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(2)
    expect(switchChecked(wrapper, 'Apply', initial.hostId)).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Settings changed elsewhere; refreshed current settings.')
    expect(wrapper.text()).not.toContain('private conflict detail')
  })

  it.each([
    [
      'clearing/unverified',
      {
        ...connectionSettingsFixture,
        applyEnabled: false,
        revision: connectionSettingsFixture.revision + 1,
      },
      'clearing requested; host confirmation pending',
    ],
    [
      'tombstone-locally-written',
      {
        ...connectionSettingsFixture,
        applyEnabled: false,
        projectionStatus: {
          ...adapterProjectionStatusFixture,
          state: 'tombstone-locally-written',
          detailCode: 'tombstone-local-write-completed',
          settingsRevision: connectionSettingsFixture.revision,
          lastGuidanceHash: undefined,
        },
      },
      'local clear instruction written; host confirmation pending',
    ],
    [
      'verified-guidance-absent',
      {
        ...connectionSettingsFixture,
        applyEnabled: false,
        projectionStatus: {
          ...adapterProjectionStatusFixture,
          state: 'verified-guidance-absent',
          detailCode: 'guidance-absence-snapshot-verified',
          settingsRevision: connectionSettingsFixture.revision,
          lastGuidanceHash: undefined,
        },
      },
      'host confirmed guidance absent',
    ],
    [
      'error',
      {
        ...connectionSettingsFixture,
        projectionStatus: {
          ...adapterProjectionStatusFixture,
          state: 'error',
          detailCode: 'verification-failed',
          settingsRevision: connectionSettingsFixture.revision,
        },
      },
      'projection failed; no clearance claim',
    ],
  ] as const)('renders truthful %s projection wording', async (_state, connection, wording) => {
    const wrapper = page(apiWith(vi.fn(async () => ({
      connections: [structuredClone(connection) as ConnectionSettings],
    }))))
    await flushPromises()
    expect(wrapper.get('[data-testid="projection-state"]').text()).toBe(wording)
  })

  it('uses only the injected same-origin API boundary and never browser storage or credentials', async () => {
    const token = 'browser-must-never-see-this-token'
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)
    const list = vi.fn(async () => ({ connections: [] }))
    const wrapper = page(apiWith(list))
    await flushPromises()

    expect(list).toHaveBeenCalledWith({ identity: preferenceIdentityFixture })
    expect(list.mock.calls[0]![0]).not.toHaveProperty('token')
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(storage.clear).not.toHaveBeenCalled()
    expect(wrapper.html()).not.toContain(token)
  })
})
