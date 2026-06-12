<script setup lang="ts">
import { EllipsisVerticalIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '@heroicons/vue/20/solid'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type {
  MaintItem,
  MaintStatus,
  SiteDoc,
} from '~/composables/site'
import {
  STATUS_LIST,
  firstOfMonthUTC,
  formatMonth,
  dayNum,
  dayWk,
  statusClass,
} from '~/composables/site'

// ---- Types ----
interface HistoryEntry {
  at: string | Date
  by?: { id?: string, name?: string, email?: string } | string
  from?: MaintStatus | null
  to?: MaintStatus | null
}

interface LabelFlags {
  reportDue?: boolean
  preRenewal?: boolean
  midYear?: boolean
}

interface ItemWithDate extends MaintItem {
  dateObj: Date
  labels?: LabelFlags
  kind?: 'report' | 'maintenance' | string
  history?: HistoryEntry[]
  updatedAt?: string | Date
  updatedBy?: HistoryEntry['by']
}

// ---- Props & Emits ----
const props = withDefaults(defineProps<{
  site?: SiteDoc
  items: Array<MaintItem & { dateObj?: Date, history?: HistoryEntry[] }>
  canManageSite: boolean
  startDate?: Date
  monthsAhead?: number
  monthsBehind?: number
  isLoading?: boolean
  currentUser?: { id?: string, name?: string, email?: string }
  userDirectory?: Array<{ id?: string, name?: string, email?: string }> | Record<string, { id?: string, name?: string, email?: string }>
}>(), {
  canManageSite: false,
  monthsAhead: 12,
  monthsBehind: 12,
})

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'set-status', ev: MaintItem, next: MaintStatus): void
  (e: 'status-change', payload: {
    item: MaintItem
    from?: MaintStatus | null
    to: MaintStatus
    by?: { id?: string, name?: string, email?: string }
    at: Date
  }): void
}>()

