<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  CandidateListHttpResult,
  ConfirmCandidateCommand,
  GovernanceMutationHttpResult,
  IdentityContext,
  PreferenceCandidate,
  PreferenceIdentity,
  PreferenceListHttpResult,
  RejectCandidateCommand,
  SuppressCandidateCommand,
} from '@companion-preference/contracts'
import type { InspectorT12Api } from '../api.js'
import CandidateCard from '../components/CandidateCard.vue'

const props = withDefaults(defineProps<{
  identity: PreferenceIdentity
  profileIdentity: IdentityContext
  api: InspectorT12Api
  createActionId: () => string
  createPreferenceId: () => string
  createSuppressionId: () => string
  now: () => string
  pollIntervalMs?: number
}>(), { pollIntervalMs: 3000 })

const candidates = ref<PreferenceCandidate[]>([])
const loading = ref(true)
const errorMessage = ref<string>()
const statusMessage = ref<string>()
const busyCandidateId = ref<string>()
const pollTimer = ref<ReturnType<typeof setInterval>>()
const activePreferences = ref<PreferenceListHttpResult['preferences']>([])

const publicFailure = (error: unknown): string => {
  const details = error as { status?: unknown, code?: unknown }
  const status = typeof details?.status === 'number' ? details.status : 'unknown'
  const code = typeof details?.code === 'string' ? details.code : 'request-failed'
  return `Runtime unavailable (${status}: ${code})`
}

const refresh = async (showLoading = true): Promise<void> => {
  if (showLoading) loading.value = true
  errorMessage.value = undefined
  try {
    const [candidateResult, profileResult] = await Promise.all([
      props.api.listCandidates({ identity: props.identity, statuses: ['pending_confirmation'] }),
      props.api.listPreferences(props.profileIdentity),
    ])
    candidates.value = candidateResult.candidates
    activePreferences.value = profileResult.preferences
  } catch (error) {
    candidates.value = []
    errorMessage.value = publicFailure(error)
  } finally {
    loading.value = false
  }
}

const refreshAfterMutation = async (): Promise<void> => {
  await refresh(false)
}

const mutationError = async (error: unknown): Promise<void> => {
  const details = error as { status?: unknown, code?: unknown }
  if (details?.status === 409) {
    await refreshAfterMutation()
    statusMessage.value = 'Candidate changed elsewhere; refreshed current data.'
  } else {
    errorMessage.value = publicFailure(error)
  }
}

const confirm = async (candidate: PreferenceCandidate, mode: 'same' | 'edit' | 'scope'): Promise<void> => {
  busyCandidateId.value = candidate.id
  statusMessage.value = undefined
  const command: ConfirmCandidateCommand = {
    actionId: props.createActionId(), candidateId: candidate.id,
    expectedCandidateRevision: candidate.revision, preferenceId: props.createPreferenceId(),
    preference: mode === 'edit' ? { ...candidate.preference, value: 'detailed' } : candidate.preference,
    scope: mode === 'scope' ? { kind: 'global' } : candidate.scope,
    projection: candidate.projection, occurredAt: props.now(),
  }
  try { await props.api.confirmCandidate(command); await refreshAfterMutation() } catch (error) { await mutationError(error) }
  finally { busyCandidateId.value = undefined }
}

const reject = async (candidate: PreferenceCandidate): Promise<void> => {
  busyCandidateId.value = candidate.id
  const command: RejectCandidateCommand = { actionId: props.createActionId(), candidateId: candidate.id, expectedCandidateRevision: candidate.revision, occurredAt: props.now() }
  try { await props.api.rejectCandidate(command); await refreshAfterMutation() } catch (error) { await mutationError(error) }
  finally { busyCandidateId.value = undefined }
}

const suppress = async (candidate: PreferenceCandidate): Promise<void> => {
  busyCandidateId.value = candidate.id
  const command: SuppressCandidateCommand = { actionId: props.createActionId(), candidateId: candidate.id, expectedCandidateRevision: candidate.revision, suppressionId: props.createSuppressionId(), occurredAt: props.now() }
  try { await props.api.suppressCandidate(command); await refreshAfterMutation() } catch (error) { await mutationError(error) }
  finally { busyCandidateId.value = undefined }
}

const poll = (): void => {
  if (document.visibilityState === 'visible') void refresh()
}
const visibilityChanged = (): void => {
  if (document.visibilityState === 'visible') void refresh()
  else if (pollTimer.value !== undefined) { clearInterval(pollTimer.value); pollTimer.value = undefined }
}

onMounted(() => {
  void refresh()
  document.addEventListener('visibilitychange', visibilityChanged)
  if (document.visibilityState === 'visible') pollTimer.value = setInterval(poll, props.pollIntervalMs)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', visibilityChanged)
  if (pollTimer.value !== undefined) clearInterval(pollTimer.value)
})
</script>

<template>
  <section class="pending-page" aria-labelledby="pending-title">
    <header class="page-heading"><p class="eyebrow">Governance review</p><h1 id="pending-title">Pending candidates</h1><p>Review content-free evidence references before a preference becomes active.</p></header>
    <p v-if="loading" data-testid="pending-loading" aria-live="polite">Loading pending candidates…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <p v-else-if="candidates.length === 0" data-testid="pending-empty">No pending candidates</p>
    <p v-if="statusMessage" role="status">{{ statusMessage }}</p>
    <div v-if="!loading && !errorMessage" class="candidate-list">
      <CandidateCard v-for="candidate in candidates" :key="candidate.id" :candidate="candidate" :busy="busyCandidateId !== undefined" @confirm="void confirm(candidate, 'same')" @edit-confirm="void confirm(candidate, 'edit')" @change-scope-confirm="void confirm(candidate, 'scope')" @reject="void reject(candidate)" @suppress="void suppress(candidate)" />
    </div>
  </section>
</template>
