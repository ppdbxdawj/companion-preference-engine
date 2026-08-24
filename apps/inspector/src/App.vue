<script setup lang="ts">
import type { PreferenceIdentity } from '@companion-preference/contracts'

import { createInspectorConnectionsApi } from './api.js'
import ConnectionsPage from './pages/ConnectionsPage.vue'
import PendingPage from './pages/PendingPage.vue'
import ProfilePage from './pages/ProfilePage.vue'
import { useInspectorRouter, type InspectorRoute } from './router.js'

const api = createInspectorConnectionsApi()
const identity: PreferenceIdentity = {
  userId: import.meta.env.VITE_COMPANION_PREFERENCE_USER_ID ?? 'user-local',
  companionId: import.meta.env.VITE_COMPANION_PREFERENCE_COMPANION_ID ?? 'companion-airi',
  relationshipId: import.meta.env.VITE_COMPANION_PREFERENCE_RELATIONSHIP_ID ?? 'relationship-1',
}
const profileIdentity = {
  ...identity,
  hostId: import.meta.env.VITE_COMPANION_PREFERENCE_HOST_ID ?? 'reference-host',
  sessionId: import.meta.env.VITE_COMPANION_PREFERENCE_SESSION_ID ?? 'inspector-session',
  domain: import.meta.env.VITE_COMPANION_PREFERENCE_DOMAIN ?? 'work',
} as const
const { route, navigate } = useInspectorRouter()
const routes: ReadonlyArray<Readonly<{ path: InspectorRoute, label: string }>> = [
  { path: '/connections', label: 'Connections' },
  { path: '/pending', label: 'Pending' },
  { path: '/profile', label: 'Profile' },
  { path: '/data', label: 'Data' },
]
</script>

<template>
  <main class="inspector-shell">
    <aside class="navigation" aria-label="Inspector sections">
      <p class="product-name">Companion Preference</p>
      <nav>
        <a
          v-for="item in routes"
          :key="item.path"
          :href="item.path"
          :aria-current="route === item.path ? 'page' : undefined"
          @click.prevent="navigate(item.path)"
        >{{ item.label }}</a>
      </nav>
    </aside>

    <ConnectionsPage
      v-if="route === '/connections'"
      :identity="identity"
      :api="api"
      :create-action-id="() => crypto.randomUUID()"
      :now="() => new Date().toISOString()"
    />
    <PendingPage
      v-else-if="route === '/pending'"
      :identity="identity"
      :profile-identity="profileIdentity"
      :api="api"
      :create-action-id="() => crypto.randomUUID()"
      :create-preference-id="() => crypto.randomUUID()"
      :create-suppression-id="() => crypto.randomUUID()"
      :now="() => new Date().toISOString()"
    />
    <ProfilePage
      v-else-if="route === '/profile'"
      :identity="profileIdentity"
      :api="api"
      :create-action-id="() => crypto.randomUUID()"
      :create-preference-id="() => crypto.randomUUID()"
      :now="() => new Date().toISOString()"
    />
    <section v-else class="placeholder-page">
      <p class="eyebrow">Inspector</p>
      <h1>{{ routes.find(item => item.path === route)?.label }}</h1>
      <p>This section is not available in T11.</p>
    </section>
  </main>
</template>
