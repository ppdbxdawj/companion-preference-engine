import { onBeforeUnmount, onMounted, ref } from 'vue'

export type InspectorRoute = '/connections' | '/pending' | '/profile' | '/data'

const knownRoutes = new Set<InspectorRoute>([
  '/connections',
  '/pending',
  '/profile',
  '/data',
])

const currentRoute = (): InspectorRoute => (
  knownRoutes.has(window.location.pathname as InspectorRoute)
    ? window.location.pathname as InspectorRoute
    : '/connections'
)

export const useInspectorRouter = () => {
  const route = ref<InspectorRoute>(currentRoute())
  const onPopState = () => {
    route.value = currentRoute()
  }

  onMounted(() => window.addEventListener('popstate', onPopState))
  onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

  const navigate = (next: InspectorRoute): void => {
    if (route.value === next) return
    window.history.pushState({}, '', next)
    route.value = next
  }

  return { route, navigate }
}
