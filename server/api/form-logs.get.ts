// server/api/form-logs.get.ts
import { defineEventHandler, getQuery, createError } from 'h3'
import { getDb } from '~/server/utils/mongo'

export default defineEventHandler(async (event) => {
  const q = getQuery(event) as Record<string, string | string[] | undefined>

  const site = (q.site as string || '').trim()
  if (!site) throw createError({ statusCode: 400, statusMessage: 'Missing required query: site' })

  const env = (q.env as string | undefined)?.trim()
  const emailQ = (q.email as string | undefined)?.trim()
  let limit = Number(q.limit ?? 20); if (!Number.isFinite(limit) || limit < 1) limit = 20; if (limit > 200) limit = 200

  const fromStr = (q.from as string | undefined)?.trim()
  const toStr = (q.to as string | undefined)?.trim()
  const fromDt = fromStr ? new Date(fromStr) : undefined
  const toDt = toStr ? new Date(toStr) : undefined

  const db = await getDb() // uses MONGODB_URI + MONGODB_DB
  const col = db.collection('form_logs') // your collection name

  // Base filter (INDEX-FRIENDLY)
  const baseMatch: any = {
    '_kind': 'gf_submission',
    'site.id': site,
  }
  if (env) baseMatch['site.env'] = env
  if (emailQ) baseMatch['entry.email'] = emailQ.toLowerCase() // we store lowercased emails

  const pipeline: any[] = [
    { $match: baseMatch },

    // Ensure we always have a Date to filter/sort by, even if older docs lack `when`
    {
      $addFields: {
        _when: {
          $ifNull: [
            '$when',
            { $ifNull: [
              '$createdAt',
              '$receivedAt',
            ] },
          ],
        },
      },
    },
  ]

  // Optional date window on _when
  if (fromDt || toDt) {
    const cond: any = {}
    if (fromDt) cond.$gte = fromDt
    if (toDt) cond.$lte = toDt
    pipeline.push({ $match: { _when: cond } })
  }

  pipeline.push(
    { $sort: { _when: -1 } },
    { $limit: limit },
    {
      $project: {
        // shape for your UI
        site: 1,
        form: 1,
        fields: '$fieldsMap',
        run: 1,
        notificationRecipient: 1,
        notificationDate: 1,
        entry: {
          email: '$entry.email',
          created_at: {
            $dateToString: {
              date: { $ifNull: ['$createdAt', '$receivedAt'] },
              format: '%Y-%m-%dT%H:%M:%S.%LZ',
              timezone: 'UTC',
            },
          },
        },
        receivedAt: {
          $dateToString: { date: '$receivedAt', format: '%Y-%m-%dT%H:%M:%S.%LZ', timezone: 'UTC' },
        },
      },
    },
  )

  const docs = await col.aggregate(pipeline).toArray()

  // stringify _id for the client
  const items = docs.map((d: any) => ({ _id: String(d._id), ...d }))
  return { items }
})
