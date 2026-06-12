import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../../../utils/mongo'
import { requireUser } from '../../../../utils/session'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async (event) => {
  const { id: userId, role } = await requireUser(event)
  const siteId = event.context.params?.id as string
  const noteId = event.context.params?.noteId as string
  const body = await readBody(event) as any

  const db = await getDb()
  const note = await db.collection('notes').findOne({ '_id': new ObjectId(noteId), 'site.id': siteId })
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Note not found' })

  const isOwner = String(note.author?.id) === String(userId)
  const canAdmin = role === 'admin' || role === 'manager'
  if (!isOwner && !canAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const update: any = { updatedAt: new Date() }
  if ('title' in body) update.title = String(body.title || '')
  if ('body' in body) update.body = String(body.body || '')
  if ('pinned' in body) update.pinned = !!body.pinned
  if ('tags' in body && Array.isArray(body.tags)) update.tags = body.tags.slice(0, 12).map((t: string) => String(t).slice(0, 32))

  await db.collection('notes').updateOne({ _id: new ObjectId(noteId) }, { $set: update })
  return { ok: true }
})
