// server/api/ci-hook.post.ts
import type { H3Event } from 'h3'
import { createError, sendNoContent, readBody, getHeader } from 'h3'

type BuildPayload = {
  repo: string // e.g. "owner/repo"
  env?: string // e.g. "production"
  status: 'success' | 'failure' | 'cancelled' | 'in_progress'
  run: {
    git_branch: string
    git_sha: string
    ci_url: string // GitHub run URL
    run_id?: string | number
  }
  metadata?: Record<string, any>
}

export default defineEventHandler(async (event: H3Event) => {
  // Auth: Bearer <token>
  const auth = getHeader(event, 'authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const { ciWebhookToken } = useRuntimeConfig()

  if (!token || token !== ciWebhookToken) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = (await readBody(event)) as Partial<BuildPayload>
  if (!body?.repo || !body?.status || !body?.run?.git_sha || !body?.run?.git_branch || !body?.run?.ci_url) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const now = new Date().toISOString()
  const env = body.env ?? 'production'

  const record = {
    repo: body.repo,
    env,
    status: body.status,
    run: body.run,
    metadata: body.metadata ?? {},
    receivedAt: now,
  }

  // Persist with Nitro’s unstorage
  const storage = useStorage() // default storage
  const baseKey = `ci:builds:${body.repo}:${env}`
  const itemKey = `${baseKey}:${body.run!.git_sha}:${body.run!.run_id ?? 'noid'}`

  await storage.setItem(itemKey, record)
  // also keep a pointer to "latest" for quick GETs
  await storage.setItem(`${baseKey}:latest`, record)

  return record // returning JSON is handy for debugging
})
