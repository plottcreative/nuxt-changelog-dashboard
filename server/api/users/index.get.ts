
// server/api/users/index.get.ts
import { defineEventHandler } from 'h3'
import { getDb } from '../../utils/mongo'
import { requireRole } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const db = await getDb()
  const users = await db.collection('users').find({}, { projection: { password: 0, passwordHash: 0 }, sort: { createdAt: -1 } }).toArray()
  return { users: users.map(u => ({ id: String(u._id), email: u.email, name: u.name, role: u.role, createdAt: u.createdAt })) }
})
