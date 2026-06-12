// server/api/scheduler/bulk-rebuild.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../utils/mongo'
import { addMonths, firstOfMonthUTC, lastWeekdayOfMonthUTC, addMonthsEndOfMonth, toISODate } from '../../utils/date'
import { requireRole } from '../../utils/session'

type MaintStatus
  = | 'To-Do'
    | 'In Progress'
    | 'Awaiting Form Conf'
    | 'Chased Via Email'
    | 'Chased Via Phone'
    | 'Completed'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin']) // Only admins can bulk rebuild

  const body = await readBody(event)
  const backfillMonths = Math.max(0, Math.min(60, Number(body?.backfillMonths || 12)))
  const forwardMonths = Math.max(0, Math.min(60, Number(body?.forwardMonths || 14)))
  const confirmText = String(body?.confirmText || '').trim()

  // Safety check
  if (confirmText !== 'REBUILD ALL SITES') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Must provide confirmText: "REBUILD ALL SITES"',
    })
  }

  const db = await getDb()
  const now = new Date()

  // Get all sites
  const sites = await db.collection('sites').find({}).toArray()

  const results = []
  let totalDeleted = 0
  let totalCreated = 0

  for (const site of sites) {
    try {
      const { id, name, env, renewMonth } = site

      // Delete existing maintenance for this site
      const deleteResult = await db.collection('maintenance').deleteMany({
        'site.id': id,
        'site.env': env,
      })
      totalDeleted += deleteResult.deletedCount || 0

      // Generate new maintenance schedule
      const thisMonthStart = firstOfMonthUTC(now.getUTCFullYear(), now.getUTCMonth())
      const windowStart = addMonths(thisMonthStart, -backfillMonths)
      const windowEnd = addMonths(thisMonthStart, forwardMonths)
      const stop = firstOfMonthUTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth() + 1)

      const rIdx = (renewMonth - 1 + 12) % 12
      const preIdx = (rIdx - 2 + 12) % 12
      const reportIdx = (rIdx - 1 + 12) % 12
      const midIdx = (preIdx + 6) % 12

      const planned = []
      const ops = []

      const upsertItem = (d: Date, kind: 'maintenance' | 'report', labels: any) => {
        const dateISO = toISODate(d)
        const ev = {
          site: { id, name, env },
          date: dateISO,
          labels,
          kind,
          status: 'To-Do' as MaintStatus,
          createdAt: now,
          updatedAt: now,
          statusHistory: [{ at: now, status: 'To-Do' as MaintStatus }],
        }
        planned.push({ date: dateISO, kind, labels })
        ops.push(
          db.collection('maintenance').insertOne(ev),
        )
      }

      // 1) Two-month cadence anchored at preIdx (end of month, weekdays only)
      let cadence = lastWeekdayOfMonthUTC(windowStart.getUTCFullYear(), preIdx)
      if (cadence > windowStart) cadence = lastWeekdayOfMonthUTC(windowStart.getUTCFullYear() - 1, preIdx)

      for (let d = cadence; d < stop; d = addMonthsEndOfMonth(d, 2)) {
        if (d < windowStart) continue
        const m = d.getUTCMonth()
        const labels = { preRenewal: m === preIdx, reportDue: false, midYear: m === midIdx }
        upsertItem(d, 'maintenance', labels)
      }

      // 2) Report months (R−1) - end of month, weekdays only
      for (let d = lastWeekdayOfMonthUTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth()); d < stop; d = addMonthsEndOfMonth(d, 1)) {
        if (d.getUTCMonth() !== reportIdx) continue
        const m = d.getUTCMonth()
        const labels = { preRenewal: m === preIdx, reportDue: true, midYear: m === midIdx }
        upsertItem(d, 'report', labels)
      }

      await Promise.all(ops)
      totalCreated += planned.length

      results.push({
        site: { id, name, env },
        deleted: deleteResult.deletedCount || 0,
        created: planned.length,
        success: true,
      })
    }
    catch (error: any) {
      results.push({
        site: { id: site.id, name: site.name, env: site.env },
        deleted: 0,
        created: 0,
        success: false,
        error: error.message || 'Unknown error',
      })
    }
  }

  return {
    ok: true,
    message: `Bulk rebuild completed for ${sites.length} sites`,
    totalSites: sites.length,
    totalDeleted,
    totalCreated,
    backfillMonths,
    forwardMonths,
    results,
    timestamp: now.toISOString(),
  }
})
