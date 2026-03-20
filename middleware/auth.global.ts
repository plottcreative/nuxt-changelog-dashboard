export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const { ensure } = useAuth()
  const me = await ensure()
  if (!me?.authenticated) {
    return navigateTo('/login')
  }
})
