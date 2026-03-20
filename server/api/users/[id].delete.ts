// server/api/users/[id].delete.ts
import { defineEventHandler, createError } from 'h3'
import { ObjectId } from 'mongodb'
import { getDb } from '../../utils/mongo'
import { requireRole } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const id = event.context.params?.id as string
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid user id' })
  const db = await getDb()
  const count = await db.collection('users').countDocuments()
  if (count <= 1) throw createError({ statusCode: 400, statusMessage: 'Cannot delete the last user' })
  await db.collection('users').deleteOne({ _id: new ObjectId(id) })
  return { ok: true }
})
