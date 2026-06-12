import { defineEventHandler, getQuery } from 'h3'
import { getDb } from '../../utils/mongo'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const site = (q.site as string) || null
  const env = (q.env as string) || null
  const from = (q.from as string) || null
  const to = (q.to as string) || null
  const limit = Math.min(parseInt((q.limit as string) || '100', 10), 500)

  const db = await getDb()
  const filter: any = {}
  if (site) filter['site.id'] = site
  if (env) filter['site.env'] = env
  if (from || to) {
    filter.date = {}
    if (from) filter.date.$gte = from
    if (to) filter.date.$lte = to
  }

  const items = await db.collection('maintenance').find(filter, { sort: { date: 1 }, limit }).toArray()
  return { items }
})
