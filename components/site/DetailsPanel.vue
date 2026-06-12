<template>
  <div class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">
      Site details
    </h2>

    <div class="rounded-2xl border bg-white p-5 shadow-sm space-y-6">
      <!-- Basics -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="label">Site ID</label>
          <div class="flex items-center gap-2">
            <input
              :value="id"
              disabled
              class="input bg-gray-50"
            />
          </div>
        </div>
        <div>
          <label class="label">Name</label>
          <input
            v-model="det.name"
            class="input"
            :disabled="!canManageSite"
          />
        </div>
        <div>
          <label class="label">Environment</label>
          <select
            v-model="det.env"
            class="input"
            :disabled="!canManageSite"
          >
            <option value="production">
              production
            </option>
            <option value="staging">
              staging
            </option>
            <option value="dev">
              dev
            </option>
            <option value="test">
              test
            </option>
          </select>
        </div>
        <div>
          <label class="label">Renew month (1–12)</label>
          <input
            v-model.number="det.renewMonth"
            type="number"
            min="1"
            max="12"
            class="input"
            :disabled="!canManageSite"
          />
          <p class="mt-1 text-xs text-gray-500">
            Pre-renewal (R−2), Reports due (R−1), Mid-year (pre+6).
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="label">Website URL</label>
          <input
            v-model="det.websiteUrl"
            placeholder="https://example.com"
            class="input"
            :disabled="!canManageSite"
          />
        </div>
        <div>
          <label class="label">Git URL</label>
          <input
            v-model="det.gitUrl"
            placeholder="https://github.com/org/repo"
            class="input"
            :disabled="!canManageSite"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4">
        <div>
          <label class="label">Group Email</label>
          <input
            v-model="det.groupEmail"
            placeholder="clientName@plott.co.uk"
            class="input"
            :disabled="!canManageSite"
          />
        </div>
      </div>

      <!-- Contacts -->
      <div>
        <div class="flex items-center justify-between">
          <label class="label">Contacts</label>
          <button
            v-if="canManageSite"
            type="button"
            class="btn-secondary"
            @click="addContact"
          >
            Add contact
          </button>
        </div>

        <div class="space-y-4">
          <div
            v-for="(c, i) in contacts"
            :key="c._id"
            class="rounded-xl border bg-gray-50 p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-gray-800">
                Contact {{ i + 1 }}
              </p>
              <button
                v-if="canManageSite"
                type="button"
                class="btn-ghost text-rose-700"
                @click="removeContact(i)"
              >
                Remove
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="label">Name</label>
                <input
                  v-model="contacts[i].name"
                  class="input"
                  :disabled="!canManageSite"
                />
              </div>
              <div>
                <label class="label">Job title (optional)</label>
                <input
                  v-model="contacts[i].title"
                  class="input"
                  :disabled="!canManageSite"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Emails -->
              <div>
                <div class="flex items-center justify-between">
                  <label class="label">Emails</label>
                  <button
                    v-if="canManageSite"
                    type="button"
                    class="btn-ghost"
                    @click="addEmail(i)"
                  >
                    Add email
                  </button>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="(e, ei) in c.emails"
                    :key="`${c._id}-e-${ei}`"
                    class="flex items-center gap-2"
                  >
                    <input
                      v-model="contacts[i].emails[ei]"
                      type="email"
                      placeholder="name@example.com"
                      class="input flex-1"
                      :disabled="!canManageSite"
                    />
                    <button
                      v-if="canManageSite"
                      type="button"
                      class="btn-ghost text-rose-700"
                      @click="removeEmail(i, ei)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>

              <!-- Phones -->
              <div>
                <div class="flex items-center justify-between">
                  <label class="label">Phones</label>
                  <button
                    v-if="canManageSite"
                    type="button"
                    class="btn-ghost"
                    @click="addPhone(i)"
                  >
                    Add phone
                  </button>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="(p, pi) in c.phones"
                    :key="`${c._id}-p-${pi}`"
                    class="flex items-center gap-2"
                  >
                    <input
                      v-model="contacts[i].phones[pi]"
                      placeholder="+44 ..."
                      class="input flex-1"
                      :disabled="!canManageSite"
                    />
                    <button
                      v-if="canManageSite"
                      type="button"
                      class="btn-ghost text-rose-700"
                      @click="removePhone(i, pi)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-xs text-gray-600">
              First contact acts as the primary contact for legacy systems.
            </p>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-wrap items-center gap-3">
        <button
          v-if="canManageSite"
          type="button"
          :disabled="detSaving"
          class="btn-primary"
          @click="saveDetails"
        >
          {{ detSaving ? 'Saving…' : 'Save details' }}
        </button>
        <button
          v-if="canManageSite"
          type="button"
          :disabled="deleting"
          class="btn-danger"
          title="Permanently delete this site and its maintenance"
          @click="deleteSite"
        >
          {{ deleting ? 'Deleting…' : 'Delete site' }}
        </button>
        <p
          v-if="detMsg"
          class="text-sm text-emerald-700"
        >
          {{ detMsg }}
        </p>
        <p
          v-if="detErr"
          class="text-sm text-rose-600"
        >
          {{ detErr }}
        </p>
        <p
          v-if="delMsg"
          class="text-sm text-emerald-700"
        >
          {{ delMsg }}
        </p>
        <p
          v-if="delErr"
          class="text-sm text-rose-600"
        >
          {{ delErr }}
        </p>
        <p
          v-if="!canManageSite"
          class="text-sm text-gray-500"
        >
          {{ canManageText }}
        </p>
      </div>

      <!-- Rebuild -->
      <div class="rounded-xl border bg-gray-50 p-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="label">Backfill months</label>
            <input
              v-model.number="rb.backfillMonths"
              type="number"
              min="0"
              max="60"
              class="input w-28"
              :disabled="!canManageSite || rebuilding"
            />
          </div>
          <div>
            <label class="label">Forward months</label>
            <input
              v-model.number="rb.forwardMonths"
              type="number"
              min="0"
              max="60"
              class="input w-28"
              :disabled="!canManageSite || rebuilding"
            />
          </div>
          <button
            v-if="canManageSite"
            type="button"
            :disabled="rebuilding"
            class="ml-auto btn-danger"
            title="Deletes and regenerates cadence + report entries"
            @click="rebuildMaintenance"
          >
            {{ rebuilding ? 'Rebuilding…' : 'Rebuild maintenance' }}
          </button>
        </div>
        <p class="mt-2 text-xs text-gray-600">
          Rebuild deletes existing entries for this site/env and recreates: 2-month cadence anchored at Pre-renewal (R−2),
          Report (R−1), and marks Mid-year (pre+6).
        </p>
        <p
          v-if="rbMsg"
          class="mt-2 text-sm text-emerald-700"
        >
          {{ rbMsg }}
        </p>
        <p
          v-if="rbErr"
          class="mt-2 text-sm text-rose-600"
        >
          {{ rbErr }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { SiteDoc } from '~/composables/site'
import { normalizeUrl } from '~/composables/site'

type Contact = {
  _id: string
  name: string
  title?: string | null
  emails: string[]
  phones: string[]
}

const props = defineProps<{
  id: string
  site?: SiteDoc & {
    groupEmail?: string | null
    contacts?: Array<{
      name?: string | null
      title?: string | null
      email?: string | null
      phone?: string | null
      emails?: string[] | null
      phones?: string[] | null
    }>
  }
  canManageSite: boolean
}>()

const emit = defineEmits<{ (e: 'saved'): void, (e: 'deleted', redirectTo: string): void }>()
const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

/* ------------ Local state ------------ */
let _cid = 0
const newId = () => (++_cid).toString()

const det = reactive({
  name: '',
  env: 'production' as SiteDoc['env'],
  renewMonth: 1,
  websiteUrl: '',
  gitUrl: '',
  groupEmail: '',
})

// IMPORTANT: keep contacts as a ref for rock-solid updates
const contacts = ref<Contact[]>([])

function emptyContact(): Contact {
  return { _id: newId(), name: '', title: '', emails: [''], phones: [''] }
}

const normalizeEmail = (v?: string | null) => {
  const t = (v ?? '').trim()
  return t ? t.toLowerCase() : ''
}

/* ------------ Hydration ------------ */
watch(
  () => props.site,
  (s) => {
    if (!s) return

    det.name = s.name || ''
    det.env = (s.env as any) || 'production'
    det.renewMonth = Number(s.renewMonth || 1)
    det.websiteUrl = (s.websiteUrl || (s as any).url || '')
    det.gitUrl = s.gitUrl || ''
    det.groupEmail = (s as any).groupEmail || ''

    if (Array.isArray((s as any).contacts) && (s as any).contacts.length) {
      contacts.value = (s as any).contacts.map((c: any) => ({
        _id: newId(),
        name: c?.name || '',
        title: c?.title || '',
        emails: (c?.emails?.length ? c.emails : [c?.email || ''])
          .map((e: string) => normalizeEmail(e))
          .filter(Boolean),
        phones: (c?.phones?.length ? c.phones : [c?.phone || ''])
          .map((p: string) => (p ?? '').trim())
          .filter(Boolean),
      }))
    }
    else {
      const legacy = s.primaryContact || {}
      contacts.value = [{
        _id: newId(),
        name: legacy.name || '',
        title: (legacy as any).title || '',
        emails: [normalizeEmail(legacy.email || '')].filter(Boolean),
        phones: [(legacy.phone || '').trim()].filter(Boolean),
      }]
    }

    if (!contacts.value.length) contacts.value.push(emptyContact())
    contacts.value.forEach((c) => {
      if (!c.emails.length) c.emails.push('')
      if (!c.phones.length) c.phones.push('')
    })
  },
  { immediate: true },
)

/* ------------ Helpers ------------ */
function sanitizedContacts() {
  const list = contacts.value
    .map(c => ({
      name: c.name?.trim() || '',
      title: c.title?.toString().trim() || null,
      emails: c.emails.map(e => normalizeEmail(e)).filter(Boolean),
      phones: c.phones.map(p => (p ?? '').trim()).filter(Boolean),
    }))
    .filter(c => c.name || c.title || c.emails.length || c.phones.length)

  return list.length ? list : [{ name: '', title: null, emails: [], phones: [] }]
}

/* ------------ Save ------------ */
const detSaving = ref(false)
const detMsg = ref<string | null>(null)
const detErr = ref<string | null>(null)

async function saveDetails() {
  if (!props.canManageSite) return
  detSaving.value = true; detMsg.value = detErr.value = null

  try {
    const list = sanitizedContacts()
    const first = list[0] || { name: '', title: null, emails: [], phones: [] }
    const primaryContact = {
      name: first.name || null,
      email: first.emails[0] || null,
      phone: first.phones[0] || null,
      title: first.title || null,
    }

    await $fetch('/api/scheduler/sites', {
      method: 'POST',
      body: {
        id: props.id,
        name: det.name,
        env: det.env,
        renewMonth: Number(det.renewMonth),
        websiteUrl: normalizeUrl(det.websiteUrl),
        gitUrl: normalizeUrl(det.gitUrl),
        groupEmail: normalizeEmail(det.groupEmail) || null,
        contacts: list,
        primaryContact,
      },
      headers,
    })

    detMsg.value = 'Saved.'
    emit('saved')
  }
  catch (e: any) {
    detErr.value = e?.data?.message || e?.message || 'Failed to save'
  }
  finally {
    detSaving.value = false
  }
}

/* ------------ Rebuild ------------ */
const rb = reactive({ backfillMonths: 12, forwardMonths: 14 })
const rebuilding = ref(false)
const rbMsg = ref<string | null>(null)
const rbErr = ref<string | null>(null)

async function rebuildMaintenance() {
  if (!props.canManageSite) return
  if (!confirm(`This will rebuild maintenance for ${det.name} (${det.env}). Continue?`)) return
  rebuilding.value = true; rbMsg.value = rbErr.value = null

  try {
    const list = sanitizedContacts()
    const first = list[0] || { name: '', title: null, emails: [], phones: [] }
    const primaryContact = {
      name: first.name || null,
      email: first.emails[0] || null,
      phone: first.phones[0] || null,
      title: first.title || null,
    }

    const res: any = await $fetch('/api/scheduler/sites', {
      method: 'POST',
      body: {
        id: props.id,
        name: det.name,
        env: det.env,
        renewMonth: Number(det.renewMonth),
        websiteUrl: normalizeUrl(det.websiteUrl),
        gitUrl: normalizeUrl(det.gitUrl),
        groupEmail: normalizeEmail(det.groupEmail) || null,
        contacts: list,
        primaryContact,
        rebuild: true,
        backfillMonths: Number(rb.backfillMonths),
        forwardMonths: Number(rb.forwardMonths),
      },
      headers,
    })

    rbMsg.value = `Rebuilt from ${res?.scheduleWindow?.from} to ${res?.scheduleWindow?.to} (${res?.scheduleWindow?.count || 0} dates).`
    emit('saved')
  }
  catch (e: any) {
    rbErr.value = e?.data?.message || e?.message || 'Failed to rebuild'
  }
  finally {
    rebuilding.value = false
  }
}

/* ------------ Delete ------------ */
const deleting = ref(false)
const delErr = ref<string | null>(null)
const delMsg = ref<string | null>(null)

async function deleteSite() {
  if (!props.canManageSite || !props.site) return
  const name = props.site.name || props.site.id || props.id
  if (!confirm(`Delete site "${name}" and all its maintenance?\nThis cannot be undone.`)) return

  deleting.value = true; delErr.value = delMsg.value = null
  try {
    const res: any = await $fetch(`/api/scheduler/sites/${encodeURIComponent(props.id)}?cascade=true`, {
      method: 'DELETE',
      headers,
    })
    delMsg.value = `Deleted. (maintenance removed: ${res?.deleted?.maintenance ?? 0})`
    emit('deleted', '/dashboard')
  }
  catch (e: any) {
    delErr.value = e?.data?.message || e?.message || 'Failed to delete site'
  }
  finally {
    deleting.value = false
  }
}

/* ------------ UI helpers ------------ */
const canManageText = computed(() => props.canManageSite ? '' : 'Sign in as a manager or admin to edit.')

function addContact() {
  contacts.value.push(emptyContact())
}
function removeContact(idx: number) {
  if (!props.canManageSite) return
  if (contacts.value.length === 1) {
    contacts.value.splice(0, 1, emptyContact())
  }
  else {
    contacts.value.splice(idx, 1)
  }
}
function addEmail(idx: number) {
  contacts.value[idx].emails.push('')
}
function removeEmail(cIdx: number, eIdx: number) {
  const arr = contacts.value[cIdx].emails
  if (arr.length === 1) arr[0] = ''
  else arr.splice(eIdx, 1)
}
function addPhone(idx: number) {
  contacts.value[idx].phones.push('')
}
function removePhone(cIdx: number, pIdx: number) {
  const arr = contacts.value[cIdx].phones
  if (arr.length === 1) arr[0] = ''
  else arr.splice(pIdx, 1)
}
</script>
