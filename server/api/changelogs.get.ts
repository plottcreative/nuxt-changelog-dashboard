// server/api/changelogs.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { getDb } from '../utils/mongo'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const site = (q.site as string) || ''
  const env = (q.env as string) || '' // empty = any env
  const pkg = (q.pkg as string) || '' // regex search on package name
  const limit = Math.min(parseInt((q.limit as string) || '50', 10), 200)
  const from = q.from ? new Date(String(q.from)) : null
  const to = q.to ? new Date(String(q.to)) : null

  const filter: any = {}
  if (site) filter['site.id'] = site
  if (env) filter['site.env'] = env

  if (from || to) {
    filter.receivedAt = {}
    if (from) filter.receivedAt.$gte = from
    if (to) filter.receivedAt.$lte = to
  }

  if (pkg) {
    const rx = new RegExp(pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [
      { 'changes.updated.name': rx },
      { 'changes.added.name': rx },
      { 'changes.removed.name': rx },
    ]
  }

  const db = await getDb()
  const items = await db.collection('changelogs')
    .find(filter, { sort: { 'receivedAt': -1, 'run.timestamp': -1 }, limit })
    .toArray()

  return { items }
})
