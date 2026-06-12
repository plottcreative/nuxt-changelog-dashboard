// server/utils/session.ts
import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie, createError } from 'h3'
import crypto from 'node:crypto'

const COOKIE_NAME = 'plott_sess'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const SECRET = process.env.SESSION_SECRET || 'dev-insecure-change-me'

export type SessionUser = {
  id: string
  email: string
  name?: string
  role?: 'admin' | 'manager' | 'user'
}

/** base64url helpers */
function b64u(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function unb64u(input: string) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8')
}

/** Sign and verify a small JSON payload */
function sign(data: string) {
  return b64u(crypto.createHmac('sha256', SECRET).update(data).digest())
}
function encodeSession(obj: any) {
  const payload = b64u(JSON.stringify(obj))
  const sig = sign(payload)
  return `${payload}.${sig}`
}
function decodeSession(token: string | undefined | null): any | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (sig !== sign(payload)) return null
  try { return JSON.parse(unb64u(payload)) }
  catch { return null }
}

/** Public helpers */
export async function setUserSession(event: H3Event, user: SessionUser) {
  const token = encodeSession({ user, ver: 1 })
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export async function clearUserSession(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function getSessionUser(event: H3Event): SessionUser | null {
  const raw = getCookie(event, COOKIE_NAME)
  const data = decodeSession(raw)
  return data?.user || null
}

export function isAuthed(event: H3Event): boolean {
  return !!getSessionUser(event)
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const u = getSessionUser(event)
  if (!u) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return u
}

export async function requireRole(event: H3Event, roles: Array<SessionUser['role']>) {
  const u = await requireUser(event)
  if (!roles.includes((u.role as any) || 'user')) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return u
}
