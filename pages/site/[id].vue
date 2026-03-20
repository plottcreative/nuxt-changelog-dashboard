<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, watchEffect, defineAsyncComponent, Suspense } from 'vue'
import { useRoute, useRouter, useFetch, useRequestHeaders } from '#imports'
import type { SiteDoc, MaintItem, TabKey, MaintStatus, PrimaryContact } from '~/composables/site'
import { STATUS_LIST } from '~/composables/site'
import SiteHeader from '~/components/site/SiteHeader.vue'
import TabButton from '~/components/site/TabButton.vue'
import CalendarPanel from '~/components/site/CalendarPanel.vue'
import ChangelogPanel from '~/components/site/ChangelogPanel.vue'
import FormsPanel from '~/components/site/FormsPanel.vue'
import NotesPanel from '~/components/site/NotesPanel.vue'
import DetailsPanel from '~/components/site/DetailsPanel.vue'
// Lazy-load SecurityPanel to reduce initial bundle size
const SecurityPanel = defineAsyncComponent(() => import('~/components/site/SecurityPanel.vue'))
import '~/assets/site.css'

import { CalendarIcon, DocumentTextIcon, ClipboardDocumentListIcon, PencilSquareIcon, InformationCircleIcon, ShieldCheckIcon } from '@heroicons/vue/20/solid'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string
const headers = process.server ? useRequestHeaders(['cookie']) : undefined

// --- Auth ---
const me = await $fetch<{ authenticated: boolean; user?: any }>('/api/auth/me', { headers }).catch(() => ({ authenticated: false }))
const authed = !!me?.authenticated
const my = authed ? me.user : null

// Site & maintenance
const { data, pending, error, refresh: refreshSite } = await useFetch<{ site: SiteDoc; items: MaintItem[] }>(
  `/api/scheduler/sites/${id}`, { headers, key: `site-v2-${id}` }
)
const site  = computed(() => data.value?.site)
const items = computed(() => (data.value?.items || []))

// === User directory (for resolving "by" to a display name) ===
const { data: directoryData } = await useFetch<Array<{ id?: string; name?: string; email?: string }>>(
  '/api/users/directory', { headers, key: `users-dir` }
)
const userDirectory = computed(() => directoryData.value || [])

// Tabs
const TABS: { key: TabKey, label: string }[] = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'changelog', label: 'Changelog' },
  { key: 'forms', label: 'Forms' },
  { key: 'notes', label: 'Notes' },
  { key: 'security', label: 'Security' },
  { key: 'details', label: 'Details' },
]
const tab = ref<TabKey>('calendar')
const isMobileNavOpen = ref(false) // State for mobile tab dropdown
const activeTabLabel = computed(() => TABS.find(t => t.key === tab.value)?.label || 'Navigation')
function selectTab(newTab: TabKey) {
  tab.value = newTab
  isMobileNavOpen.value = false
}

// ----- DISPLAY HELPERS -----
const displayWebsiteUrl = computed(() => (site.value as any)?.websiteUrl || (site.value as any)?.url || '')
const displayGitUrl = computed(() => site.value?.gitUrl || '')
const displayContact = computed<PrimaryContact | null>(() => site.value?.primaryContact || null)
const renewMonthName = computed(() => {
  const month = (site.value?.renewMonth || 1) - 1
  return new Date(2000, Math.max(0, Math.min(11, month)), 1).toLocaleString(undefined, { month: 'long' })
})
// All authenticated users can change status and trigger notifications
const canManageSite = computed(() => authed)
const counts = computed(() => ({
  calendar: items.value.length, changelog: undefined, forms: undefined, notes: undefined
}))

// ===== Interactions & Shortcuts =====
const chord = reactive({ waiting: false, timer: 0 as any })
const compact = ref(false)

function closeAllPopovers() { isMobileNavOpen.value = false }
function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('[data-popover-root]')) closeAllPopovers()
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape') closeAllPopovers() }

function startChord(){ chord.waiting = true; clearTimeout(chord.timer); chord.timer = setTimeout(() => { chord.waiting = false }, 800) }
function handleKeydown(e: KeyboardEvent){
  const t = e.target as HTMLElement
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
  if (e.key.toLowerCase() === 'g') { startChord(); return }
  if (chord.waiting) {
    const m: Record<string, TabKey> = { c:'calendar', l:'changelog', f:'forms', n:'notes', s:'security', d:'details' }
    const k = m[e.key.toLowerCase()]; if (k) { tab.value = k; e.preventDefault() }
    chord.waiting = false; return
  }
  if (e.key === 'r') { refreshSite(); e.preventDefault(); }
  if (e.key === 'e') { tab.value = 'details'; e.preventDefault(); }
  if (e.key >= '1' && e.key <= '6') {
    const map: Record<string, TabKey> = { '1':'calendar','2':'changelog','3':'forms','4':'notes','5':'security','6':'details' }
    tab.value = map[e.key]; e.preventDefault()
  }
}
function onScroll () { compact.value = window.scrollY > 16 }
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)

})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
})

