import { defineEventHandler, createError, getQuery } from 'h3'
import { getDb } from '../../../utils/mongo' // ✅ same as your working imports

const normalizeEmail = (v?: any) => (typeof v === 'string' ? v : '').trim().toLowerCase() || ''

export default defineEventHandler(async (event) => {
  event.node.res.setHeader('x-handler', 'sites2@v1')
  event.node.res.setHeader('Cache-Control', 'no-store')

  const id = event.context.params!.id as string
  const { env } = getQuery(event) as { env?: string }

  const db = await getDb()
  const site = await db.collection('sites').findOne({ id })
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })

  const contacts = Array.isArray(site.contacts) && site.contacts.length
    ? site.contacts.map((c: any) => ({
        name: c?.name ?? '',
        title: c?.title ?? null,
        emails: Array.isArray(c?.emails) ? c.emails.map(normalizeEmail).filter(Boolean) : (c?.email ? [normalizeEmail(c.email)] : []),
        phones: Array.isArray(c?.phones) ? c.phones : (c?.phone ? [c.phone] : []),
      }))
    : (site.primaryContact
        ? [{
            name: site.primaryContact?.name ?? '',
            title: site.primaryContact?.title ?? null,
            emails: site.primaryContact?.email ? [normalizeEmail(site.primaryContact.email)] : [],
            phones: site.primaryContact?.phone ? [site.primaryContact.phone] : [],
          }]
        : [])

  const primaryContact = site.primaryContact ?? (contacts[0]
    ? { name: contacts[0].name || null, title: contacts[0].title || null, email: contacts[0].emails?.[0] || null, phone: contacts[0].phones?.[0] || null }
    : null)

  const resolvedEnv = env || site.env
  const items = await db.collection('maintenance')
    .find({ 'site.id': id, 'site.env': resolvedEnv }, { sort: { date: 1 } })
    .toArray()

  return {
    _handler: 'sites2@v1',
    site: {
      id: site.id,
      name: site.name,
      env: resolvedEnv,
      renewMonth: site.renewMonth,
      websiteUrl: site.websiteUrl || null,
      gitUrl: site.gitUrl || null,
      groupEmail: site.groupEmail ?? null, // <-- the field in question
      primaryContact,
      contacts,
    },
    items,
  }
})
