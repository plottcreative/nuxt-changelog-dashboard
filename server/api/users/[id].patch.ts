// server/api/users/[id].patch.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { ObjectId } from 'mongodb'
import { getDb } from '../../utils/mongo'
import { requireRole } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const id = event.context.params?.id as string
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid user id' })
  const body = await readBody(event) as any
  const update: any = {}
  if (body?.name) update.name = String(body.name)
  if (body?.role && ['admin', 'manager', 'viewer'].includes(body.role)) update.role = body.role
  const db = await getDb()
  await db.collection('users').updateOne({ _id: new ObjectId(id) }, { $set: update })
  return { ok: true }
})
