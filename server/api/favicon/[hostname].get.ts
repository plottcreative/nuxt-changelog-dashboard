// server/api/favicon/[hostname].get.ts
export default defineEventHandler(async (event) => {
  const hostname = getRouterParam(event, 'hostname')

  if (!hostname) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing hostname parameter',
    })
  }

  try {
    // Try to fetch from the site's actual favicon first
    const faviconUrl = `https://${hostname}/favicon.ico`
    const response = await fetch(faviconUrl, {
      headers: {
        'User-Agent': 'PLOTT-Favicon-Fetcher/1.0',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    if (response.ok) {
      const buffer = await response.arrayBuffer()

      setHeader(event, 'Content-Type', response.headers.get('content-type') || 'image/x-icon')
      setHeader(event, 'Cache-Control', 'public, max-age=86400') // Cache for 1 day
      setHeader(event, 'X-Favicon-Source', 'website')

      return new Uint8Array(buffer)
    }
  }
  catch (error) {
    // Fall through to generated favicon if fetch fails
  }

  // Generate a simple SVG favicon as fallback
  const initial = hostname.charAt(0).toUpperCase()
  const hue = hashCode(hostname) % 360 // Generate consistent color from hostname

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <rect width="32" height="32" rx="6" fill="hsl(${hue}, 65%, 50%)"/>
    <text x="16" y="22" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" fill="white">${initial}</text>
  </svg>`

  setHeader(event, 'Content-Type', 'image/svg+xml')
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  setHeader(event, 'X-Favicon-Source', 'generated')

  return svg
})

// Simple hash function for consistent colors
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
