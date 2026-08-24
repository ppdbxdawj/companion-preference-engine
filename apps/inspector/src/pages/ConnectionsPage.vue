<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type {
  ConnectionSettings,
  GovernanceMutationHttpResult,
  PreferenceIdentity,
} from '@companion-preference/contracts'

import type { InspectorConnectionsApi } from '../api.js'

// Browsers provide confirm; the fallback keeps the component fail-closed in
// non-browser renderers that omit it.
if (typeof window !== 'undefined' && typeof window.confirm !== 'function') {
  window.confirm = () => false
}

const props = defineProps<{
  identity: Readonly<PreferenceIdentity>
  api: InspectorConnectionsApi
  createActionId: () => string
  now: () => string
}>()

type ToggleField = 'observeEnabled' | 'learnEnabled' | 'applyEnabled'

const connections = ref<ConnectionSettings[]>([])
const loading = ref(true)
const errorMessage = ref<string>()
const statusMessage = ref<string>()
const updatingHostId = ref<string>()

const publicFailure = (error: unknown): string => {
  const details = error as { status?: unknown, code?: unknown }
  const status = typeof details?.status === 'number' ? details.status : 'unknown'
  const code = typeof details?.code === 'string' ? details.code : 'request-failed'
  return `Runtime unavailable (${status}: ${code})`
}

const projectionText = (connection: ConnectionSettings): string => {
  switch (connection.projectionStatus?.state) {
    case 'tombstone-locally-written':
      return 'local clear instruction written; host confirmation pending'
    case 'verified-guidance-absent':
      return 'host confirmed guidance absent'
    case 'error':
      return 'projection failed; no clearance claim'
    default:
      return connection.applyEnabled
        ? 'host projection status not reported'
        : 'clearing requested; host confirmation pending'
  }
}

const refresh = async (): Promise<void> => {
  loading.value = true
  errorMessage.value = undefined
  try {
    const result = await props.api.listConnections({
      identity: {
        userId: props.identity.userId,
        companionId: props.identity.companionId,
        relationshipId: props.identity.relationshipId,
      },
    })
    connections.value = result.connections
  } catch (error) {
    connections.value = []
    errorMessage.value = publicFailure(error)
  } finally {
    loading.value = false
  }
}

const applyReceipt = (hostId: string, result: GovernanceMutationHttpResult): void => {
  if (result.kind !== 'connection-settings' || result.settings.hostId !== hostId) {
    throw new Error('Unexpected connection settings receipt')
  }
  connections.value = connections.value.map(connection => (
    connection.hostId === hostId ? result.settings : connection
  ))
}

const updateSwitch = async (connection: ConnectionSettings, field: ToggleField): Promise<void> => {
  if (updatingHostId.value !== undefined) return
  const nextValue = !connection[field]
  if (field === 'applyEnabled' && !nextValue && !window.confirm('Disable host guidance application?')) {
    return
  }

  updatingHostId.value = connection.hostId
  statusMessage.value = undefined
  try {
    const result = await props.api.updateConnectionSettings({
      actionId: props.createActionId(),
      identity: {
        userId: props.identity.userId,
        companionId: props.identity.companionId,
        relationshipId: props.identity.relationshipId,
      },
      hostId: connection.hostId,
      expectedSettingsRevision: connection.revision,
      patch: { [field]: nextValue },
      occurredAt: props.now(),
    })
    applyReceipt(connection.hostId, result)
  } catch (error) {
    const details = error as { status?: unknown, code?: unknown }
    if (details?.status === 409 && details.code === 'settings-revision-conflict') {
      await refresh()
      statusMessage.value = 'Settings changed elsewhere; refreshed current settings.'
    } else {
      errorMessage.value = publicFailure(error)
    }
  } finally {
    updatingHostId.value = undefined
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <section class="connections-page" aria-labelledby="connections-title">
    <header class="page-heading">
      <p class="eyebrow">Local runtime</p>
      <h1 id="connections-title">Connections</h1>
      <p>Hosts explicitly configured for this companion relationship.</p>
    </header>

    <p v-if="loading" data-testid="connections-loading" aria-live="polite">Loading connections…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <p v-else-if="connections.length === 0" data-testid="connections-empty">No configured connections</p>
    <p v-if="statusMessage" role="status">{{ statusMessage }}</p>

    <div v-if="!loading && !errorMessage" class="connection-list">
      <article
        v-for="connection in connections"
        :key="connection.hostId"
        class="connection-card"
        :data-connection-host="connection.hostId"
      >
        <header>
          <h2>{{ connection.hostId }}</h2>
          <p data-testid="observer-label">Local Fake Observer — no external model configured</p>
        </header>

        <div class="switches" aria-label="Connection controls">
          <label v-for="[label, field] in [
            ['Observe', 'observeEnabled'],
            ['Learn', 'learnEnabled'],
            ['Apply', 'applyEnabled'],
          ] as const" :key="field">
            <span>{{ label }}</span>
            <input
              type="checkbox"
              role="switch"
              :aria-label="`${label} ${connection.hostId}`"
              :checked="connection[field]"
              :disabled="updatingHostId !== undefined"
              @click.prevent="void updateSwitch(connection, field)"
            />
          </label>
        </div>

        <p :aria-label="`Proactive ${connection.hostId}`" aria-disabled="true">
          Proactive — unavailable in T11
        </p>
        <p data-testid="projection-state">{{ projectionText(connection) }}</p>
      </article>
    </div>
  </section>
</template>
