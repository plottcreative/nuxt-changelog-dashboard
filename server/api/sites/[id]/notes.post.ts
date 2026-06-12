import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../../utils/mongo'
import { requireUser } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const mark = (s: string) => {
    if (import.meta.dev) {
      console.log(`[notes.post] ${s}`)
    }
  }

  try {
    mark('start')
    const user = await requireUser(event)
    const userId = user.id
    mark('after requireUser')

    const siteId = event.context.params?.id as string
    const body = await readBody(event) as any
    const title = (body?.title || '').toString().trim()
    const text = (body?.body || '').toString().trim()
    const pinned = !!body?.pinned
    const env = (body?.env || 'production').toString()

    if (!title && !text) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { message: 'Empty note' } })
    }

    const db = await getDb()
    mark('after getDb')

    const doc = {
      site: { id: siteId, env },
      title,
      body: text,
      pinned,
      tags: Array.isArray(body?.tags) ? body.tags.slice(0, 12).map((t: string) => String(t).slice(0, 32)) : [],
      author: { id: String(userId), email: user.email || '', name: user.name || '' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const r = await db.collection('notes').insertOne(doc as any)
    mark('after insertOne')

    return { ok: true, note: { ...doc, _id: r.insertedId } }
  }
  catch (err: any) {
    // 👇🏼 PRINT THE REAL ERROR IN SERVER LOGS
    console.error('[notes.post] error:', err)

    // 👇🏼 SEND A USEFUL PAYLOAD BACK
    const statusCode = err?.statusCode || 500
    const statusMessage = err?.statusMessage || err?.name || 'Server Error'
    const message = err?.data?.message || err?.message || String(err)
    const code = err?.code
    // include a little stack in dev only
    const stack = import.meta.dev ? (err?.stack || undefined) : undefined

    throw createError({ statusCode, statusMessage, data: { message, code, name: err?.name, stack } })
  }
})
