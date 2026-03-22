// composables/useSiteStore.ts
import { useState, useRequestHeaders } from '#imports'
import type { SiteDoc, MaintItem } from '~/composables/site'

interface SiteCacheEntry {
    site: SiteDoc | null
    items: MaintItem[]
    latestCi: any | null
    fetchedAt: number | null
    pending: boolean
    error: any | null
}

interface SiteData {
    site: SiteDoc
    items: MaintItem[]
}

export function useSiteStore() {
    // Global caches
    const siteCache = useState<Record<string, SiteCacheEntry>>('site-cache', () => ({}))
    const userDirectory = useState<any[]>('user-directory', () => [])
    const userDirectoryPending = useState<boolean>('user-directory-pending', () => false)
    const userDirectoryError = useState<any>('user-directory-error', () => null)

    // Helper to get or create a cache entry
    function getCacheEntry(id: string): SiteCacheEntry {
        if (!siteCache.value[id]) {
            siteCache.value[id] = {
                site: null,
                items: [],
                latestCi: null,
                fetchedAt: null,
                pending: false,
                error: null,
            }
        }
        return siteCache.value[id]
    }

    // Fetch user directory once globally
    async function fetchUserDirectory(force = false) {
        if (!force && userDirectory.value.length > 0) return userDirectory.value
        if (userDirectoryPending.value) return // already fetching
        userDirectoryPending.value = true
        userDirectoryError.value = null
        try {
            const headers = process.server ? useRequestHeaders(['cookie']) : undefined
            const data = await $fetch('/api/users/directory', { headers })
            userDirectory.value = data || []
            return userDirectory.value
        } catch (err) {
            userDirectoryError.value = err
            throw err
        } finally {
            userDirectoryPending.value = false
        }
    }

    // Fetch site data (site + maintenance items) and CI badge
    async function fetchSiteData(id: string, force = false) {
        const entry = getCacheEntry(id)
        if (!force && entry.fetchedAt !== null) {
            return { site: entry.site, items: entry.items, latestCi: entry.latestCi }
        }

        entry.pending = true
        entry.error = null
        try {
            const headers = process.server ? useRequestHeaders(['cookie']) : undefined
            const data = await $fetch<SiteData>(`/api/scheduler/sites/${id}`, { headers })
            entry.site = data.site
            entry.items = data.items

            // Fetch CI badge if repo slug is available
            const repoSlug = getRepoSlug(data.site)
            if (repoSlug) {
                const env = (data.site as any)?.env || 'production'
                const ciData = await $fetch('/api/ci/latest', { query: { repo: repoSlug, env } }).catch(() => null)
                entry.latestCi = ciData
            } else {
                entry.latestCi = null
            }

            entry.fetchedAt = Date.now()
            entry.pending = false
            return { site: entry.site, items: entry.items, latestCi: entry.latestCi }
        } catch (err) {
            entry.error = err
            entry.pending = false
            throw err
        }
    }

    // Clear cache for a specific site
    function invalidate(id: string) {
        if (siteCache.value[id]) {
            siteCache.value[id] = {
                site: null,
                items: [],
                latestCi: null,
                fetchedAt: null,
                pending: false,
                error: null,
            }
        }
    }

    // Extract repo slug from git URL (same logic as before)
    function getRepoSlug(site: SiteDoc): string {
        const gitUrl = (site as any)?.gitUrl || ''
        if (!gitUrl) return ''
        try {
            const url = new URL(gitUrl)
            return url.pathname.replace(/^\//, '').replace(/\.git$/, '')
        } catch {
            const m = gitUrl.match(/github\.com[:/](.+?)(?:\.git)?$/i)
            return m ? m[1] : ''
        }
    }

    // Return reactive getters for a specific site
    function getReactiveSiteData(id: string) {
        const entry = computed(() => getCacheEntry(id))
        return {
            site: computed(() => entry.value.site),
            items: computed(() => entry.value.items),
            latestCi: computed(() => entry.value.latestCi),
            pending: computed(() => entry.value.pending),
            error: computed(() => entry.value.error),
        }
    }

    return {
        fetchUserDirectory,
        fetchSiteData,
        invalidate,
        getReactiveSiteData,
        userDirectory: readonly(userDirectory),
    }
}