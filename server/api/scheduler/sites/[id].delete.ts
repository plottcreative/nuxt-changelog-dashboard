// server/api/scheduler/sites/[id].delete.ts
import { defineEventHandler, createError, getRouterParam, getQuery } from 'h3'
import { getDb } from '../../../utils/mongo'
import { requireRole } from '../../../utils/session'

export const runtime = 'nodejs'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['manager', 'admin'])

  const id = (getRouterParam(event, 'id') || '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing site id' })
  }

  // Optional ?cascade=true (default true) — deletes related docs
  const q = getQuery(event) as Record<string, any>
  const cascade = (q.cascade ?? 'true').toString().toLowerCase() !== 'false'

  const db = await getDb()

  const site = await db.collection('sites').findOne({ id })
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  // Delete site
  const siteRes = await db.collection('sites').deleteOne({ id })

  // Always delete maintenance for this site id (safe even if none)
  const maintRes = await db.collection('maintenance')
    .deleteMany({ 'site.id': id })

  // Optionally cascade to other data we store by site
  let cascades: Record<string, number> = {}
  if (cascade) {
    // Notes (if you use this collection name)
    const notesRes = await db.collection('site_notes')
      .deleteMany({ 'site.id': id }).catch(() => ({ deletedCount: 0 }))
    // Changelogs (if present)
    const changelogsRes = await db.collection('changelogs')
      .deleteMany({ 'site.id': id }).catch(() => ({ deletedCount: 0 }))
    // Form logs (try common names – safe if not exist)
    const formLogsRes = await db.collection('form_logs')
      .deleteMany({ 'site.id': id }).catch(() => ({ deletedCount: 0 }))

    cascades = {
      notes: notesRes.deletedCount || 0,
      changelogs: changelogsRes.deletedCount || 0,
      formLogs: formLogsRes.deletedCount || 0,
    }
  }

  return {
    ok: true,
    deleted: {
      site: siteRes.deletedCount || 0,
      maintenance: maintRes.deletedCount || 0,
      ...cascades,
    },
  }
})
