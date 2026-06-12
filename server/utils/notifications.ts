// server/utils/notifications.ts
import { getDb } from './mongo'
import { sendMail } from './postmark' // assumes you export a simple sendEmail({to, subject, html/text})

type MaintStatus
  = | 'To-Do'
    | 'In Progress'
    | 'Awaiting Form Conf'
    | 'Chased Via Email'
    | 'Chased Via Phone'
    | 'Completed'

export async function sendCompletionEmail(opts: {
  site: any
  item: any
  auditHistory?: Array<{ at?: string | Date, by?: any, from?: MaintStatus | null, to?: MaintStatus }>
}) {
  const { site, item } = opts
  if (!site || !item) return

  const to = site.groupEmail || site?.primaryContact?.email
  if (!to) return // nowhere to send

  const dateStr = new Date(item.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })
  const isReport = item?.labels?.reportDue || item?.kind === 'report'
  const title = isReport ? 'Report' : 'Maintenance'
  const subject = `[${site.name || site.id}] ${title} completed — ${dateStr}`

  // Merge history: prefer explicit audit collection if present; otherwise use item.statusHistory
  const merged = (opts.auditHistory?.length ? opts.auditHistory : item?.statusHistory || [])
    .map((h: any) => ({
      at: h.at,
      by: h.by || h.user || undefined,
      from: h.from ?? undefined,
      to: h.to ?? h.status,
    }))
    .filter(Boolean)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const historyLines = merged.map((h) => {
    const when = new Date(h.at).toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const by = typeof h.by === 'string'
      ? h.by
      : (h.by?.name || h.by?.email || h.by?.id || 'Unknown')
    const from = h.from ?? 'N/A'
    const to = h.to ?? 'N/A'
    return `• ${when} — ${by} changed status from “${from}” to “${to}”.`
  }).join('\n')

  const labelChips: string[] = []
  if (item?.labels?.reportDue) labelChips.push('Report')
  if (item?.labels?.preRenewal) labelChips.push('Pre-renewal')
  if (item?.labels?.midYear) labelChips.push('Mid-year')

  const plain = [
    `${title} completed for ${site.name || site.id}`,
    `Date: ${dateStr}`,
    labelChips.length ? `Labels: ${labelChips.join(', ')}` : undefined,
    '',
    'History:',
    historyLines || '• No history entries.',
  ].filter(Boolean).join('\n')

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2 style="margin:0 0 8px 0">${title} completed for ${escapeHtml(site.name || site.id)}</h2>
      <p style="margin:0 0 8px 0"><strong>Date:</strong> ${escapeHtml(dateStr)}</p>
      ${labelChips.length ? `<p style="margin:0 0 12px 0"><strong>Labels:</strong> ${labelChips.map(escapeHtml).join(', ')}</p>` : ''}
      <h3 style="margin:16px 0 8px 0; font-size:14px;">History</h3>
      <ul style="margin:0; padding-left:18px;">
        ${merged.length
          ? merged.map((h) => {
              const when = new Date(h.at).toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
              const by = typeof h.by === 'string' ? h.by : (h.by?.name || h.by?.email || h.by?.id || 'Unknown')
              const from = h.from ?? 'N/A'
              const to = h.to ?? 'N/A'
              return `<li>${escapeHtml(when)} — <strong>${escapeHtml(by)}</strong> changed status from <code>${escapeHtml(String(from))}</code> to <code>${escapeHtml(String(to))}</code>.</li>`
            }).join('')
          : '<li>No history entries.</li>'}
      </ul>
    </div>
  `

  await sendMail({
    to,
    subject,
    text: plain,
    html,
  })
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
