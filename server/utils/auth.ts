// server/utils/auth.ts
import crypto from 'node:crypto'

/** Returns format: s1$<saltB64>$<hashB64> (scrypt N=16384,r=8,p=1,keylen=64) */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `s1$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string) {
  const [tag, saltB64, hashB64] = stored.split('$')
  if (tag !== 's1') return false
  const salt = Buffer.from(saltB64, 'base64')
  const hash = Buffer.from(hashB64, 'base64')
  const test = crypto.scryptSync(password, salt, hash.length, { N: 16384, r: 8, p: 1 })
  return crypto.timingSafeEqual(test, hash)
}
