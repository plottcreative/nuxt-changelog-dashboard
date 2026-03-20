
// server/api/users.post.ts (admin create user)
import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../utils/mongo'
import { requireRole } from '../utils/session'
import { hashPassword } from '../utils/auth'
import crypto from 'node:crypto'

function genPassword() {
  // 12-char base64url-ish (no padding)
  return crypto.randomBytes(9).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])

  const body = await readBody(event) as any
  const email = (body?.email || '').toString().trim().toLowerCase()
  const name = (body?.name || '').toString().trim()
  const role = (body?.role || 'viewer').toString()
  let password = (body?.password || '').toString()

  if (!email) throw createError({ statusCode: 400, statusMessage: 'email required' })
  if (!['viewer','manager','admin'].includes(role)) throw createError({ statusCode: 400, statusMessage: 'invalid role' })

  const db = await getDb()
  const exists = await db.collection('users').findOne({ email })
  if (exists) throw createError({ statusCode: 409, statusMessage: 'Email already in use' })

  let tempPassword = ''
  if (!password) {
    tempPassword = genPassword()
    password = tempPassword
  }
  if (password.length < 8) throw createError({ statusCode: 400, statusMessage: 'password too short (min 8)' })

  const user = {
    email,
    name: name || email.split('@')[0],
    role,
    passwordHash: hashPassword(password),
    createdAt: new Date()
  }
  const result = await db.collection('users').insertOne(user as any)
  return {
    ok: true,
    user: { id: String(result.insertedId), email: user.email, name: user.name, role: user.role },
    tempPassword: tempPassword || undefined // show only once if auto-generated
  }
})
