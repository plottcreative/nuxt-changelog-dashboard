// server/api/scheduler/maintenance/status.patch.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../../utils/mongo'
import { sendMail } from '../../../utils/postmark'
import { sendCompletionEmail } from '../../../utils/notifications'
import { requireUser } from '../../../utils/session'

type MaintStatus
  = | 'To-Do' | 'In Progress' | 'Awaiting Form Conf'
    | 'Chased Via Email' | 'Chased Via Phone' | 'Completed'

async function sendStatusUpdateEmail(opts: {
  site: any
  siteId: string
  env: string
  date: string
  status: MaintStatus
  previousStatus: MaintStatus
  updatedBy?: { id?: string, name?: string, email?: string } | null
  updatedAt: Date
  db: any
}) {
  const { site, siteId, env, date, status, previousStatus, updatedBy, updatedAt, db } = opts

  if (!site?.groupEmail) return

  const dateStr = new Date(date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })
  const siteName = site.name || siteId
  const updaterName = updatedBy?.name || updatedBy?.email || updatedBy?.id || 'System'

  // Get latest changelog if status is being set to Completed
  let latestChangelogHtml = ''
  if (status === 'Completed') {
    const latestChangelog = await db.collection('changelogs').findOne(
      { 'site.id': siteId, 'site.env': env },
      { sort: { 'run.timestamp': -1, 'receivedAt': -1 } },
    )

    if (latestChangelog) {
      latestChangelogHtml = `
        <h3 style="margin:16px 0 8px">Latest Changelog</h3>
        <div style="background:#f8f9fa;padding:12px;border-radius:4px;margin:8px 0">
          <p style="margin:0 0 8px;font-size:14px">
            <strong>Run:</strong> ${latestChangelog.run?.timestamp ? new Date(latestChangelog.run.timestamp).toLocaleString() : 'N/A'}<br/>
            <strong>Commit:</strong> ${latestChangelog.run?.commit?.slice(0, 8) || 'N/A'}<br/>
            ${latestChangelog.run?.branch ? `<strong>Branch:</strong> ${latestChangelog.run.branch}<br/>` : ''}
          </p>
          ${latestChangelog.changes
            ? `
            <div style="font-size:13px">
              ${latestChangelog.changes.updated?.length
                ? `
                <p style="margin:4px 0"><strong>Updated (${latestChangelog.changes.updated.length}):</strong></p>
                <ul style="margin:0;padding-left:16px">
                  ${latestChangelog.changes.updated.slice(0, 10).map((pkg: any) => `<li>${pkg.name}: ${pkg.old} → ${pkg.new}</li>`).join('')}
                  ${latestChangelog.changes.updated.length > 10 ? `<li><i>... and ${latestChangelog.changes.updated.length - 10} more</i></li>` : ''}
                </ul>
              `
                : ''}
              ${latestChangelog.changes.added?.length
                ? `
                <p style="margin:4px 0"><strong>Added (${latestChangelog.changes.added.length}):</strong></p>
                <ul style="margin:0;padding-left:16px">
                  ${latestChangelog.changes.added.slice(0, 5).map((pkg: any) => `<li>${pkg.name}: ${pkg.new}</li>`).join('')}
                  ${latestChangelog.changes.added.length > 5 ? `<li><i>... and ${latestChangelog.changes.added.length - 5} more</i></li>` : ''}
                </ul>
              `
                : ''}
              ${latestChangelog.changes.removed?.length
                ? `
                <p style="margin:4px 0"><strong>Removed (${latestChangelog.changes.removed.length}):</strong></p>
                <ul style="margin:0;padding-left:16px">
                  ${latestChangelog.changes.removed.slice(0, 5).map((pkg: any) => `<li>${pkg.name}: ${pkg.old}</li>`).join('')}
                  ${latestChangelog.changes.removed.length > 5 ? `<li><i>... and ${latestChangelog.changes.removed.length - 5} more</i></li>` : ''}
                </ul>
              `
                : ''}
            </div>
          `
            : '<p style="margin:0;color:#666;font-size:13px">No package changes in latest run.</p>'}
        </div>
      `
    }
  }

  const subject = `[${siteName}] Maintenance status: ${status} — ${dateStr}`

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2 style="margin:0 0 8px 0">Maintenance Status Update</h2>
      <p style="margin:0 0 8px 0"><strong>Site:</strong> ${siteName} (${siteId})</p>
      <p style="margin:0 0 8px 0"><strong>Environment:</strong> ${env}</p>
      <p style="margin:0 0 8px 0"><strong>Date:</strong> ${dateStr}</p>
      <p style="margin:0 0 8px 0">
        <strong>Status changed:</strong> 
        <code>${previousStatus}</code> → <code style="background:#e8f5e8;padding:2px 4px;border-radius:3px">${status}</code>
      </p>
      <p style="margin:0 0 8px 0"><strong>Updated by:</strong> ${updaterName}</p>
      <p style="margin:0 0 8px 0"><strong>Updated at:</strong> ${updatedAt.toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
      ${site.websiteUrl ? `<p style="margin:0 0 8px 0"><strong>Website:</strong> <a href="${site.websiteUrl}">${site.websiteUrl}</a></p>` : ''}
      ${site.gitUrl ? `<p style="margin:0 0 8px 0"><strong>Repository:</strong> <a href="${site.gitUrl}">${site.gitUrl}</a></p>` : ''}
      ${latestChangelogHtml}
    </div>
  `

  const text = [
    `Maintenance Status Update`,
    `Site: ${siteName} (${siteId})`,
    `Environment: ${env}`,
    `Date: ${dateStr}`,
    `Status changed: ${previousStatus} → ${status}`,
    `Updated by: ${updaterName}`,
    `Updated at: ${updatedAt.toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`,
    site.websiteUrl ? `Website: ${site.websiteUrl}` : '',
    site.gitUrl ? `Repository: ${site.gitUrl}` : '',
  ].filter(Boolean).join('\n')

  await sendMail({
    to: site.groupEmail,
    subject,
    html,
    text,
  })
}

export default defineEventHandler(async (event) => {
  // Require authentication - any logged-in user can change status
  const user = await requireUser(event)

  try {
    const { siteId, env, date, status, from, by } = await readBody<{
      siteId: string; env: string; date: string; status: MaintStatus
      from?: MaintStatus | null
      by?: { id?: string, name?: string, email?: string } | null
    }>(event)

    if (!siteId || !env || !date || !status) {
      throw createError({ statusCode: 400, statusMessage: 'siteId, env, date, status required' })
    }

    const db = await getDb()
    const it = await db.collection('maintenance').findOne({ 'site.id': siteId, 'site.env': env, date })
    if (!it) throw createError({ statusCode: 404, statusMessage: 'Maintenance item not found' })

    const now = new Date()
    const prev = (it.status ?? 'To-Do') as MaintStatus

    await db.collection('maintenance').updateOne(
      { _id: it._id },
      {
        $set: { status, updatedAt: now, updatedBy: by ?? null },
        $push: { statusHistory: { at: now, from: from ?? prev, to: status, by: by ?? null } },
      },
    )

    // Send email notifications for ALL status updates to group email
    const siteDoc = await db.collection('sites').findOne({ id: siteId })
    const runInBackground = (label: string, task: Promise<any>) => {
      task.catch((error) => {
        console.error(`[maintenance/status] ${label} failed:`, error)
      })
    }

    // Always send notification for any status change (not just to completed)
    if (siteDoc?.groupEmail && status !== prev) {
      runInBackground('Group status email', sendStatusUpdateEmail({
        site: siteDoc,
        siteId,
        env,
        date,
        status,
        previousStatus: prev,
        updatedBy: by,
        updatedAt: now,
        db,
      }))
    }

    // Send completion email when transitioning to Completed
    if (status === 'Completed' && prev !== 'Completed') {
      const fresh = await db.collection('maintenance').findOne({ _id: it._id })
      if (fresh && siteDoc) {
        runInBackground('Completion email', sendCompletionEmail({ site: siteDoc, item: fresh }))
      }
    }

    return {
      ok: true,
      previous: prev,
      status,
      groupEmailSent: !!(siteDoc?.groupEmail && status !== prev),
      groupEmail: siteDoc?.groupEmail || null,
    }
  }
  catch (err: any) {
    console.error('[maintenance/status] error:', err)
    if (err?.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: err?.message || 'Failed to set status' })
  }
})
