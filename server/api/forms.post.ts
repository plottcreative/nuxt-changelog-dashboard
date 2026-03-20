import { defineEventHandler, createError, getHeader, readRawBody } from 'h3'
import crypto from 'node:crypto'
import { z } from 'zod'
import { getDb } from '../utils/mongo'

export default defineEventHandler(async (event) => {
  // Auth (Bearer)
  const configured = (process.env.NUXT_API_KEY || '').trim()
  const auth = (getHeader(event, 'authorization') || '').trim()
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!configured || token !== configured) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // HMAC
  const secret = (process.env.NUXT_HMAC_SECRET || '').trim()
  const nonce  = (getHeader(event, 'x-nonce') || '').trim()
  const sig    = (getHeader(event, 'x-signature') || '').trim()
  const raw    = (await readRawBody(event)) || ''
  const expected = crypto.createHmac('sha256', secret).update(`${nonce}.${raw}`).digest('base64')
  if (!nonce || !sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  let parsed: unknown
  try { parsed = JSON.parse(raw.toString()) } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' }) }

  const formSchema = z.object({
    site: z.object({ id: z.string().min(1), env: z.string().optional().default('production') }),
    entry: z.object({ email: z.string().email(), created_at: z.string().optional() }),
    form: z.object({ id: z.union([z.string(), z.number()]), title: z.string().optional() }).optional(),
    fieldsMap: z.record(z.string(), z.any()).optional(),
  })
  const result = formSchema.safeParse(parsed)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid payload', data: result.error.flatten() })
  }

  const db = await getDb()
  await db.collection('form_logs').insertOne({ ...result.data, _kind: 'gf_submission', receivedAt: new Date() })
  return { ok: true }
})
