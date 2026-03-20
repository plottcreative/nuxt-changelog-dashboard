import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../utils/mongo'
import { verifyPassword, hashPassword } from '../../utils/auth'
import { setUserSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const { email, password } = (await readBody(event)) || {}
  if (!email || !password) throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })

  const db = await getDb()
  const user = await db.collection('users').findOne({ email: String(email).toLowerCase().trim() })
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })

  let stored: string | null = (user as any).passwordHash || (user as any).password || null
  if (stored && !stored.includes('$')) {
    // legacy plaintext -> upgrade if correct
    if (stored === password) {
      stored = hashPassword(password)
      await db.collection('users').updateOne({ _id: user._id }, { $set: { passwordHash: stored }, $unset: { password: '' } })
    } else {
      stored = null
    }
  }

  if (!stored) throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })

  const ok = verifyPassword(password, stored)
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })

  await setUserSession(event, {
    id: String(user._id),
    email: user.email,
    name: user.name || '',
    role: user.role || 'user',
  })
  return { ok: true }
})
