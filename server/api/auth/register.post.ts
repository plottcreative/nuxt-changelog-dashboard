
// server/api/auth/register.post.ts (hardened: disabled after first user exists)
import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../utils/mongo'
import { hashPassword } from '../../utils/auth'
import { setUserSession } from '../../utils/session'

export default defineEventHandler( async (event) => {
  const db = await getDb()

  const usersCount = await db.collection('users').countDocuments()
  const disabled = process.env.DISABLE_REGISTER === '1'

  // Block registration entirely when disabled, or when at least one user exists
  if (disabled || usersCount > 0) {
    throw createError({ statusCode: 403, statusMessage: 'Registration is disabled' })
  }

  const body = await readBody(event) as any
  const emailRaw = (body?.email || '').toString().trim().toLowerCase()
  const name = (body?.name || '').toString().trim()
  const password = (body?.password || '').toString()

  if (!emailRaw || !password) throw createError({ statusCode: 400, statusMessage: 'email and password required' })

  const existing = await db.collection('users').findOne({ email: emailRaw })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Email already in use' })

  const user = {
    email: emailRaw,
    name: name || emailRaw.split('@')[0],
    role: 'admin', // first user is admin
    password: hashPassword(password),
    createdAt: new Date()
  }

  const result = await db.collection('users').insertOne(user as any)
  await setUserSession(event, {
    id: String(result.insertedId),
    email: user.email,
    name: user.name,
    role: user.role as 'admin',
  })

  return { ok: true, user: { id: String(result.insertedId), email: user.email, name: user.name, role: user.role } }
})
