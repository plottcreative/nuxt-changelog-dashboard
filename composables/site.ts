// Shared types + helpers used across panels
export type TabKey = 'calendar' | 'changelog' | 'forms' | 'notes' | 'details' | 'security'

export type MaintStatus
  = | 'To-Do'
    | 'In Progress'
    | 'Awaiting Form Conf'
    | 'Chased Via Email'
    | 'Chased Via Phone'
    | 'Completed'

export interface PrimaryContact {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface Contact {
  name?: string | null
  title?: string | null
  emails?: string[]
  phones?: string[]
}

export interface SiteDoc {
  id: string
  name?: string | null
  env: 'production' | 'staging' | 'dev' | 'test'
  renewMonth: number
  websiteUrl?: string | null
  gitUrl?: string | null
  primaryContact?: PrimaryContact | null
  groupEmail?: string | null
  contacts?: Contact[]
}

export interface MaintItem {
  site: { id: string, name?: string, env: string }
  date: string
  kind?: 'maintenance' | 'report'
  labels?: { preRenewal?: boolean, reportDue?: boolean, midYear?: boolean }
  status?: MaintStatus
}

export interface ChangelogEntry {
  _id?: string
  site?: { id: string, env: string }
  run?: { timestamp?: string, git_branch?: string, git_sha?: string, ci_url?: string }
  receivedAt?: string
  summary?: {
    total_plugins?: number
    updated_count?: number
    added_count?: number
    removed_count?: number
    unchanged_count?: number
    initial_snapshot?: boolean
    has_changes?: boolean
  }
  changes?: {
    updated?: Array<{ name: string, old: string, new: string }>
    added?: Array<{ name: string, new: string }>
    removed?: Array<{ name: string, old: string }>
    unchanged?: Array<{ name: string, version: string }>
  }
  plugins?: Array<{
    name: string
    old?: string | null
    new?: string | null
    status: 'updated' | 'added' | 'removed' | 'unchanged' | 'current'
  }>
}

export interface FormLog {
  _id?: string
  site?: { id: string, env: string }
  form?: { id?: number, title?: string }
  entry?: { email?: string, created_at?: string }
  fields?: Record<string, string>
  run?: { php_version?: string, wp_version?: string, gf_version?: string }
  notificationRecipient?: string
  notificationDate?: string
}

export const STATUS_LIST: MaintStatus[] = [
  'To-Do',
  'In Progress',
  'Awaiting Form Conf',
  'Chased Via Email',
  'Chased Via Phone',
  'Completed',
]

export function firstOfMonthUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}
export function lastOfMonthUTC(d = new Date()) {
  // Create date at first of next month, then subtract 1 day
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
}
export function formatMonth(d: Date) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}
export function formatDateLine(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
export function dayNum(d: Date) {
  return String(d.getDate()).padStart(2, '0')
}
export function dayWk(d: Date) {
  return d.toLocaleString(undefined, { weekday: 'short' })
}
export const toISOOrUndefined = (s: string) => (s ? new Date(s).toISOString() : undefined)

export function statusClass(s?: MaintStatus) {
  const base
    = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium shadow-sm'
  switch (s) {
    case 'In Progress':
      return base + ' bg-sky-50 text-sky-800 border-sky-200'
    case 'Awaiting Form Conf':
      return base + ' bg-amber-50 text-amber-800 border-amber-200'
    case 'Chased Via Email':
      return base + ' bg-violet-50 text-violet-800 border-violet-200'
    case 'Chased Via Phone':
      return base + ' bg-purple-50 text-purple-800 border-purple-200'
    case 'Completed':
      return base + ' bg-emerald-50 text-emerald-800 border-emerald-200 line-through'
    default:
      return base + ' bg-gray-50 text-gray-700 border-gray-200'
  }
}

export function normalizeUrl(u: string) {
  const s = (u || '').trim()
  if (!s) return ''
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`).toString()
  }
  catch {
    return s
  }
}
