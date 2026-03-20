<script setup lang="ts">
import { reactive, computed, ref } from 'vue'
import { useFetch } from '#imports'
import { ArrowPathIcon, CalendarDaysIcon, GlobeEuropeAfricaIcon } from '@heroicons/vue/24/outline'
import { ChartBarIcon } from '@heroicons/vue/24/outline'
import { ArrowRightIcon } from '@heroicons/vue/24/outline'

type MaintStatus =
  | 'To-Do'
  | 'In Progress'
  | 'Awaiting Form Conf'
  | 'Chased Via Email'
  | 'Chased Via Phone'
  | 'Completed'

interface StatusHistoryEntry {
  at: string
  status?: MaintStatus
  from?: MaintStatus
  to?: MaintStatus
}

interface OverviewMaintItem {
  site: { id: string; name?: string; env: 'production' | 'staging' | 'dev' | 'test' }
  date: string
  kind: 'maintenance' | 'report'
  status?: MaintStatus
  labels?: { preRenewal?: boolean; midYear?: boolean; reportDue?: boolean }
  statusHistory?: StatusHistoryEntry[]
}

const { data, pending, error, refresh } = await useFetch('/api/scheduler/overview')

const tab = ref<'overview' | 'months' | 'sites'>('overview')
const q = ref('')
const sortBy = ref<'az' | 'renew-asc' | 'renew-desc'>('az')
const envFilter = ref<'all' | 'production' | 'staging' | 'dev' | 'test'>('all')

// Months tab controls
const showPastMonths = ref(false)
const followupOnly = ref(false)

// Bulk rebuild state
const showBulkRebuild = ref(false)
const bulkRebuilding = ref(false)
const bulkRebuildForm = reactive({
  backfillMonths: 12,
  forwardMonths: 14,
  confirmText: ''
})
const bulkRebuildResult = ref<any>(null)
const bulkRebuildError = ref<string | null>(null)

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
function formatRenew(d?: string | number | Date) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${ordinal(dt.getDate())} ${dt.toLocaleString(undefined, {
    month: 'long'
  })} ${dt.getFullYear()}`
}
function monthName(m?: number) {
  if (!m) return ''
  return new Date(2000, (m || 1) - 1, 1).toLocaleString(undefined, {
    month: 'long'
  })
}

const sites = computed(() => (data.value?.sites || []) as any[])
const maintenance = computed<OverviewMaintItem[]>(() => (data.value?.maintenance || []) as OverviewMaintItem[])

// Favicon helpers
const favState = reactive<Record<string, { triedFallback: boolean; hide: boolean }>>({})
function hostOf(s: any) {
  const raw = s?.websiteUrl || s?.domain || ''
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return u.hostname
  } catch {
    return ''
  }
}
function favPrimary(host: string) {
  return `https://icons.duckduckgo.com/ip3/${host}.ico`
}
function onFavError(e: Event, id: string) {
  const st = (favState[id] ||= { triedFallback: false, hide: false })
  st.hide = true
}

// Sites filter
const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  let list = sites.value.filter(s => {
    const name = String(s.name || '').toLowerCase()
    const id = String(s.id || '').toLowerCase()
    const domain = String(s.domain || '').toLowerCase()
    const matchesQ =
      !term ||
      name.includes(term) ||
      id.includes(term) ||
      domain.includes(term)
    const matchesEnv =
      envFilter.value === 'all' ||
      String(s.env || '').toLowerCase() === envFilter.value
    return matchesQ && matchesEnv
  })

  if (sortBy.value === 'az') {
    list = list.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
  } else if (sortBy.value === 'renew-asc') {
    list = list.sort(
      (a, b) =>
        new Date(a.nextMaintenance || 0).getTime() -
        new Date(b.nextMaintenance || 0).getTime()
    )
  } else {
    list = list.sort(
      (a, b) =>
        new Date(b.nextMaintenance || 0).getTime() -
        new Date(a.nextMaintenance || 0).getTime()
    )
  }
  return list
})

// Current month incomplete maintenance, by type
const incompleteMaintenance = computed(() => {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth()

  const incomplete = maintenance.value.filter(item => {
    if (item.status === 'Completed') return false
    const itemDate = new Date(item.date)
    return (
      itemDate.getUTCFullYear() === currentYear &&
      itemDate.getUTCMonth() === currentMonth
    )
  })

  const preRenewal = incomplete.filter(item => item.labels?.preRenewal)
  const midYear = incomplete.filter(item => item.labels?.midYear)
  const quickCheck = incomplete.filter(
    item => !item.labels?.preRenewal && !item.labels?.midYear
  )

  return {
    preRenewal,
    midYear,
    quickCheck
  }
})

// Follow-up/problem statuses
const problemStatuses: MaintStatus[] = [
  'In Progress',
  'Awaiting Form Conf',
  'Chased Via Email',
  'Chased Via Phone'
]
const normalizedFollowups = problemStatuses.map(s => s.toLowerCase())

// Helpers for past issues
function extractStatuses(entry: any): string[] {
  const out: string[] = []
  if (entry.status) out.push(entry.status)
  if (entry.to) out.push(entry.to)
  if (entry.from) out.push(entry.from)
  return out.map(s => String(s).toLowerCase().trim())
}

