// server/api/utils/ping.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { checkHeaderHasClass } from '../../utils/ping-static'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string, className?: string, timeoutMs?: number }>(event)
  const url = (body?.url || '').trim()
  if (!url) throw createError({ statusCode: 400, statusMessage: 'Missing url' })

  const className = (body?.className || 'plott-maintain').trim()
  const timeoutMs = Number(body?.timeoutMs ?? 8000)

  const res = await checkHeaderHasClass(url, className, { timeoutMs })
  // Shape matches your dashboard UI expectations
  return {
    ok: res.ok,
    finalUrl: res.finalUrl,
    status: res.status,
    statusText: res.status ? String(res.status) : undefined, // Puppeteer has no statusText
    timeMs: res.timeMs,
    hasMaintainClass: res.hasMaintainClass,
    error: res.ok ? undefined : res.error,
  }
})