// CI badge
const latestCi = ref<any>(null)
const repoSlug = computed(() => {
  const url = displayGitUrl.value || ''
  if (!url) return ''
  try { return new URL(url).pathname.replace(/^\//, '').replace(/\.git$/, '') }
  catch {
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/i)
    return m ? m[1] : ''
  }
})
watch([repoSlug, () => site.value?.env], async ([slug, env]) => {
  if (!slug) { latestCi.value = null; return }
  latestCi.value = await $fetch('/api/ci/latest', { query: { repo: slug, env: env || 'production' } }).catch(() => null)
}, { immediate: true })

// ====== Actions passed down ======
// All logged-in users can change status and trigger notifications
async function setItemStatus(ev, next) {
  if (!canManageSite.value) return
  // Status endpoint handles history tracking and sends email notification to groupEmail
  await $fetch('/api/scheduler/maintenance/status', {
    method: 'PATCH',
    body: {
      siteId: ev.site.id,
      env: ev.site.env,
      date: ev.date,
      status: next,
      from: ev.status ?? null,
      by: my ? { id: my.id, name: my.name, email: my.email } : null
    },
    headers
  }).catch((e) => { console.error('status update failed:', e) })

  await refreshSite()
}

async function recordStatusChange(payload: any) {
  // Status updates are now handled by setItemStatus which triggers notifications
  await refreshSite()
}
function copyToClipboard(text: string){
  try { navigator.clipboard.writeText(text) } catch {}
}
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <header
      class="sticky top-0 z-50 border-b border-black/5 bg-white/60 backdrop-blur-xl supports-[backdrop-filter]:bg-white/50 transition-all duration-200 pb-8"
      :class="compact ? 'py-2' : 'py-3 sm:py-4'"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SiteHeader
          :id="id"
          :site="site"
          :display-website-url="displayWebsiteUrl"
          :display-git-url="displayGitUrl"
          :renew-month-name="renewMonthName"
          :latest-ci="latestCi"
          @copy="copyToClipboard"
        />

        <div class="mt-4">
            <div class="hidden sm:inline-flex items-center gap-1 rounded-2xl border border-black/5 bg-slate-50/80 p-1 shadow-sm">
              <TabButton label="Calendar"  :active="tab==='calendar'"  @click="selectTab('calendar')"  :count="counts.calendar"  :icon="CalendarIcon"/>
              <TabButton label="Changelog" :active="tab==='changelog'" @click="selectTab('changelog')" :count="counts.changelog" :icon="DocumentTextIcon"/>
              <TabButton label="Forms"     :active="tab==='forms'"     @click="selectTab('forms')"     :count="counts.forms"     :icon="ClipboardDocumentListIcon"/>
              <TabButton label="Notes"     :active="tab==='notes'"     @click="selectTab('notes')"     :count="counts.notes"     :icon="PencilSquareIcon"/>
              <TabButton label="Security"  :active="tab==='security'"  @click="selectTab('security')"  :icon="ShieldCheckIcon"/>
              <TabButton label="Details"   :active="tab==='details'"   @click="selectTab('details')"   :icon="InformationCircleIcon"/>
            </div>

          <div class="sm:hidden relative" data-popover-root>
            <button @click="isMobileNavOpen = !isMobileNavOpen" class="mobile-tab-dropdown-btn">
              <span>{{ activeTabLabel }}</span>
              <svg class="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clip-rule="evenodd" /></svg>
            </button>
            <Transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
              <div v-if="isMobileNavOpen" class="absolute left-0 mt-2 w-56 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none z-10">
                <div class="py-1">
                  <button v-for="t in TABS" :key="t.key" @click="selectTab(t.key)" class="mobile-tab-item" :class="{'bg-slate-100 text-slate-900': tab === t.key}">
                    {{ t.label }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
      <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent"></div>
    </header>

    <div class="max-w-7xl mx-auto p-4 sm:p-6 lg:px-8 space-y-6 md:space-y-8 ">
      <div v-if="pending" class="rounded-2xl border bg-white p-6 shadow-sm">
        <div class="animate-pulse space-y-3">
          <div class="h-4 w-40 bg-slate-200 rounded"></div>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <div v-for="i in 6" :key="i" class="h-40 rounded-2xl border bg-slate-100"></div>
          </div>
        </div>
      </div>
      <div v-else-if="error" class="rounded-2xl border bg-white p-8 text-center text-sm text-red-600 shadow-sm">Failed to load site.</div>

      <CalendarPanel v-show="tab==='calendar'" :items="items" :can-manage-site="canManageSite" :current-user="my ? { id: my.id, name: my.name, email: my.email } : undefined" :user-directory="userDirectory" :months-ahead="36" :months-behind="36" @set-status="setItemStatus" @status-change="recordStatusChange" />
      <ChangelogPanel v-show="tab==='changelog'" :site-id="id" :env="site?.env || ''" />
      <FormsPanel v-show="tab==='forms'" :site-id="id" :env="site?.env || ''" />
      <NotesPanel v-show="tab==='notes'" :site-id="id" :env="site?.env" :authed="authed" :my="my" />
      <Suspense v-if="tab === 'security'">
        <SecurityPanel :site-id="id" :site-url="displayWebsiteUrl" :can-manage-site="canManageSite" />
        <template #fallback>
          <div class="rounded-2xl border bg-white p-6 shadow-sm">
            <div class="animate-pulse space-y-4">
              <div class="h-4 w-48 bg-slate-200 rounded"></div>
              <div class="h-32 bg-slate-100 rounded-lg"></div>
            </div>
          </div>
        </template>
      </Suspense>
      <DetailsPanel v-show="tab==='details'" :id="id" :site="site" :can-manage-site="canManageSite" @saved="refreshSite" @deleted="(to)=>router.push(to)" />
    </div>
  </div>
</template>

<style scoped>
.kbd {
  @apply inline-block rounded border border-slate-300 bg-slate-200/50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600;
}
.mobile-tab-dropdown-btn {
  @apply inline-flex items-center justify-between w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800
         shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition-colors;
}
.mobile-tab-item {
  @apply block w-full px-4 py-2 text-left text-sm text-slate-700
         hover:bg-slate-100 hover:text-slate-900;
}
</style>