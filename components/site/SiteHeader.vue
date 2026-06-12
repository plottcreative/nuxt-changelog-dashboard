<script setup lang="ts">
import { GlobeEuropeAfricaIcon, CodeBracketIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'
import { ArrowPathIcon, EnvelopeIcon, PhoneIcon, EllipsisVerticalIcon, ArrowLeftIcon } from '@heroicons/vue/20/solid'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { SiteDoc, PrimaryContact, Contact } from '~/composables/site'

const props = defineProps<{
  id: string
  site: SiteDoc | undefined
  displayWebsiteUrl: string
  displayGitUrl: string
  renewMonthName: string
  latestCi: any
}>()

const emit = defineEmits<{
  (e: 'copy', text: string): void
}>()

const siteInitial = computed(() => (props.site?.name || props.site?.id || props.id).slice(0, 1).toUpperCase())
const siteHostname = computed(() => {
  try { return props.displayWebsiteUrl ? new URL(props.displayWebsiteUrl).hostname : '' }
  catch { return '' }
})

// Self-hosted favicon logic
const faviconUrl = computed(() => siteHostname.value ? `/api/favicon/${siteHostname.value}` : '')
const favHide = ref(false)
function onFavError() {
  favHide.value = true
}

// Popover State Management
const allContacts = computed(() => props.site?.contacts || [])
const hasContacts = computed(() => allContacts.value.length > 0)
const displayContact = computed<PrimaryContact | null>(() => props.site?.primaryContact || null)
const isContactOpen = ref(false)
const isActionMenuOpen = ref(false) // State for new mobile action menu

function toggleContactPopover() {
  isContactOpen.value = !isContactOpen.value
  isActionMenuOpen.value = false // Close other popover
}
function toggleActionMenu() {
  isActionMenuOpen.value = !isActionMenuOpen.value
  isContactOpen.value = false // Close other popover
}
function closeAllPopovers() {
  isContactOpen.value = false
  isActionMenuOpen.value = false
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('[data-popover-root]')) {
    closeAllPopovers()
  }
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape') closeAllPopovers() }

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
})
</script>

