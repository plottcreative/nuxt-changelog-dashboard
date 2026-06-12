// Protects private pages. Use on pages like:
// definePageMeta({ middleware: 'auth' })

export default defineNuxtRouteMiddleware(async (to) => {
  const { ensure } = useAuth()
  const me = await ensure()

  if (!me?.authenticated) {
    const redirect = `/login?redirect=${encodeURIComponent(to.fullPath)}`
    // Use 302 on SSR for proper HTTP redirect headers.
    if (import.meta.server) {
      return navigateTo(redirect, { redirectCode: 302 })
    }
    return navigateTo(redirect)
  }
})