function wasEverFollowup(history: any[]): string | null {
  const timeline = history.flatMap(entry => extractStatuses(entry))
  const match = timeline.find(st => normalizedFollowups.includes(st))
  return match || null
}

function daysOverdue(dateStr: string) {
  const due = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - due.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

// Any item whose date is in the past and EVER had a follow-up status
const pastIssues = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return maintenance.value
    .map(item => {
      const history = item.statusHistory || []
      const match = wasEverFollowup(history)
      if (!match) return null

      const due = new Date(item.date)
      if (due >= today) return null // only strictly past dates

      const normalized = normalizedFollowups.find(s => s === match)
      if (!normalized) return null

      return {
        ...item,
        followupStatus: normalized,
        overdueDays: daysOverdue(item.date)
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.overdueDays - a.overdueDays)
})

const pastIssuesGrouped = computed(() => {
  const groups: Record<string, any[]> = {}
  for (const s of problemStatuses) groups[s] = []

  for (const item of pastIssues.value as any[]) {
    const key = problemStatuses.find(
      s => s.toLowerCase() === item.followupStatus
    )
    if (key) groups[key].push(item)
  }
  return groups
})

// Accordion state for overview sections
const accordionOpen = ref({
  preRenewal: true,
  midYear: true,
  quickCheck: true
})
function toggleAccordion(section: keyof typeof accordionOpen.value) {
  accordionOpen.value[section] = !accordionOpen.value[section]
}

// Month overview calculations
const now = new Date()
const startMonthIdx = now.getUTCMonth()
const startYear = now.getUTCFullYear()
const idx = (m: number) => (Number(m || 0) - 1 + 12) % 12
const preIdxOf = (m: number) => (idx(m) - 2 + 12) % 12
const reportIdxOf = (m: number) => (idx(m) - 1 + 12) % 12
const midIdxOf = (m: number) => (preIdxOf(m) + 6) % 12

type MonthOverview = {
  key: string
  label: string
  year: number
  monthIdx: number
  offset: number
  renewals: any[]
  maintenance: Array<
    any & { preRenewal?: boolean; midYear?: boolean; status?: MaintStatus; typeLabel?: string }
  >
  reports: Array<any & { status?: MaintStatus }>
}

const monthsOverview = computed<MonthOverview[]>(() => {
  const out: MonthOverview[] = []
  const monthsToShowPast = 12
  const monthsToShowFuture = 11

  for (let i = -monthsToShowPast; i <= monthsToShowFuture; i++) {
    const monthOffset = startMonthIdx + i
    const year = startYear + Math.floor(monthOffset / 12)
    const monthIdx = ((monthOffset % 12) + 12) % 12

    const label = new Date(Date.UTC(year, monthIdx, 1)).toLocaleString(
      undefined,
      { month: 'long', year: 'numeric' }
    )

    if (maintenance.value.length) {
      const inMonth = maintenance.value.filter(it => {
        const d = new Date(it.date)
        return (
          d.getUTCFullYear() === year &&
          d.getUTCMonth() === monthIdx &&
          it.status !== 'Completed'
        )
      })

      const maintList = inMonth
        .filter(it => it.kind === 'maintenance')
        .map(it => ({
          ...it.site,
          ...(it.labels || {}),
          status: it.status,
          typeLabel: it.labels?.preRenewal
            ? 'Pre-Renewal'
            : it.labels?.midYear
              ? 'Mid-Year'
              : 'Quick Check'
        }))

      const reportList = inMonth
        .filter(it => it.kind === 'report')
        .map(it => ({ ...it.site, status: it.status }))

      const renewals = (data.value?.sites || []).filter(
        (s: any) => Number(s.renewMonth) === monthIdx + 1
      )

      out.push({
        key: `${year}-${monthIdx}`,
        label,
        year,
        monthIdx,
        offset: i,
        renewals,
        maintenance: maintList,
        reports: reportList
      })
      continue
    }

    // Fallback if no maintenance schedule present
    const renewals = sites.value.filter(
      s => Number(s.renewMonth) === monthIdx + 1
    )
    const maintenanceFallback = sites.value
      .filter(
        s =>
          preIdxOf(Number(s.renewMonth)) === monthIdx ||
          midIdxOf(Number(s.renewMonth)) === monthIdx
      )
      .map(s => ({
        ...s,
        preRenewal: preIdxOf(Number(s.renewMonth)) === monthIdx,
        midYear: midIdxOf(Number(s.renewMonth)) === monthIdx
      }))
    const reportsFallback = sites.value.filter(
      s => reportIdxOf(Number(s.renewMonth)) === monthIdx
    )

    out.push({
      key: `${year}-${monthIdx}`,
      label,
      year,
      monthIdx,
      offset: i,
      renewals,
      maintenance: maintenanceFallback,
      reports: reportsFallback
    })
  }
  return out
})

const thisMonth = computed(
  () => monthsOverview.value.find(m => m.offset === 0) || monthsOverview.value[0]
)

// Email summary
const sendingMail = ref(false)
const mailMsg = ref<string | null>(null)
const mailErr = ref<string | null>(null)

async function sendMonthlySummary() {
  sendingMail.value = true
  mailMsg.value = mailErr.value = null
  try {
    await $fetch('/api/mail/summary', { method: 'POST' })
    mailMsg.value = 'Monthly summary emailed successfully.'
  } catch (e: any) {
    mailErr.value =
      e?.data?.message || e?.message || 'Failed to send email'
  } finally {
    sendingMail.value = false
  }
}

// Bulk rebuild logic
async function bulkRebuildMaintenance() {
  if (bulkRebuildForm.confirmText !== 'REBUILD ALL SITES') {
    bulkRebuildError.value = 'Please type "REBUILD ALL SITES" to confirm'
    return
  }

  bulkRebuilding.value = true
  bulkRebuildError.value = null
  bulkRebuildResult.value = null

  try {
    const result = await $fetch('/api/scheduler/bulk-rebuild', {
      method: 'POST',
      body: {
        backfillMonths: bulkRebuildForm.backfillMonths,
        forwardMonths: bulkRebuildForm.forwardMonths,
        confirmText: bulkRebuildForm.confirmText
      }
    })
    bulkRebuildResult.value = result
    bulkRebuildForm.confirmText = ''
    await refresh()
  } catch (e: any) {
    bulkRebuildError.value =
      e?.data?.message || e?.message || 'Failed to rebuild maintenance schedules'
  } finally {
    bulkRebuilding.value = false
  }
}

function closeBulkRebuild() {
  showBulkRebuild.value = false
  bulkRebuildForm.confirmText = ''
  bulkRebuildError.value = null
  bulkRebuildResult.value = null
}

// Ping test
type PingRes = {
  ok: boolean
  finalUrl?: string
  status?: number
  statusText?: string
  timeMs?: number
  hasMaintainClass?: boolean
  error?: string
}
const testUrl = ref('')
const testing = ref(false)
const testMsg = ref<string | null>(null)
const testErr = ref<string | null>(null)
const testRes = ref<PingRes | null>(null)

async function testPing() {
  testing.value = true
  testMsg.value = testErr.value = null
  testRes.value = null
  try {
    const res = await $fetch('/api/utils/ping', {
      method: 'POST',
      body: { url: testUrl.value, className: 'plott-maintain' }
    })
    testRes.value = res
    if (!res.ok) {
      testErr.value = res.error || res.statusText || 'Request failed'
    } else {
      testMsg.value = res.hasMaintainClass
        ? '✅ Contains .plott-maintain'
        : '⚠️ Does NOT contain .plott-maintain'
    }
  } catch (e: any) {
    testErr.value = e?.data?.message || e?.message || 'Failed'
  } finally {
    testing.value = false
  }
}

// UI helpers
const statusClass = (s?: MaintStatus | string) => {
  const base =
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium'
  switch (s) {
    case 'To-Do':
      return base + ' bg-amber-100 text-amber-800 border-amber-200/80'
    case 'In Progress':
      return base + ' bg-blue-100 text-blue-800 border-blue-200/80'
    case 'Awaiting Form Conf':
      return base + ' bg-purple-100 text-purple-800 border-purple-200/80'
    case 'Chased Via Email':
      return base + ' bg-emerald-100 text-emerald-800 border-emerald-200/80'
    case 'Chased Via Phone':
      return base + ' bg-indigo-100 text-indigo-800 border-indigo-200/80'
    case 'Completed':
      return base + ' bg-slate-100 text-slate-600 border-slate-200/80 line-through'
    default:
      return base + ' bg-slate-100 text-slate-700 border-slate-200/80'
  }
}
const envBadge = (env?: string) => {
  const base =
    'px-1.5 py-0.5 rounded border text-[10px] font-medium capitalize'
  switch (env) {
    case 'production':
      return base + ' bg-emerald-100 text-emerald-800 border-emerald-200/80'
    case 'staging':
      return base + ' bg-amber-100 text-amber-800 border-amber-200/80'
    default:
      return base + ' bg-slate-100 text-slate-700 border-slate-200/80'
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
    <!-- HEADER -->
    <header
      class="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8 bg-white/80 backdrop-blur-lg border-b border-slate-200/80"
    >
      <div
        class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-3 space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900 tracking-tight">
              Sites Dashboard
            </h1>
            <p class="text-sm text-slate-500 hidden md:block">
              Search, plan, and track site maintenance
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              @click="refresh"
              class="btn-secondary"
              :disabled="pending"
            >
              <ArrowPathIcon
                :class="{ 'animate-spin': pending }"
                class="w-5 h-5"
              />
              <span class="hidden sm:inline">Refresh</span>
            </button>
            <button
              @click="sendMonthlySummary"
              class="btn-secondary hidden sm:inline-flex"
              :disabled="sendingMail"
            >
              {{ sendingMail ? 'Sending…' : 'Email summary' }}
            </button>
            <button
              @click="showBulkRebuild = true"
              class="btn-secondary text-orange-700 hover:bg-orange-50 hidden sm:inline-flex"
            >
              Bulk Rebuild
            </button>
            <NuxtLink to="/sites" class="btn-primary">Add Site</NuxtLink>
          </div>
        </div>

        <div
          class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"
        >
          <nav
            class="inline-flex rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200/80"
          >
            <button
              @click="tab = 'overview'"
              :class="['tab-btn', tab === 'overview' ? 'tab-btn-active' : '']"
            >
              <ChartBarIcon class="w-5 h-5" />
              Overview
            </button>
            <button
              @click="tab = 'months'"
              :class="['tab-btn', tab === 'months' ? 'tab-btn-active' : '']"
            >
              <CalendarDaysIcon class="w-5 h-5" />
              Months
            </button>
            <button
              @click="tab = 'sites'"
              :class="['tab-btn', tab === 'sites' ? 'tab-btn-active' : '']"
            >
              <GlobeEuropeAfricaIcon class="w-5 h-5" />
              Sites
            </button>
          </nav>

          <div class="min-h-[1.25rem] text-right">
            <p v-if="mailMsg" class="text-xs text-emerald-700">
              {{ mailMsg }}
            </p>
            <p v-if="mailErr" class="text-xs text-red-600">
              {{ mailErr }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <!-- MAIN CONTENT -->
    <main class="max-w-7xl mx-auto space-y-6">
      <div
        v-if="error"
        class="card text-center text-red-600"
      >
        Failed to load dashboard data.
      </div>
      <div
        v-if="pending && !data"
        class="card text-center text-slate-500"
      >
        Loading dashboard...
      </div>

      <template v-else>
        <!-- OVERVIEW TAB -->
        <section v-show="tab === 'overview'" class="space-y-6">
          <!-- KPIs -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="kpi-card">
              <div class="kpi-label">Maintenance this month</div>
              <div class="kpi-value">
                {{
                  incompleteMaintenance.preRenewal.length +
                  incompleteMaintenance.midYear.length +
                  incompleteMaintenance.quickCheck.length
                }}
              </div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Reports due</div>
              <div class="kpi-value">
                {{ thisMonth?.reports.length || 0 }}
              </div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Renewals this month</div>
              <div class="kpi-value">
                {{ thisMonth?.renewals.length || 0 }}
              </div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total sites</div>
              <div class="kpi-value">{{ sites.length }}</div>
            </div>
          </div>

          <!-- PAST ISSUES -->
          <div class="card space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <h2 class="font-semibold text-slate-800">
                  Past Issues (ever in follow-up)
                </h2>
                <p class="text-xs text-slate-500 mt-1">
                  Any maintenance item in the past that was ever
                  <span class="font-semibold">In Progress</span>,
                  <span class="font-semibold">Awaiting Form Conf</span>,
                  <span class="font-semibold">Chased Via Email</span>, or
                  <span class="font-semibold">Chased Via Phone</span>.
                </p>
              </div>
              <span
                v-if="pastIssues.length"
                class="count-badge"
              >
                {{ pastIssues.length }} total
              </span>
            </div>

            <template v-if="pastIssues.length">
              <details
                v-for="status in problemStatuses"
                :key="status"
                class="rounded-lg border border-slate-200/80 bg-slate-50/40 px-3 py-2"
                :open="pastIssuesGrouped[status]?.length > 0"
              >
                <summary
                  class="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span :class="statusClass(status)">
                      {{ status }}
                    </span>
                    <span class="text-xs text-slate-500">
                      {{ pastIssuesGrouped[status].length }} item(s)
                    </span>
                  </div>
                  <span class="text-xs text-slate-400">
                    Click to {{ pastIssuesGrouped[status].length ? 'view' : 'collapse' }}
                  </span>
                </summary>

                <div class="mt-2 space-y-1">
                  <NuxtLink
                    v-for="item in pastIssuesGrouped[status]"
                    :key="item._id || `${item.site.id}-${item.date}-${status}`"
                    :to="`/site/${item.site.id}`"
                    class="overview-item"
                  >
                    <div class="overview-item-main">
                      <p class="font-medium text-slate-800 truncate">
                        {{ item.site.name || item.site.id }}
                      </p>
                      <p class="text-xs text-slate-500">
                        Due: {{ new Date(item.date).toLocaleDateString() }}
                        •
                        <span
                          :class="[
                            'font-medium',
                            item.overdueDays > 30
                              ? 'text-red-600'
                              : item.overdueDays > 7
                                ? 'text-amber-600'
                                : 'text-slate-500'
                          ]"
                        >
                          {{ item.overdueDays }} days overdue
                        </span>
                      </p>
                    </div>
                    <span :class="statusClass(status)">
                      {{ status }}
                    </span>
                  </NuxtLink>

                  <p
                    v-if="!pastIssuesGrouped[status].length"
                    class="text-xs text-slate-500 ml-1"
                  >
                    None.
                  </p>
                </div>
              </details>
            </template>

            <p
              v-else
              class="text-sm text-slate-500"
            >
              No outstanding past issues. 🎉
            </p>
          </div>

          <!-- MAINTENANCE THIS MONTH -->
          <div class="card space-y-4">
            <h2 class="font-semibold text-slate-800">
              Maintenance Due This Month
            </h2>

            <!-- Pre-Renewal -->
            <div class="border border-slate-200 rounded-lg overflow-hidden">
              <button
                @click="toggleAccordion('preRenewal')"
                class="accordion-header w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <span class="chip chip-amber">Pre-Renewal</span>
                  <span class="font-medium text-slate-800">
                    {{ incompleteMaintenance.preRenewal.length }} items
                  </span>
                </div>
                <svg
                  :class="{ 'rotate-180': accordionOpen.preRenewal }"
                  class="w-5 h-5 text-slate-600 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <div
                v-if="accordionOpen.preRenewal"
                class="accordion-content p-4 space-y-2"
              >
                <NuxtLink
                  v-for="item in incompleteMaintenance.preRenewal"
                  :key="`${item.site.id}-${item.date}`"
                  :to="`/site/${item.site.id}`"
                  class="overview-item"
                >
                  <div class="overview-item-main">
                    <p class="font-medium text-slate-800 truncate">
                      {{ item.site.name || item.site.id }}
                    </p>
                    <p class="text-sm text-slate-500">
                      {{ new Date(item.date).toLocaleDateString() }}
                    </p>
                  </div>
                  <div class="flex gap-2 text-xs">
                    <span
                      v-if="item.status"
                      :class="statusClass(item.status)"
                    >
                      {{ item.status }}
                    </span>
                    <span :class="envBadge(item.site.env)">
                      {{ item.site.env }}
                    </span>
                  </div>
                </NuxtLink>
                <p
                  v-if="!incompleteMaintenance.preRenewal.length"
                  class="text-sm text-slate-500 py-2"
                >
                  No pre-renewal maintenance pending.
                </p>
              </div>
            </div>

            <!-- Mid-Year -->
            <div class="border border-slate-200 rounded-lg overflow-hidden">
              <button
                @click="toggleAccordion('midYear')"
                class="accordion-header w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <span class="chip chip-blue">Mid-Year</span>
                  <span class="font-medium text-slate-800">
                    {{ incompleteMaintenance.midYear.length }} items
                  </span>
                </div>
                <svg
                  :class="{ 'rotate-180': accordionOpen.midYear }"
                  class="w-5 h-5 text-slate-600 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <div
                v-if="accordionOpen.midYear"
                class="accordion-content p-4 space-y-2"
              >
                <NuxtLink
                  v-for="item in incompleteMaintenance.midYear"
                  :key="`${item.site.id}-${item.date}`"
                  :to="`/site/${item.site.id}`"
                  class="overview-item"
                >
                  <div class="overview-item-main">
                    <p class="font-medium text-slate-800 truncate">
                      {{ item.site.name || item.site.id }}
                    </p>
                    <p class="text-sm text-slate-500">
                      {{ new Date(item.date).toLocaleDateString() }}
                    </p>
                  </div>
                  <div class="flex gap-2 text-xs">
                    <span
                      v-if="item.status"
                      :class="statusClass(item.status)"
                    >
                      {{ item.status }}
                    </span>
                    <span :class="envBadge(item.site.env)">
                      {{ item.site.env }}
                    </span>
                  </div>
                </NuxtLink>
                <p
                  v-if="!incompleteMaintenance.midYear.length"
                  class="text-sm text-slate-500 py-2"
                >
                  No mid-year maintenance pending.
                </p>
              </div>
            </div>

            <!-- Quick Check -->
            <div class="border border-slate-200 rounded-lg overflow-hidden">
              <button
                @click="toggleAccordion('quickCheck')"
                class="accordion-header w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <span class="chip chip-slate">Quick Check</span>
                  <span class="font-medium text-slate-800">
                    {{ incompleteMaintenance.quickCheck.length }} items
                  </span>
                </div>
                <svg
                  :class="{ 'rotate-180': accordionOpen.quickCheck }"
                  class="w-5 h-5 text-slate-600 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <div
                v-if="accordionOpen.quickCheck"
                class="accordion-content p-4 space-y-2"
              >
                <NuxtLink
                  v-for="item in incompleteMaintenance.quickCheck"
                  :key="`${item.site.id}-${item.date}`"
                  :to="`/site/${item.site.id}`"
                  class="overview-item"
                >
                  <div class="overview-item-main">
                    <p class="font-medium text-slate-800 truncate">
                      {{ item.site.name || item.site.id }}
                    </p>
                    <p class="text-sm text-slate-500">
                      {{ new Date(item.date).toLocaleDateString() }}
                    </p>
                  </div>
                  <div class="flex gap-2 text-xs">
                    <span
                      v-if="item.status"
                      :class="statusClass(item.status)"
                    >
                      {{ item.status }}
                    </span>
                    <span :class="envBadge(item.site.env)">
                      {{ item.site.env }}
                    </span>
                  </div>
                </NuxtLink>
                <p
                  v-if="!incompleteMaintenance.quickCheck.length"
                  class="text-sm text-slate-500 py-2"
                >
                  No quick check maintenance pending.
                </p>
              </div>
            </div>

            <p
              v-if="
                !incompleteMaintenance.preRenewal.length &&
                !incompleteMaintenance.midYear.length &&
                !incompleteMaintenance.quickCheck.length
              "
              class="text-center text-slate-500 py-8"
            >
              🎉 All maintenance for this month has been completed!
            </p>
          </div>

          <!-- REPORTS / RENEWALS THIS MONTH -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="card space-y-3">
              <h2 class="font-semibold text-slate-800">
                Reports due this month
              </h2>
              <NuxtLink
                v-for="s in thisMonth.reports"
                :key="s.id"
                :to="`/site/${s.id}`"
                class="overview-item"
              >
                <div class="overview-item-main">
                  <p class="font-medium text-slate-800 truncate">
                    {{ s.name || s.id }}
                  </p>
                </div>
                <span class="chip chip-violet">Report</span>
              </NuxtLink>
              <p
                v-if="!thisMonth.reports.length"
                class="text-sm text-slate-500"
              >
                No reports due.
              </p>
            </div>

            <div class="card space-y-3">
              <h2 class="font-semibold text-slate-800">
                Renewals this month
              </h2>
              <NuxtLink
                v-for="s in thisMonth.renewals"
                :key="s.id"
                :to="`/site/${s.id}`"
                class="overview-item"
              >
                <div class="overview-item-main">
                  <p class="font-medium text-slate-800 truncate">
                    {{ s.name || s.id }}
                  </p>
                </div>
                <span class="text-sm text-slate-600">
                  {{ monthName(s.renewMonth) }}
                </span>
              </NuxtLink>
              <p
                v-if="!thisMonth.renewals.length"
                class="text-sm text-slate-500"
              >
                No renewals this month.
              </p>
            </div>
          </div>
        </section>

        <!-- MONTHS TAB -->
        <section v-show="tab === 'months'" class="space-y-4">
          <div
            class="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div class="flex gap-2">
              <button
                @click="showPastMonths = !showPastMonths"
                class="btn-secondary"
              >
                {{ showPastMonths ? 'Hide past months' : 'Show past months' }}
              </button>
            </div>
            <label class="inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                v-model="followupOnly"
                class="rounded border-slate-300"
              />
              <span>Show only follow-up statuses</span>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <div
              v-for="m in monthsOverview"
              :key="m.key"
              v-show="m.offset >= 0 || showPastMonths"
              class="card"
            >
              <h3
                class="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-3 mb-3 flex items-center justify-between gap-2"
              >
                <span>{{ m.label }}</span>
                <span
                  v-if="m.offset === 0"
                  class="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium"
                >
                  Current
                </span>
              </h3>

              <div class="space-y-4 text-sm">
                <!-- Outstanding maintenance -->
                <div class="space-y-1">
                  <h4 class="font-semibold text-slate-600">
                    Outstanding Maintenance
                    <span class="count-badge">
                      {{
                        (followupOnly
                          ? m.maintenance.filter(
                              x => x.status && problemStatuses.includes(x.status)
                            )
                          : m.maintenance
                        ).length
                      }}
                    </span>
                  </h4>

                  <div
                    v-if="m.maintenance.length"
                    class="space-y-1"
                  >
                    <NuxtLink
                      v-for="s in (
                        followupOnly
                          ? m.maintenance.filter(
                              x => x.status && problemStatuses.includes(x.status)
                            )
                          : m.maintenance
                      )"
                      :key="s.id"
                      :to="`/site/${s.id}`"
                      class="month-item"
                    >
                      <div class="min-w-0 flex-1">
                        <span class="block truncate font-medium">
                          {{ s.name || s.id }}
                        </span>
                        <span class="text-xs text-slate-500">
                          {{ s.typeLabel || 'Quick Check' }}
                        </span>
                      </div>
                      <div class="flex gap-2 text-[11px] items-center">
                        <span
                          v-if="s.status"
                          :class="statusClass(s.status)"
                        >
                          {{ s.status }}
                        </span>
                        <span
                          v-else
                          class="flex gap-1"
                        >
                          <span
                            v-if="s.preRenewal"
                            class="chip chip-amber !px-1.5 !py-0.5"
                          >
                            Pre
                          </span>
                          <span
                            v-if="s.midYear"
                            class="chip chip-blue !px-1.5 !py-0.5"
                          >
                            Mid
                          </span>
                          <span
                            v-if="!s.preRenewal && !s.midYear"
                            class="chip chip-slate !px-1.5 !py-0.5"
                          >
                            Quick
                          </span>
                        </span>
                      </div>
                    </NuxtLink>
                  </div>
                  <p
                    v-else
                    class="text-xs text-slate-500 px-1.5"
                  >
                    None outstanding
                  </p>
                </div>

                <hr class="border-slate-200/60" />

                <!-- Reports -->
                <div class="space-y-1">
                  <h4 class="font-semibold text-slate-600">
                    Reports
                    <span class="count-badge">
                      {{ m.reports.length }}
                    </span>
                  </h4>
                  <div
                    v-if="m.reports.length"
                    class="space-y-1"
                  >
                    <NuxtLink
                      v-for="s in m.reports"
                      :key="s.id"
                      :to="`/site/${s.id}`"
                      class="month-item"
                    >
                      <span class="truncate">{{ s.name || s.id }}</span>
                      <span class="chip chip-violet">Report</span>
                    </NuxtLink>
                  </div>
                  <p
                    v-else
                    class="text-xs text-slate-500 px-1.5"
                  >
                    None
                  </p>
                </div>

                <hr class="border-slate-200/60" />

                <!-- Renewals -->
                <div class="space-y-1">
                  <h4 class="font-semibold text-slate-600">
                    Renewals
                    <span class="count-badge">
                      {{ m.renewals.length }}
                    </span>
                  </h4>
                  <div
                    v-if="m.renewals.length"
                    class="space-y-1"
                  >
                    <NuxtLink
                      v-for="s in m.renewals"
                      :key="s.id"
                      :to="`/site/${s.id}`"
                      class="month-item"
                    >
                      <span class="truncate">{{ s.name || s.id }}</span>
                    </NuxtLink>
                  </div>
                  <p
                    v-else
                    class="text-xs text-slate-500 px-1.5"
                  >
                    None
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- SITES TAB -->
        <section v-show="tab === 'sites'" class="space-y-6">
          <div class="card">
            <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div class="md:col-span-3">
                <label for="site-search" class="filter-label">
                  Search Site
                </label>
                <input
                  id="site-search"
                  v-model="q"
                  type="search"
                  placeholder="By name, ID, or domain..."
                  class="filter-input"
                />
              </div>
              <div class="md:col-span-2">
                <label for="site-sort" class="filter-label">
                  Sort By
                </label>
                <select
                  id="site-sort"
                  v-model="sortBy"
                  class="filter-input"
                >
                  <option value="az">A–Z</option>
                  <option value="renew-asc">Next maintenance ↑</option>
                  <option value="renew-desc">Next maintenance ↓</option>
                </select>
              </div>
              <div class="md:col-span-1">
                <label for="site-env" class="filter-label">Env</label>
                <select
                  id="site-env"
                  v-model="envFilter"
                  class="filter-input"
                >
                  <option value="all">All</option>
                  <option value="production">Prod</option>
                  <option value="staging">Stage</option>
                </select>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <div
              v-for="s in filtered"
              :key="s.id"
              class="card flex flex-col"
            >
              <div class="flex items-center gap-4">
                <div
                  class="h-12 w-12 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0"
                >
                  <img
                    v-if="hostOf(s) && !favState[s.id]?.hide"
                    :src="favPrimary(hostOf(s))"
                    @error="e => onFavError(e, s.id)"
                    :alt="s.name || s.id"
                    class="h-7 w-7"
                    loading="lazy"
                  />
                  <span
                    v-else
                    class="text-lg font-bold text-slate-500"
                  >
                    {{ (s.name || s.id || '?').slice(0, 1).toUpperCase() }}
                  </span>
                </div>
                <div class="min-w-0">
                  <h3
                    class="font-semibold text-slate-800 leading-tight truncate"
                  >
                    {{ s.name || s.id }}
                  </h3>
                  <p class="text-sm text-slate-500 truncate">
                    {{ s.id }}
                  </p>
                </div>
              </div>

              <hr class="border-slate-200/60 my-4" />

              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span class="text-slate-500">Environment</span>
                  <span
                    class="font-medium text-slate-700"
                    :class="envBadge(s.env)"
                  >
                    {{ s.env }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Next Maintenance</span>
                  <span class="font-medium text-slate-700">
                    {{ formatRenew(s.nextMaintenance) || '—' }}
                  </span>
                </div>
              </div>

              <div
                class="mt-4 pt-4 border-t border-slate-200/60 flex-1 flex items-end justify-between"
              >
                <NuxtLink
                  :to="`/site/${s.id}`"
                  class="text-sm font-semibold text-slate-600 hover:text-slate-900 flex gap-2 items-center"
                >
                  View Details
                  <ArrowRightIcon class="w-3 h-3" />
                </NuxtLink>
              </div>
            </div>
          </div>

          <div
            v-if="!pending && filtered.length === 0"
            class="card text-center text-slate-500"
          >
            No sites match your filters.
          </div>
        </section>

        <!-- PING TEST -->
        <section class="card">
          <h2 class="font-semibold text-slate-800 mb-2">
            Maintenance Mode Ping Test
          </h2>
          <div class="flex flex-col sm:flex-row items-center gap-2">
            <input
              v-model="testUrl"
              type="url"
              placeholder="https://example.com"
              class="filter-input flex-1 w-full"
            />
            <button
              @click="testPing"
              class="btn-primary w-full sm:w-auto"
              :disabled="testing || !testUrl"
            >
              {{ testing ? 'Pinging…' : 'Test URL' }}
            </button>
          </div>
          <div class="mt-2 text-sm min-h-[1.25rem]">
            <p
              v-if="testMsg"
              class="text-emerald-700"
              v-html="testMsg"
            />
            <p v-if="testErr" class="text-red-600">{{ testErr }}</p>
            <div
              v-if="testRes"
              class="text-xs text-slate-500 mt-1 space-y-0.5"
            >
              <p>
                Final URL:
                <code class="text-slate-700">
                  {{ testRes.finalUrl || '—' }}
                </code>
              </p>
              <p>
                Status:
                <code class="text-slate-700">
                  {{ testRes.status || '—' }} {{ testRes.statusText || '' }}
                </code>
              </p>
              <p>
                Time:
                <code class="text-slate-700">
                  {{ testRes.timeMs }}ms
                </code>
              </p>
            </div>
          </div>
        </section>
      </template>
    </main>

    <!-- BULK REBUILD MODAL -->
    <div
      v-if="showBulkRebuild"
      class="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
      >
        <div
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          @click="closeBulkRebuild"
        />
        <div
          class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
        >
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div
                class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
              >
                <svg
                  class="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3
                  class="text-lg leading-6 font-medium text-gray-900"
                  id="modal-title"
                >
                  Bulk Rebuild All Maintenance Schedules
                </h3>
                <div class="mt-2 space-y-4">
                  <p class="text-sm text-gray-500">
                    This will
                    <strong>delete all existing maintenance items</strong> for
                    all sites and regenerate them with end-of-month,
                    weekday-only dates.
                  </p>

                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        class="block text-sm font-medium text-gray-700"
                      >
                        Backfill months
                      </label>
                      <input
                        v-model.number="bulkRebuildForm.backfillMonths"
                        type="number"
                        min="0"
                        max="60"
                        class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-sm font-medium text-gray-700"
                      >
                        Forward months
                      </label>
                      <input
                        v-model.number="bulkRebuildForm.forwardMonths"
                        type="number"
                        min="0"
                        max="60"
                        class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      class="block text-sm font-medium text-gray-700"
                    >
                      Type "REBUILD ALL SITES" to confirm
                    </label>
                    <input
                      v-model="bulkRebuildForm.confirmText"
                      type="text"
                      placeholder="REBUILD ALL SITES"
                      class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                    />
                  </div>

                  <div
                    v-if="bulkRebuildError"
                    class="mt-2 p-3 bg-red-50 border border-red-200 rounded-md"
                  >
                    <p class="text-sm text-red-600">
                      {{ bulkRebuildError }}
                    </p>
                  </div>

                  <div
                    v-if="bulkRebuildResult"
                    class="mt-2 p-3 bg-green-50 border border-green-200 rounded-md"
                  >
                    <p class="text-sm text-green-600 font-medium">
                      ✅ Bulk rebuild completed!
                    </p>
                    <p class="text-xs text-green-600 mt-1">
                      {{ bulkRebuildResult.totalSites }} sites •
                      {{ bulkRebuildResult.totalDeleted }} deleted •
                      {{ bulkRebuildResult.totalCreated }} created
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse"
          >
            <button
              @click="bulkRebuildMaintenance"
              :disabled="
                bulkRebuilding ||
                bulkRebuildForm.confirmText !== 'REBUILD ALL SITES'
              "
              type="button"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ bulkRebuilding ? 'Rebuilding...' : 'Rebuild All Sites' }}
            </button>
            <button
              @click="closeBulkRebuild"
              type="button"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-secondary {
  @apply inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 bg-white shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60;
}
.btn-primary {
  @apply inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white bg-slate-800 shadow-sm ring-1 ring-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-60;
}
.tab-btn {
  @apply rounded-md px-3 sm:px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white/80 hover:text-slate-900 transition-all duration-200 flex items-center gap-2;
}
.tab-btn-active {
  @apply bg-white text-slate-900 shadow-sm;
}
.card {
  @apply bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-5;
}
.kpi-card {
  @apply bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-4 transition-shadow hover:shadow-md;
}
.kpi-label {
  @apply text-sm text-slate-500;
}
.kpi-value {
  @apply text-3xl font-bold text-slate-800 mt-1;
}
.overview-item {
  @apply flex items-center justify-between gap-3 rounded-lg p-2 -mx-2 hover:bg-slate-100/80 transition-colors;
}
.overview-item-main {
  @apply min-w-0 flex-1;
}
.month-item {
  @apply flex items-center justify-between gap-2 rounded-md p-1.5 -mx-1.5 text-slate-700 hover:bg-slate-100/80 transition-colors;
}
.filter-label {
  @apply block text-sm font-medium text-slate-600 mb-1;
}
.filter-input {
  @apply w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-500 transition;
}
.count-badge {
  @apply inline-block text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full ring-1 ring-slate-200;
}
.chip {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium;
}
.chip-violet {
  @apply bg-violet-100 text-violet-800 border-violet-200/80;
}
.chip-amber {
  @apply bg-amber-100 text-amber-800 border-amber-200/80;
}
.chip-blue {
  @apply bg-blue-100 text-blue-800 border-blue-200/80;
}
.chip-slate {
  @apply bg-slate-100 text-slate-800 border-slate-200/80;
}
.accordion-header {
  @apply text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
}
.accordion-content {
  @apply bg-white border-t border-slate-200;
}
</style>