<template>
  <div class="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 bg-slate-50 p-4 sm:p-6 rounded-2xl">
    <div class="flex-shrink-0 relative h-16 w-16 rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
      <img
        v-if="siteHostname && !favHide"
        :src="faviconUrl"
        :alt="site?.name || 'Site Favicon'"
        class="h-9 w-9 object-contain"
        decoding="async"
        loading="lazy"
        fetchpriority="low"
        width="36"
        height="36"
        @error="onFavError"
      />
      <span
        v-else
        class="text-xl font-bold text-slate-600"
      >{{ siteInitial }}</span>
      <span class="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/60" />
    </div>

    <div class="min-w-0 flex-1 space-y-3 w-full">
      <h1
        class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 break-words"
        :title="site?.name || site?.id || id"
      >
        {{ site?.name || site?.id || id }}
      </h1>

      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm text-slate-500">
        <button
          class="flex items-center gap-1.5 group"
          title="Copy site ID"
          @click="$emit('copy', site?.id || id)"
        >
          <ClipboardDocumentIcon class="w-5 h-5" />
          <span class="font-mono text-xs group-hover:text-slate-800 transition-colors">{{ site?.id || id }}</span>
        </button>
        <span
          v-if="displayWebsiteUrl"
          class="hidden sm:inline text-slate-300"
        >•</span>
        <a
          v-if="displayWebsiteUrl"
          :href="displayWebsiteUrl"
          target="_blank"
          class="flex items-center gap-1.5 hover:text-slate-800 transition-colors"
        >
          <GlobeEuropeAfricaIcon class="w-5 h-5" />
          <span>Website</span>
        </a>
        <span
          v-if="displayGitUrl"
          class="hidden sm:inline text-slate-300"
        >•</span>
        <a
          v-if="displayGitUrl"
          :href="displayGitUrl"
          target="_blank"
          class="flex items-center gap-1.5 hover:text-slate-800 transition-colors"
        >
          <CodeBracketIcon class="w-5 h-5" />
          <span>Repo</span>
        </a>
      </div>

      <div class="flex items-center flex-wrap gap-2 pt-1">
        <span
          v-if="site"
          class="meta-tag"
        ><span class="h-2 w-2 rounded-full bg-emerald-500" />{{ site.env }}</span>
        <span
          v-if="site"
          class="meta-tag"
          :title="`Renews in ${renewMonthName}`"
        > <ArrowPathIcon class="w-4 h-4" /> Renew: {{ renewMonthName }}</span>
        <a
          v-if="latestCi?.run?.ci_url"
          :href="latestCi.run.ci_url"
          target="_blank"
          :class="['meta-tag', (latestCi.status||'').toLowerCase().includes('succ') || (latestCi.status||'').toLowerCase().includes('pass') ? 'ci-success' : (latestCi.status||'').toLowerCase().includes('fail') ? 'ci-failure' : (latestCi.status||'').toLowerCase().includes('run') ? 'ci-running' : '']"
        >CI: {{ latestCi.status }}</a>
        <div
          v-if="hasContacts"
          class="relative"
          data-popover-root
        >
          <button
            class="meta-tag"
            @click="toggleContactPopover"
          >
            <EnvelopeIcon class="w-4 h-4" />
            Contacts ({{ allContacts.length }})
          </button>
          <Transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
          >
            <div
              v-if="isContactOpen"
              class="contact-popover absolute mt-2 w-80 rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4 z-10 max-h-96 overflow-y-auto"
            >
              <h4 class="font-semibold text-slate-800 mb-4">
                All Contacts
              </h4>
              <div class="space-y-4">
                <div
                  v-for="(contact, index) in allContacts"
                  :key="index"
                  class="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
                >
                  <h5 class="font-medium text-slate-800">
                    {{ contact.name || `Contact ${index + 1}` }}
                  </h5>
                  <p
                    v-if="contact.title"
                    class="text-xs text-slate-500 mb-2"
                  >
                    {{ contact.title }}
                  </p>

                  <div class="space-y-2 text-sm">
                    <div
                      v-for="email in contact.emails"
                      :key="email"
                      class="flex items-center gap-2"
                    >
                      <EnvelopeIcon class="w-4 h-4 text-slate-400" />
                      <a
                        :href="`mailto:${email}`"
                        class="truncate text-slate-600 hover:text-slate-900 flex-1"
                      >{{ email }}</a>
                      <button
                        class="copy-btn"
                        @click.stop="emit('copy', email)"
                      >
                        Copy
                      </button>
                    </div>
                    <div
                      v-for="phone in contact.phones"
                      :key="phone"
                      class="flex items-center gap-2"
                    >
                      <PhoneIcon class="w-4 h-4 text-slate-400" />
                      <span class="truncate text-slate-600 flex-1">{{ phone }}</span>
                      <button
                        class="copy-btn"
                        @click.stop="emit('copy', phone)"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="!contact.emails?.length && !contact.phones?.length"
                    class="text-xs text-slate-400 italic"
                  >
                    No contact information available
                  </div>
                </div>
              </div>

              <!-- Group Email if available -->
              <div
                v-if="site?.groupEmail"
                class="mt-4 pt-4 border-t border-slate-100"
              >
                <h5 class="font-medium text-slate-800 text-sm">
                  Group Email
                </h5>
                <div class="flex items-center gap-2 mt-2 text-sm">
                  <EnvelopeIcon class="w-4 h-4 text-slate-400" />
                  <a
                    :href="`mailto:${site.groupEmail}`"
                    class="truncate text-slate-600 hover:text-slate-900 flex-1"
                  >{{ site.groupEmail }}</a>
                  <button
                    class="copy-btn"
                    @click.stop="emit('copy', site.groupEmail)"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="w-full sm:w-auto sm:ml-auto flex items-center justify-end flex-shrink-0 gap-2">
      <NuxtLink
        to="/dashboard"
        class="action-link flex items-center gap-2"
      ><ArrowLeftIcon class="w-4 h-4" /> Back</NuxtLink>

      <div class="hidden sm:flex items-center gap-2">
        <a
          v-if="displayWebsiteUrl"
          :href="displayWebsiteUrl"
          target="_blank"
          class="btn-secondary"
        >Open Site</a>
        <a
          v-if="displayGitUrl"
          :href="displayGitUrl"
          target="_blank"
          class="btn-primary"
        >Open Repo</a>
      </div>

      <div
        class="sm:hidden relative"
        data-popover-root
      >
        <button
          class="mobile-action-btn"
          aria-label="More actions"
          @click="toggleActionMenu"
        >
          <EllipsisVerticalIcon class="w-4 h-4" />
        </button>
        <Transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div
            v-if="isActionMenuOpen"
            class="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none z-10"
          >
            <div class="py-1">
              <a
                v-if="displayWebsiteUrl"
                :href="displayWebsiteUrl"
                target="_blank"
                class="mobile-action-item"
              >Open Site</a>
              <a
                v-if="displayGitUrl"
                :href="displayGitUrl"
                target="_blank"
                class="mobile-action-item"
              >Open Repo</a>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meta-tag {
  @apply inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700
         shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 transition-colors cursor-pointer;
}
.ci-success { @apply bg-emerald-50 text-emerald-800 ring-emerald-200; }
.ci-failure { @apply bg-rose-50 text-rose-800 ring-rose-200; }
.ci-running { @apply bg-amber-50 text-amber-800 ring-amber-200 animate-pulse; }

.copy-btn {
  @apply rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200
         hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0;
}

/* Contact list styling */
.contact-popover {
  scrollbar-width: thin;
  scrollbar-color: rgb(203 213 225) transparent;
}
.contact-popover::-webkit-scrollbar {
  width: 6px;
}
.contact-popover::-webkit-scrollbar-track {
  background: transparent;
}
.contact-popover::-webkit-scrollbar-thumb {
  background: rgb(203 213 225);
  border-radius: 3px;
}
.contact-popover::-webkit-scrollbar-thumb:hover {
  background: rgb(148 163 184);
}

.action-link {
  @apply rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400;
}
.btn-secondary {
  @apply rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 bg-white
         shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition-colors
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500;
}
.btn-primary {
  @apply rounded-lg px-4 py-2 text-sm font-semibold text-white bg-slate-800
         shadow-sm ring-1 ring-slate-800 hover:bg-slate-700 transition-colors
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-700;
}

.mobile-action-btn {
  @apply rounded-lg p-2 text-sm font-semibold text-slate-600 hover:bg-slate-100
         ring-1 ring-slate-200 bg-white shadow-sm
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400;
}
.mobile-action-item {
  @apply block w-full px-4 py-2 text-left text-sm text-slate-700
         hover:bg-slate-100 hover:text-slate-900;
}
</style>
