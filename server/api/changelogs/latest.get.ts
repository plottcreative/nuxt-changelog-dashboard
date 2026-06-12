// server/api/changelogs/latest.get.ts
import { defineEventHandler, getQuery, createError } from 'h3'
import { getDb } from '../../utils/mongo'

export default defineEventHandler(async (event) => {
  const { site, env = 'dev' } = getQuery(event) as { site?: string, env?: string }
  if (!site) throw createError({ statusCode: 400, statusMessage: 'site query required' })
  const db = await getDb()
  const doc = await db.collection('changelogs').findOne(
    { 'site.id': site, 'site.env': env },
    { sort: { 'run.timestamp': -1 } },
  )
  return doc || {}
})
