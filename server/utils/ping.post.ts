// server/api/utils/ping.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { requireUser } from '../../utils/session' // or requireRole if you prefer
import { pingForHeaderClass } from '../../utils/ping'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const body = await readBody<{ url?: string, className?: string, timeoutMs?: number }>(event)
  if (!body?.url) throw createError({ statusCode: 400, statusMessage: 'URL is required' })

  return await pingForHeaderClass(body.url, {
    className: body.className,
    timeoutMs: body.timeoutMs,
  })
})
