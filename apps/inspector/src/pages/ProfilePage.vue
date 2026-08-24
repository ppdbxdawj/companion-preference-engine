<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { GovernanceMutationHttpResult, IdentityContext, PreferenceRecord, PreferenceListHttpResult, RevisePreferenceCommand, RevokePreferenceCommand } from '@companion-preference/contracts'
import type { InspectorT12Api } from '../api.js'

const props = defineProps<{
  identity: IdentityContext
  api: InspectorT12Api
  createActionId: () => string
  createPreferenceId: () => string
  now: () => string
}>()
if (!props.identity || !props.identity.hostId || !props.identity.sessionId || !props.identity.domain) {
  throw new Error('ProfilePage requires a complete identity context')
}
const preferences = ref<PreferenceRecord[]>([])
const loading = ref(true)
const errorMessage = ref<string>()
const statusMessage = ref<string>()
const busyId = ref<string>()

const publicFailure = (error: unknown): string => {
  const details = error as { status?: unknown, code?: unknown }
  return `Runtime unavailable (${typeof details?.status === 'number' ? details.status : 'unknown'}: ${typeof details?.code === 'string' ? details.code : 'request-failed'})`
}
const refresh = async (showLoading = true): Promise<void> => {
  if (showLoading) loading.value = true
  errorMessage.value = undefined
  try { preferences.value = (await props.api.listPreferences(props.identity)).preferences.filter(item => item.status === 'active') }
  catch (error) { preferences.value = []; errorMessage.value = publicFailure(error) }
  finally { loading.value = false }
}
const mutationError = async (error: unknown): Promise<void> => {
  const details = error as { status?: unknown, code?: unknown }
  if (details?.status === 409) { await refresh(); statusMessage.value = 'Profile changed elsewhere; refreshed current data.' }
  else errorMessage.value = publicFailure(error)
}
const revise = async (record: PreferenceRecord): Promise<void> => {
  if (busyId.value) return; busyId.value = record.id
  const command: RevisePreferenceCommand = { actionId: props.createActionId(), preferenceId: record.id, expectedPreferenceRevision: record.revision, replacementPreferenceId: props.createPreferenceId(), preference: record.preference, scope: record.scope, projection: record.projection, evidenceIds: record.evidenceIds, occurredAt: props.now() }
  try { await props.api.revisePreference(command); await refresh(false) } catch (error) { await mutationError(error) } finally { busyId.value = undefined }
}
const revoke = async (record: PreferenceRecord): Promise<void> => {
  if (busyId.value) return; busyId.value = record.id
  const command: RevokePreferenceCommand = { actionId: props.createActionId(), preferenceId: record.id, expectedPreferenceRevision: record.revision, occurredAt: props.now() }
  try { await props.api.revokePreference(command); await refresh(false) } catch (error) { await mutationError(error) } finally { busyId.value = undefined }
}
const domain = (record: PreferenceRecord): string => record.preference.key.split('.')[0] ?? 'other'
const scope = (record: PreferenceRecord): string => record.scope.kind === 'global' ? 'global' : `workspace: ${record.scope.workspaceId}`
onMounted(() => { void refresh() })
</script>

<template>
  <section class="profile-page" aria-labelledby="profile-title">
    <header class="page-heading"><p class="eyebrow">Active authority</p><h1 id="profile-title">Profile</h1><p>Canonical active preferences for the explicit host, session, and domain context.</p></header>
    <p v-if="loading" data-testid="profile-loading">Loading profile…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <p v-else-if="preferences.length === 0" data-testid="profile-empty">No active preferences</p>
    <p v-if="statusMessage" role="status">{{ statusMessage }}</p>
    <div v-if="!loading && !errorMessage" class="profile-list">
      <article v-for="record in preferences" :key="record.id" :data-preference-id="record.id" :data-testid="`profile-domain-${domain(record)}`" class="preference-card">
        <h2>{{ record.preference.key }} = {{ record.preference.value }}</h2>
        <p>{{ scope(record) }} · {{ record.provenance?.kind ?? 'user-confirmed' }} · Evidence: {{ record.evidenceIds.length }} ({{ record.evidenceIds.join(', ') }})</p>
        <button type="button" :disabled="busyId !== undefined" :aria-label="`Revise ${record.id}`" @click="void revise(record)">Revise</button>
        <button type="button" :disabled="busyId !== undefined" :aria-label="`Revoke ${record.id}`" @click="void revoke(record)">Revoke</button>
      </article>
    </div>
  </section>
</template>
