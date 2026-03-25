<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useMutationSync } from '~/composables/useMutationSync'

type Form = {
  id: string
  name: string
  env: 'production' | 'staging' | 'dev' | 'test'
  renewMonth: number
  websiteUrl: string
  gitUrl: string
  contact: string     // primary contact email
  groupEmail: string
}

const form = reactive<Form>({
  id: '',
  name: '',
  env: 'production',
  renewMonth: new Date().getMonth() + 1,
  websiteUrl: '',
  gitUrl: '',
  contact: '',
  groupEmail: ''
})

const created = ref<any|null>(null)
const errorMsg = ref<string|null>(null)
const loading = ref(false)

const schedule = ref<any[] | null>(null)
const scheduleErr = ref<string|null>(null)
const scheduleLoading = ref(false)
const { syncAfterMutation } = useMutationSync()

/* ---------------- helpers ---------------- */
const normalizeUrl = (v: string) => {
  const t = (v || '').trim()
  if (!t) return ''
  try {
    // add protocol if missing
    const withProto = /^(https?:)?\/\//i.test(t) ? t : `https://${t}`
    const u = new URL(withProto)
    return u.toString().replace(/\/$/, '')
  } catch {
    return t
  }
}
const normalizeEmail = (v: string) => (v || '').trim().toLowerCase()

const canSubmit = computed(() => !!form.id.trim() && !loading.value)

/* ---------------- actions ---------------- */
async function submit() {
  loading.value = true
  errorMsg.value = null
  created.value = null
  try {
    const body = {
      id: form.id.trim(),
      name: (form.name || form.id).trim(),
      env: form.env,
      renewMonth: Number(form.renewMonth),
      websiteUrl: normalizeUrl(form.websiteUrl),
      gitUrl: normalizeUrl(form.gitUrl),
      groupEmail: normalizeEmail(form.groupEmail) || null,
      // simple primary contact (details page can manage full contacts later)
      primaryContact: {
        name: null,
        email: normalizeEmail(form.contact) || null,
        phone: null,
        title: null
      }
    }
    const res = await $fetch('/api/scheduler/sites', {
      method: 'POST',
      body
    })
    created.value = res
    syncAfterMutation({ affectsOverview: true })
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || 'Failed'
  } finally {
    loading.value = false
  }
}

async function loadSchedule() {
  scheduleLoading.value = true
  scheduleErr.value = null
  try {
    const res: any = await $fetch('/api/scheduler/maintenance', {
      query: { site: form.id.trim(), env: form.env }
    })
    schedule.value = res?.items || []
  } catch (e: any) {
    scheduleErr.value = e?.data?.message || e?.message || 'Failed to load schedule'
  } finally {
    scheduleLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div class="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
        <NuxtLink to="/dashboard" class="text-sm text-gray-700 hover:text-gray-900">
          ← Back to dashboard
        </NuxtLink>
        <div class="ml-2 text-sm text-gray-400">/</div>
        <h1 class="text-base font-semibold text-gray-900">Sites &amp; Maintenance</h1>
        <div class="ml-auto text-xs text-gray-500">
          {{ new Date().toLocaleString() }}
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-5xl px-4 py-6 space-y-8">
      <!-- Add Site -->
      <section class="rounded-2xl border bg-white p-5 md:p-6 shadow-sm">
        <div class="flex items-start justify-between">
          <h2 class="text-lg font-semibold tracking-tight">Add site</h2>
          <div class="text-xs text-gray-500">Fields marked * are required</div>
        </div>

        <div class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Basics -->
          <div>
            <label class="label">Site ID (slug)*</label>
            <input v-model="form.id" class="input" placeholder="cc-london" />
          </div>
          <div>
            <label class="label">Name</label>
            <input v-model="form.name" class="input" placeholder="Clements & Church (London)" />
          </div>
          <div>
            <label class="label">Environment</label>
            <select v-model="form.env" class="input">
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="dev">dev</option>
              <option value="test">test</option>
            </select>
          </div>
          <div>
            <label class="label">Renew month (1–12)</label>
            <input v-model.number="form.renewMonth" type="number" min="1" max="12" class="input" />
            <p class="mt-1 text-xs text-gray-500">Pre-renewal is one month before this.</p>
          </div>

          <!-- New fields -->
          <div>
            <label class="label">Website URL</label>
            <input v-model="form.websiteUrl" class="input" placeholder="https://example.com" />
          </div>
          <div>
            <label class="label">Git URL</label>
            <input v-model="form.gitUrl" class="input" placeholder="https://github.com/org/repo" />
          </div>
          <div>
            <label class="label">Contact (email)</label>
            <input v-model="form.contact" type="email" class="input" placeholder="name@example.com" />
          </div>
          <div>
            <label class="label">Group email</label>
            <input v-model="form.groupEmail" type="email" class="input" placeholder="client@plott.co.uk" />
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-3">
          <button @click="submit" :disabled="!canSubmit" class="btn-primary">
            {{ loading ? 'Saving…' : 'Save & Generate Schedule' }}
          </button>
          <button @click="loadSchedule" :disabled="!form.id || scheduleLoading" class="btn-secondary">
            {{ scheduleLoading ? 'Loading…' : 'Load Schedule' }}
          </button>
          <p v-if="errorMsg" class="text-sm text-rose-600">{{ errorMsg }}</p>
        </div>

        <div v-if="created" class="mt-4 text-sm">
          <p class="font-medium">Created/Updated:</p>
          <pre class="bg-gray-50 border rounded-xl p-3 overflow-auto">{{ created }}</pre>
        </div>
      </section>

      <!-- Schedule -->
      <section v-if="schedule?.length" class="rounded-2xl border bg-white p-5 md:p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold tracking-tight">Schedule</h2>
          <button @click="loadSchedule" :disabled="scheduleLoading" class="btn-ghost">
            {{ scheduleLoading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-4">Date</th>
                <th class="py-2 pr-4">Labels</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in schedule" :key="it.date" class="border-b last:border-0">
                <td class="py-2 pr-4"><code>{{ new Date(it.date).toLocaleDateString() }}</code></td>
                <td class="py-2 pr-4">
                  <span v-if="it.labels?.preRenewal" class="chip-amber">Pre-renewal</span>
                  <span v-if="it.labels?.midYear" class="chip-blue ml-2">Mid-year</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="scheduleLoading" class="rounded-2xl border bg-white p-5 md:p-6 shadow-sm text-sm text-gray-600">
        Loading schedule…
      </section>

      <section v-else-if="scheduleErr" class="rounded-2xl border bg-white p-5 md:p-6 shadow-sm text-sm text-rose-700">
        {{ scheduleErr }}
      </section>
    </main>
  </div>
</template>

<!-- Tailwind utility shortcuts (optional; remove if you already have these in a global CSS) -->
<style scoped>
.label { @apply block text-sm font-medium text-gray-700; }
.input { @apply w-full rounded-xl border px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10; }
.btn-primary { @apply inline-flex items-center rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50; }
.btn-secondary { @apply inline-flex items-center rounded-xl border px-4 py-2 bg-white hover:bg-gray-50 disabled:opacity-50; }
.btn-ghost { @apply inline-flex items-center rounded-xl px-3 py-2 text-gray-700 hover:bg-gray-100 disabled:opacity-50; }
.chip-amber { @apply inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900; }
.chip-blue { @apply inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900; }
</style>
