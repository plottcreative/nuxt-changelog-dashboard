// server/api/sites.get.ts
import { defineEventHandler } from 'h3'
import { getDb } from '../utils/mongo'

export default defineEventHandler(async () => {
  const db = await getDb()
  const agg = await db.collection('changelogs').aggregate([
    { $group: { _id: '$site.id', envs: { $addToSet: '$site.env' } } },
    { $project: { _id: 0, id: '$_id', envs: 1 } },
    { $sort: { id: 1 } },
  ]).toArray()
  return { sites: agg }
})
