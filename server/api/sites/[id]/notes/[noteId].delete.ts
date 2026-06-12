import { defineEventHandler, createError } from 'h3'
import { getDb } from '../../../../utils/mongo'
import { requireUser } from '../../../../utils/session'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async (event) => {
  const { id: userId, role } = await requireUser(event)
  const siteId = event.context.params?.id as string
  const noteId = event.context.params?.noteId as string

  const db = await getDb()
  const note = await db.collection('notes').findOne({ '_id': new ObjectId(noteId), 'site.id': siteId })
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Note not found' })

  const isOwner = String(note.author?.id) === String(userId)
  const canAdmin = role === 'admin' || role === 'manager'
  if (!isOwner && !canAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await db.collection('notes').deleteOne({ _id: new ObjectId(noteId) })
  return { ok: true }
})
