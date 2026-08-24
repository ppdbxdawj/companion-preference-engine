<script setup lang="ts">
import type { PreferenceCandidate } from '@companion-preference/contracts'

defineProps<{
  candidate: PreferenceCandidate
  busy?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  editConfirm: []
  changeScopeConfirm: []
  reject: []
  suppress: []
}>()

const scopeLabel = (candidate: PreferenceCandidate): string => {
  if (candidate.scope.kind === 'global') return 'global'
  return `workspace: ${candidate.scope.workspaceId}`
}

const visibilityLabel = (candidate: PreferenceCandidate): string =>
  `Visible to: ${[...candidate.projection.allowedHosts].sort().join(', ')}`
</script>

<template>
  <article class="candidate-card" :data-candidate-id="candidate.id">
    <header>
      <p class="eyebrow">Pending candidate</p>
      <h2 data-testid="candidate-preference">{{ candidate.preference.key }} = {{ candidate.preference.value }}</h2>
      <p data-testid="candidate-id">{{ candidate.id }}</p>
    </header>
    <p data-testid="candidate-scope">{{ scopeLabel(candidate) }}</p>
    <p data-testid="candidate-source-hosts">Source hosts: {{ candidate.sourceHostIds.join(', ') }}</p>
    <p data-testid="candidate-visibility">{{ visibilityLabel(candidate) }}</p>
    <p data-testid="candidate-confidence">{{ Math.round(candidate.confidence * 100) }}% confidence</p>
    <p data-testid="candidate-created-at">{{ candidate.createdAt }}</p>
    <p data-testid="candidate-evidence">Supporting evidence: {{ candidate.evidenceIds.length }} ({{ candidate.evidenceIds.join(', ') }})</p>
    <p data-testid="candidate-counter-evidence">Counter evidence: {{ candidate.counterEvidenceIds.length }} ({{ candidate.counterEvidenceIds.join(', ') || 'none' }})</p>
    <p class="candidate-status">{{ candidate.status }}</p>
    <div class="candidate-actions" aria-label="Candidate review actions">
      <button type="button" :aria-label="`Confirm ${candidate.id}`" @click="emit('confirm')">Confirm</button>
      <button type="button" :aria-label="`Edit and confirm ${candidate.id}`" @click="emit('editConfirm')">Edit and confirm</button>
      <button type="button" :aria-label="`Change scope and confirm ${candidate.id}`" @click="emit('changeScopeConfirm')">Change scope and confirm</button>
      <button type="button" :aria-label="`Reject ${candidate.id}`" @click="emit('reject')">Reject</button>
      <button type="button" :aria-label="`Suppress similar ${candidate.id}`" @click="emit('suppress')">Suppress similar</button>
    </div>
  </article>
</template>
