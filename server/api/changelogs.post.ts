// server/api/changelogs.post.ts
import { defineEventHandler, createError, getHeader, readRawBody } from 'h3'
import crypto from 'node:crypto'
import { z } from 'zod'
import { getDb } from '../utils/mongo'

const packageChange = z.object({
  name: z.string(),
  old: z.string().optional(),
  new: z.string().optional(),
})

const changelogSchema = z.object({
  site: z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    env: z.string().optional().default('production'),
  }),
  run: z.object({
    timestamp: z.string(),
    php_version: z.string().optional(),
    composer: z.string().optional(),
    git_sha: z.string().optional(),
    git_branch: z.string().optional(),
    ci_url: z.string().optional(),
    commit: z.string().optional(),
    branch: z.string().optional(),
  }),
  summary: z.object({
    updated_count: z.number().optional(),
    added_count: z.number().optional(),
    removed_count: z.number().optional(),
    has_changes: z.boolean().optional(),
  }).optional(),
  changes: z.object({
    updated: z.array(packageChange).optional().default([]),
    added: z.array(packageChange).optional().default([]),
    removed: z.array(packageChange).optional().default([]),
  }).optional(),
})

export default defineEventHandler(async (event) => {
  // 1) Bearer
  const auth = getHeader(event, 'authorization') || ''
  const apiKey = process.env.NUXT_API_KEY || ''
  if (!apiKey || auth !== `Bearer ${apiKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2) HMAC(sig = HMAC_SHA256(nonce + "." + rawBody, secret))
  const secret = process.env.NUXT_HMAC_SECRET || ''
  if (!secret) throw createError({ statusCode: 500, statusMessage: 'Server missing HMAC secret' })

  const nonce = getHeader(event, 'x-nonce') || ''
  const sigHeader = getHeader(event, 'x-signature') || ''
  const raw = (await readRawBody(event)) || ''

  const expected = crypto.createHmac('sha256', secret).update(`${nonce}.${raw}`).digest()
  const expectedB64 = Buffer.from(expected).toString('base64')
  if (!nonce || !sigHeader || !crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expectedB64))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  // 3) Parse & validate
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' }) }
  const result = changelogSchema.safeParse(parsed)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid payload', data: result.error.flatten() })
  }

  // 4) Insert validated data only
  const db = await getDb()
  await db.collection('changelogs').insertOne({
    ...result.data,
    receivedAt: new Date()
  })

  return { ok: true }
})
