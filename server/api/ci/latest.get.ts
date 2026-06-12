// server/api/ci/latest.get.ts
import { getQuery, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const q = getQuery(event) as { repo?: string, env?: string }
  if (!q.repo) throw createError({ statusCode: 400, statusMessage: 'repo is required' })
  const env = q.env || 'production'
  const storage = useStorage()
  const latest = await storage.getItem<any>(`ci:builds:${q.repo}:${env}:latest`)
  return latest || null
})
