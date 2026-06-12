// Keeps logged-in users out of guest-only pages (login, signup).
// Use on pages like:
// definePageMeta({ middleware: 'guest' })

export default defineNuxtRouteMiddleware(async (to) => {
  const { ensure } = useAuth()
  const me = await ensure()

  if (me?.authenticated) {
    const fallback = '/dashboard'
    const target = (to.query.redirect as string) || fallback
    if (import.meta.server) {
      return navigateTo(target, { redirectCode: 302 })
    }
    return navigateTo(target)
  }
})