// ---- Date range (past + future) ----
const start = computed(() => firstOfMonthUTC(props.startDate ?? new Date()))
const months = computed(() => {
  const out: Array<{ start: Date, end: Date, key: string }> = []
  const baseYear = start.value.getUTCFullYear()
  const baseMonth = start.value.getUTCMonth()
  for (let i = -Math.max(0, props.monthsBehind); i < props.monthsAhead; i++) {
    const d = new Date(Date.UTC(baseYear, baseMonth + i, 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    out.push({ start: d, end, key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` })
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
})

// ---- Year pagination ----
const years = computed(() => Array.from(new Set(months.value.map(m => m.start.getUTCFullYear()))).sort((a, b) => a - b))
const selectedYear = ref<number>(start.value.getUTCFullYear())
watch(years, (ys) => {
  if (!ys.includes(selectedYear.value) && ys.length) selectedYear.value = ys[0]
}, { immediate: true })

function prevYear() {
  const idx = years.value.indexOf(selectedYear.value)
  if (idx > 0) selectedYear.value = years.value[idx - 1]
}

function nextYear() {
  const idx = years.value.indexOf(selectedYear.value)
  if (idx >= 0 && idx < years.value.length - 1) selectedYear.value = years.value[idx + 1]
}

function isRenewalMonthUTC(monthStartUTC: Date) {
  const r = Number(props.site?.renewMonth)
  return r ? monthStartUTC.getUTCMonth() === (r - 1) : false
}

// ---- Data parsing & grouping ----
function safeDate(d: unknown): Date | null {
  const dt = d instanceof Date ? d : new Date(String(d ?? ''))
  return Number.isFinite(dt.getTime()) ? dt : null
}

const itemsWithDate = computed<ItemWithDate[]>(() =>
  (props.items ?? [])
    .map((it) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const date = safeDate((it as any).date)
      if (!date) return null
      return { ...it, dateObj: date }
    })
    .filter(Boolean) as ItemWithDate[],
)

const monthGroups = computed(() => {
  const map = new Map<string, { meta: { start: Date, end: Date, key: string }, items: ItemWithDate[] }>()
  for (const m of months.value) {
    map.set(m.key, { meta: m, items: [] })
  }
  for (const it of itemsWithDate.value) {
    const key = `${it.dateObj.getUTCFullYear()}-${String(it.dateObj.getUTCMonth() + 1).padStart(2, '0')}`
    if (map.has(key)) {
      map.get(key)!.items.push(it)
    }
  }
  for (const { items } of map.values()) {
    items.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime() || String(a.kind ?? '').localeCompare(String(b.kind ?? '')))
  }
  return map
})

// ---- Filters ----
const statusFilter = ref<MaintStatus | 'ALL'>('ALL')
const labelReport = ref(false)
const labelPreRen = ref(false)
const labelMid = ref(false)
type TimeScope = 'ALL' | 'UPCOMING' | 'PAST'
const timeScope = ref<TimeScope>('ALL')
const today = new Date(new Date().setUTCHours(0, 0, 0, 0))

function matchesFilters(ev: ItemWithDate): boolean {
  // Search logic removed
  if (statusFilter.value !== 'ALL' && (ev.status ?? 'To-Do') !== statusFilter.value) return false
  if (labelReport.value && !ev.labels?.reportDue) return false
  if (labelPreRen.value && !ev.labels?.preRenewal) return false
  if (labelMid.value && !ev.labels?.midYear) return false
  if (timeScope.value === 'UPCOMING' && ev.dateObj.getTime() < today.getTime()) return false
  if (timeScope.value === 'PAST' && ev.dateObj.getTime() >= today.getTime()) return false
  return true
}

const monthViews = computed(() => {
  const views: Array<{
    key: string
    meta: { start: Date, end: Date, key: string }
    items: ItemWithDate[]
    summary: { total: number, byStatus: Record<string, number> }
  }> = []
  for (const [key, group] of monthGroups.value.entries()) {
    if (group.meta.start.getUTCFullYear() !== selectedYear.value) continue
    const filteredItems = group.items.filter(matchesFilters)
    const byStatus: Record<string, number> = {}
    for (const it of filteredItems) {
      const s = (it.status ?? 'To-Do') as string
      byStatus[s] = (byStatus[s] ?? 0) + 1
    }
    views.push({ key, meta: group.meta, items: filteredItems, summary: { total: filteredItems.length, byStatus } })
  }
  return views
})

// ---- User resolution ----
const userIndex = computed(() => {
  const out: Record<string, { id?: string, name?: string, email?: string }> = {}
  const dir = props.userDirectory
  if (!dir) return out
  const users = Array.isArray(dir) ? dir : Object.values(dir)
  for (const u of users) {
    if (!u) continue
    if (u.id) out[u.id] = u
    if (u.email) out[u.email.toLowerCase()] = u
    if (u.name) out[u.name.toLowerCase()] = u
  }
  return out
})

function resolveUser(by: HistoryEntry['by']) {
  if (!by) return undefined
  if (typeof by === 'string') return userIndex.value[by.toLowerCase()] || { name: by }
  return userIndex.value[by.id ?? ''] || userIndex.value[(by.email ?? '').toLowerCase()] || userIndex.value[(by.name ?? '').toLowerCase()] || by
}

function byLabel(by: HistoryEntry['by']): string {
  const u = resolveUser(by)
  return u?.name || u?.email || u?.id || 'Unknown'
}

// ---- Optimistic UI & History Logic ----
const optimistic = ref<Record<string, HistoryEntry[]>>({})

function itemKey(ev: MaintItem): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ev as any)?._id || (ev as any)?.id || `${ev?.date}-${(ev as any)?.kind || 'm'}`
}

function displayHistory(ev: ItemWithDate): HistoryEntry[] {
  const base = ev.history ?? []
  const opt = optimistic.value[itemKey(ev)] ?? []
  return [...base, ...opt].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

function latestHistory(ev: ItemWithDate): HistoryEntry | undefined {
  const fullHistory = displayHistory(ev)
  if (fullHistory.length > 0) return fullHistory[0]
  if (ev.updatedAt) return { at: ev.updatedAt, by: ev.updatedBy, to: ev.status ?? 'To-Do' }
  return undefined
}

// ---- Event Handlers & Popover Management ----
const openPopId = ref<string | null>(null)
const openActionMenuId = ref<string | null>(null) // State for the new action menu

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function togglePop(ev: any) {
  const id = itemKey(ev)
  openPopId.value = openPopId.value === id ? null : id
  openActionMenuId.value = null // Close other popover
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toggleActionMenu(ev: any) {
  const id = itemKey(ev)
  openActionMenuId.value = openActionMenuId.value === id ? null : id
  openPopId.value = null // Close other popover
}

function closeAllPopovers() {
  openPopId.value = null
  openActionMenuId.value = null
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('[data-popover-root], [data-action-menu-root]')) {
    closeAllPopovers()
  }
}

function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAllPopovers()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
})

function onChangeStatus(ev: ItemWithDate, to: MaintStatus) {
  const from = (ev.status ?? 'To-Do') as MaintStatus | null
  const at = new Date()
  const k = itemKey(ev)
  const entry: HistoryEntry = { at, by: props.currentUser, from, to }
  optimistic.value[k] = [entry, ...(optimistic.value[k] ?? [])]
  emit('set-status', ev, to)
  emit('status-change', { item: ev, from, to, by: props.currentUser, at })
  closeAllPopovers() // Close menu after selection
}

function fmtDateTimeGB(d: Date | string) {
  return new Date(d).toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ---- UX & Accessibility ----
const liveMsg = ref('')

function announce(msg: string) {
  liveMsg.value = msg
  setTimeout(() => (liveMsg.value = ''), 2000)
}

watch(() => props.isLoading, (v) => {
  if (v) announce('Refreshing maintenance calendar…')
})

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (['input', 'select', 'textarea'].includes(target.tagName.toLowerCase()) || (e as any).isComposing) return
  if (e.key === 'r' || e.key === 'R') {
    emit('refresh')
    announce('Calendar refreshed.')
  }
  // Search shortcut removed
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="space-y-6 bg-slate-50 p-4 sm:p-6 rounded-2xl"
    aria-labelledby="maint-cal-heading"
  >
    <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h2
          id="maint-cal-heading"
          class="text-2xl font-bold text-slate-800 tracking-tight"
        >
          Maintenance Calendar
        </h2>
        <p class="text-slate-500 mt-1">
          Viewing scheduled events for {{ selectedYear }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <button
            :disabled="years.indexOf(selectedYear) <= 0"
            class="year-pager-btn rounded-l-md"
            aria-label="Previous year"
            @click="prevYear"
          >
            <ChevronLeftIcon class="w-4 h-4" />
          </button>
          <select
            v-model="selectedYear"
            class="year-select"
            aria-label="Select year"
          >
            <option
              v-for="y in years"
              :key="y"
              :value="y"
            >
              {{ y }}
            </option>
          </select>
          <button
            :disabled="years.indexOf(selectedYear) >= years.length - 1"
            class="year-pager-btn rounded-r-md"
            aria-label="Next year"
            @click="nextYear"
          >
            <ChevronRightIcon class="w-4 h-4" />
          </button>
        </div>
        <button
          class="btn-primary"
          :aria-busy="!!isLoading"
          title="Refresh (r)"
          @click="emit('refresh')"
        >
          <ArrowPathIcon
            class="w-5 h-5"
            :class="{ 'animate-spin': isLoading }"
          />
          <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
        </button>
      </div>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div class="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
        <button
          :class="timeScope === 'ALL' ? 'filter-btn-active' : 'filter-btn'"
          class="flex-1"
          @click="timeScope = 'ALL'"
        >
          All
        </button>
        <button
          :class="timeScope === 'UPCOMING' ? 'filter-btn-active' : 'filter-btn'"
          class="flex-1"
          @click="timeScope = 'UPCOMING'"
        >
          Upcoming
        </button>
        <button
          :class="timeScope === 'PAST' ? 'filter-btn-active' : 'filter-btn'"
          class="flex-1"
          @click="timeScope = 'PAST'"
        >
          Past
        </button>
      </div>
      <select
        v-model="statusFilter"
        class="filter-input"
        aria-label="Filter by status"
      >
        <option value="ALL">
          All Statuses
        </option>
        <option
          v-for="s in STATUS_LIST"
          :key="s"
          :value="s"
        >
          {{ s }}
        </option>
      </select>
      <div class="flex items-center justify-start md:col-span-2 lg:col-span-1 lg:justify-end gap-2">
        <label class="filter-chip-label">
          <input
            v-model="labelReport"
            type="checkbox"
            class="sr-only peer"
          >
          <span class="filter-chip peer-checked:bg-violet-500 peer-checked:text-white peer-checked:border-violet-500">Report</span>
        </label>
        <label class="filter-chip-label">
          <input
            v-model="labelPreRen"
            type="checkbox"
            class="sr-only peer"
          >
          <span class="filter-chip peer-checked:bg-amber-500 peer-checked:text-white peer-checked:border-amber-500">Pre-renewal</span>
        </label>
        <label class="filter-chip-label">
          <input
            v-model="labelMid"
            type="checkbox"
            class="sr-only peer"
          >
          <span class="filter-chip peer-checked:bg-blue-500 peer-checked:text-white peer-checked:border-blue-500">Mid-year</span>
        </label>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <section
        v-for="v in monthViews"
        :id="`month-${v.meta.key}`"
        :key="v.meta.key"
        class="bg-white rounded-xl shadow-sm ring-1 ring-slate-200/50 p-5 space-y-4"
        :aria-labelledby="`heading-${v.meta.key}`"
      >
        <header class="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <h3
            :id="`heading-${v.meta.key}`"
            class="text-lg font-semibold text-slate-800"
          >
            {{ formatMonth(v.meta.start) }}
          </h3>
          <div class="flex items-center gap-2">
            <span
              v-if="isRenewalMonthUTC(v.meta.start)"
              class="chip chip-green"
            >Renewal</span>
            <span
              v-if="v.summary.total"
              class="text-sm font-medium text-slate-500"
            >{{ v.summary.total }}</span>
          </div>
        </header>

        <ul
          v-if="v.items.length"
          class="space-y-3"
        >
          <li
            v-for="ev in v.items"
            :key="itemKey(ev)"
            class="group rounded-lg ring-1 ring-slate-200/80 hover:ring-slate-300 bg-slate-50/50 hover:bg-white transition-all duration-200 p-3"
          >
            <div class="flex items-start gap-4">
              <div class="flex-shrink-0 w-14 text-center rounded-md overflow-hidden ring-1 ring-slate-200 shadow-sm bg-white">
                <div class="bg-slate-700 text-white text-xs font-bold uppercase py-1">
                  {{ dayWk(ev.dateObj) }}
                </div>
                <div class="text-2xl font-bold text-slate-800 py-1.5">
                  {{ dayNum(ev.dateObj) }}
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="relative group/tooltip">
                  <div class="flex items-center gap-2">
                    <p class="font-semibold text-slate-800 truncate">
                      {{ ev.kind === 'report' || ev.labels?.reportDue ? 'Report Due' : 'Maintenance' }}
                    </p>
                    <svg
                      v-if="!ev.labels?.reportDue"
                      class="w-4 h-4 text-slate-400 cursor-help flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <!-- Maintenance Tasks Tooltip -->
                  <div
                    v-if="!ev.labels?.reportDue"
                    class="invisible group-hover/tooltip:visible absolute bottom-full left-0 mb-2 w-80 bg-slate-800 text-white text-sm rounded-lg shadow-lg p-4 z-50 opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200"
                  >
                    <h4 class="font-semibold mb-3 text-slate-100">
                      {{ ev.labels?.preRenewal || ev.labels?.midYear ? 'Mid/Pre-Renewal Tasks:' : 'Standard Maintenance Tasks:' }}
                    </h4>
                    <ul class="space-y-2 text-slate-200">
                      <li
                        v-if="ev.labels?.preRenewal || ev.labels?.midYear"
                        class="flex items-start gap-2"
                      >
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>Plugin/WordPress Updates</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>Visual Checks (Including mobile and responsive)</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>Check HTACCESS file</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>All Form(s) Check (Live Only) {{ ev.labels?.preRenewal || ev.labels?.midYear ? '- Use group email' : '' }}</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>Site Speed Check</span>
                      </li>
                      <li
                        v-if="ev.labels?.preRenewal || ev.labels?.midYear"
                        class="flex items-start gap-2"
                      >
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>Spot Check Page Links</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <span class="text-slate-400 mt-0.5">•</span>
                        <span>Security {{ ev.labels?.preRenewal || ev.labels?.midYear ? 'Checks' : 'Check' }}</span>
                      </li>
                    </ul>
                    <!-- Tooltip arrow -->
                    <div class="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800" />
                  </div>
                </div>
                <div
                  v-if="ev.labels?.reportDue || ev.labels?.preRenewal || ev.labels?.midYear"
                  class="mt-1.5 flex flex-wrap gap-1.5"
                >
                  <span
                    v-if="ev.labels?.reportDue"
                    class="chip chip-violet"
                  >Report</span>
                  <span
                    v-if="ev.labels?.preRenewal"
                    class="chip chip-amber"
                  >Pre-renewal</span>
                  <span
                    v-if="ev.labels?.midYear"
                    class="chip chip-blue"
                  >Mid-year</span>
                </div>
              </div>
            </div>
            <hr class="my-3 border-slate-200/80">
            <div class="flex items-center justify-between text-sm">
              <div
                v-if="latestHistory(ev)"
                class="relative text-slate-600"
                data-popover-root
              >
                <button
                  type="button"
                  class="flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  :aria-expanded="openPopId === itemKey(ev)"
                  :aria-controls="`pop-${itemKey(ev)}`"
                  @click.stop="togglePop(ev)"
                >
                  <ClockIcon class="w-5 h-5" />
                  <span>{{ byLabel(latestHistory(ev)!.by) }}</span>
                </button>
                <div
                  v-if="openPopId === itemKey(ev)"
                  :id="`pop-${itemKey(ev)}`"
                  role="dialog"
                  aria-label="Status change history"
                  class="popover"
                >
                  <h4 class="font-semibold text-slate-700 mb-2">
                    Status Changes
                  </h4>
                  <ol class="space-y-2 text-xs">
                    <li
                      v-for="(h, i) in displayHistory(ev)"
                      :key="i"
                      class="flex items-start gap-2"
                    >
                      <span class="text-slate-500 whitespace-nowrap mt-0.5">{{ fmtDateTimeGB(h.at) }}</span>
                      <p class="text-slate-700">
                        <strong>{{ byLabel(h.by) }}</strong> changed status from <strong class="font-mono">{{ h.from || 'N/A' }}</strong> to <strong class="font-mono">{{ h.to }}</strong>.
                      </p>
                    </li>
                    <li
                      v-if="!displayHistory(ev).length"
                      class="text-slate-500"
                    >
                      No history entries.
                    </li>
                  </ol>
                  <div class="absolute -top-1.5 left-5 h-3 w-3 rotate-45 bg-white ring-1 ring-slate-200" />
                </div>
              </div>
              <div
                v-else
                class="text-sm text-slate-400"
              >
                No updates
              </div>

              <div class="flex items-center gap-2">
                <span :class="statusClass(ev.status)">{{ ev.status || 'To-Do' }}</span>
                <div
                  v-if="canManageSite"
                  class="relative"
                  data-action-menu-root
                >
                  <button
                    type="button"
                    class="action-menu-btn"
                    aria-label="Update status"
                    @click="toggleActionMenu(ev)"
                  >
                    <EllipsisVerticalIcon class="w-5 h-5" />
                  </button>
                  <div
                    v-if="openActionMenuId === itemKey(ev)"
                    class="action-menu"
                  >
                    <div class="py-1">
                      <button
                        v-for="s in STATUS_LIST"
                        :key="s"
                        class="action-menu-item"
                        :class="{ 'bg-slate-100 text-slate-900': (ev.status || 'To-Do') === s }"
                        @click="onChangeStatus(ev, s)"
                      >
                        {{ s }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <div
          v-else
          class="text-center py-8 px-4 rounded-lg bg-slate-50"
        >
          <h4 class="mt-2 text-sm font-semibold text-slate-800">
            {{ isLoading ? 'Loading Events...' : 'No Events Scheduled' }}
          </h4>
          <p class="mt-1 text-sm text-slate-500">
            {{ isLoading ? 'Please wait a moment.' : 'This month is clear.' }}
          </p>
        </div>
      </section>
    </div>

    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ liveMsg }}
    </p>
  </div>
</template>

<style scoped>
/* Component-specific utility classes */
.btn-primary {
  @apply inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white
         shadow-sm ring-1 ring-slate-800 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
         focus-visible:ring-slate-700 transition-colors duration-200 disabled:opacity-50;
}
.year-pager-btn {
  @apply px-2 py-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:z-10 transition-colors duration-200;
}
.year-select {
  @apply border-x border-slate-200 bg-transparent px-3 py-1.5 text-sm font-medium text-slate-700
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:z-10;
}
.filter-input {
  @apply w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm
         ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-500 transition;
}
.filter-btn {
  @apply rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 transition-colors;
}
.filter-btn-active {
  @apply rounded-md px-3 py-1.5 text-sm font-semibold bg-slate-800 text-white shadow-inner
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-800 transition-colors;
}
.filter-chip-label { @apply cursor-pointer; }
.filter-chip {
  @apply inline-block rounded-full px-3 py-1 text-sm font-medium border border-slate-300 bg-white text-slate-700
         hover:bg-slate-50 transition-colors duration-200;
}
.chip { @apply inline-block rounded-full px-2 py-0.5 text-xs font-semibold; }
.chip-violet { @apply bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200; }
.chip-amber { @apply bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200; }
.chip-blue { @apply bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200; }
.chip-green { @apply bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200; }

.popover {
  @apply absolute z-20 mt-2 w-80 max-w-[85vw] rounded-lg bg-white p-4 shadow-xl
         ring-1 ring-slate-200 focus:outline-none;
}

/* NEW styles for the redesigned status action menu */
.action-menu-btn {
  @apply rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 transition-colors;
}
.action-menu {
  @apply absolute right-0 z-20 mt-2 w-36 origin-top-right rounded-md bg-white shadow-lg
         ring-1 ring-black ring-opacity-5 focus:outline-none;
}
.action-menu-item {
  @apply block w-full px-4 py-2 text-left text-sm text-slate-700
         hover:bg-slate-100 hover:text-slate-900;
}
</style>