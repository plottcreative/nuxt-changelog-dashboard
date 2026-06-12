// server/api/sites/[id]/security-scans.get.ts
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDb } from '../../../utils/mongo'
import { requireRole } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  // Require admin or manager role
  await requireRole(event, ['admin', 'manager'])

  const siteId = getRouterParam(event, 'id')
  if (!siteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Site ID is required',
    })
  }

  const db = await getDb()

  // Get site details to verify it exists
  const site = await db.collection('sites').findOne({ id: siteId })
  if (!site) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Site not found',
    })
  }

  try {
    // Get security scan history for this site
    const scans = await db.collection('security_scans')
      .find({ siteId: siteId })
      .sort({ scannedAt: -1 })
      .limit(10) // Last 10 scans
      .toArray()

    return {
      siteId,
      siteName: site.name,
      siteUrl: site.websiteUrl || site.domain,
      totalScans: scans.length,
      scans: scans.map(scan => ({
        _id: scan._id,
        scannedAt: scan.scannedAt,
        scannedBy: scan.scannedBy,
        overallStatus: scan.overallStatus,
        score: scan.score,
        checksCount: scan.checks?.length || 0,
        recommendationsCount: scan.recommendations?.length || 0,
        url: scan.url,
      })),
      latestScan: scans.length > 0 ? scans[0] : null,
    }
  }
  catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to retrieve security scans: ${error.message}`,
    })
  }
})
