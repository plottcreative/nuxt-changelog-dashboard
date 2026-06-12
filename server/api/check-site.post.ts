// server/api/check-site.post.ts

// 1. Change the import to our new utility function
import { checkHeaderHasClass } from '../utils/ping-static'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const rawUrl = body.url
  const className = body.className

  if (!rawUrl) {
    setResponseStatus(event, 400) // Bad Request
    return { ok: false, error: 'URL parameter is required.' }
  }

  // 2. The function call remains the same, but it's now calling the Cheerio version!
  const result = await checkHeaderHasClass(rawUrl, className)

  // You can set the response status based on the check's result
  if (!result.ok) {
    // Pass through the status code from the failed fetch if available
    setResponseStatus(event, result.status || 500)
  }

  return result
})
