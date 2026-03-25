import { clearNuxtData } from '#imports'
import { useSiteStore } from '~/composables/useSiteStore'

type MutationSyncOptions = {
  affectsOverview?: boolean
  siteId?: string
  affectsSiteCache?: boolean
}

export function useMutationSync() {
  const store = useSiteStore()

  function syncAfterMutation(opts: MutationSyncOptions = {}) {
    if (opts.affectsOverview) {
      clearNuxtData('dashboard-overview')
    }
    if (opts.affectsSiteCache && opts.siteId) {
      store.invalidate(opts.siteId)
    }
  }

  return { syncAfterMutation }
}
