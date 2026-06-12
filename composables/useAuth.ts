// Minimal client/server-aware auth cache.
// - First request (SSR or CSR) calls /api/auth/me once.
// - Subsequent client navigations reuse the cached result.
// - Call ensure(true) to force a refresh when you log in/out.

type Me = { authenticated: boolean, user?: any }

export function useAuth() {
  const me = useState<Me | null>('me', () => null)

  async function fetchMe(): Promise<Me> {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    try {
      return await $fetch<Me>('/api/auth/me', {
        headers,
        credentials: 'include',
      })
    }
    catch {
      return { authenticated: false }
    }
  }

  async function ensure(force = false): Promise<Me> {
    if (force || !me.value) {
      me.value = await fetchMe()
    }
    return me.value!
  }

  function clear() {
    me.value = null
  }

  return { me, ensure, clear }
}
