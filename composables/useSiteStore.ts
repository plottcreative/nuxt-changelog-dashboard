// composables/useSiteStore.ts
import { useState, useRequestHeaders } from '#imports'
import { computed } from 'vue'
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
    const siteCache = useState<Record<string, SiteCacheEntry>>('site-cache', () => ({}))
    const userDirectory = useState<any[]>('user-directory', () => [])
    const userDirectoryPending = useState<boolean>('user-directory-pending', () => false)
    const userDirectoryError = useState<any>('user-directory-error', () => null)

    // Helper: always returns a fresh object to trigger reactivity
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

    async function fetchUserDirectory(force = false) {
        if (!force && userDirectory.value.length > 0) return userDirectory.value
        if (userDirectoryPending.value) return
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

    async function fetchSiteData(id: string, force = false) {
        const entry = getCacheEntry(id)

        // If not forcing and already fetched, return cached data
        if (!force && entry.fetchedAt !== null) {
            console.log(`[cache] Using cached data for ${id}`)
            return { site: entry.site, items: entry.items, latestCi: entry.latestCi }
        }

        console.log(`[cache] Fetching fresh data for ${id}, force=${force}`)
        entry.pending = true
        entry.error = null
        // Force reactivity by reassigning the entire entry
        siteCache.value[id] = { ...entry }

        try {
            const headers = process.server ? useRequestHeaders(['cookie']) : undefined
            const data = await $fetch<SiteData>(`/api/scheduler/sites/${id}`, { headers })

            // Update entry
            entry.site = data.site
            entry.items = data.items

            // CI badge
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

            // Force reactivity again
            siteCache.value[id] = { ...entry }

            return { site: entry.site, items: entry.items, latestCi: entry.latestCi }
        } catch (err) {
            entry.error = err
            entry.pending = false
            siteCache.value[id] = { ...entry }
            throw err
        }
    }

    function invalidate(id: string) {
        if (siteCache.value[id]) {
            const freshEntry: SiteCacheEntry = {
                site: null,
                items: [],
                latestCi: null,
                fetchedAt: null,
                pending: false,
                error: null,
            }
            siteCache.value[id] = freshEntry
        }
    }

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

    function getReactiveSiteData(id: string) {
        // Use a computed that reacts to the whole entry object
        const entry = computed(() => siteCache.value[id] ?? {
            site: null,
            items: [],
            latestCi: null,
            fetchedAt: null,
            pending: true, // treat missing as pending
            error: null,
        })
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
        userDirectory: computed(() => userDirectory.value),
    }
}