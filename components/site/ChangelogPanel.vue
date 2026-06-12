<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAsyncData } from '#imports'
import type { ChangelogEntry } from '~/composables/site'
import { toISOOrUndefined } from '~/composables/site'

const props = defineProps<{ siteId: string, env: string }>()
const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

const selectedEnv = ref<string>(''); watchEffect(() => { selectedEnv.value = props.env || '' })
const clLimit = ref(20); const clPkg = ref(''); const clFrom = ref(''); const clTo = ref('')
const { data: clData, pending: clPending, refresh: clRefresh } = await useAsyncData<{ items: ChangelogEntry[] }>(
  `site-changelogs-${props.siteId}`,
  () => $fetch('/api/changelogs', { query: {
    site: props.siteId, env: selectedEnv.value || undefined, limit: clLimit.value, pkg: clPkg.value || undefined,
    from: toISOOrUndefined(clFrom.value), to: toISOOrUndefined(clTo.value),
  }, headers }),
  { watch: [selectedEnv, clLimit, clPkg, clFrom, clTo] },
)
function moreChangelogs() { clLimit.value += 20 }
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">
      Changelog
    </h2>
    <div class="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div class="md:col-span-1">
          <label class="label">Environment</label>
          <select
            v-model="selectedEnv"
            class="input"
          >
            <option value="">
              All
            </option>
            <option :value="env">
              {{ env }}
            </option>
          </select>
        </div>
        <div class="md:col-span-1">
          <label class="label">Package</label>
          <input
            v-model="clPkg"
            placeholder="vendor/package"
            class="input"
          />
        </div>
        <div class="md:col-span-1">
          <label class="label">From</label>
          <input
            v-model="clFrom"
            type="datetime-local"
            class="input"
          />
        </div>
        <div class="md:col-span-1">
          <label class="label">To</label>
          <input
            v-model="clTo"
            type="datetime-local"
            class="input"
          />
        </div>
        <div class="md:col-span-1 flex items-end gap-2">
          <input
            v-model.number="clLimit"
            type="number"
            min="1"
            class="input w-24"
          />
          <button
            class="btn-primary"
            :disabled="clPending"
            @click="clRefresh"
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        v-if="clPending"
        class="text-sm text-gray-500"
      >
        Loading changes…
      </div>
      <div
        v-else-if="(clData?.items || []).length === 0"
        class="empty"
      >
        No changelog entries.
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <div
          v-for="(entry, idx) in clData?.items || []"
          :key="entry._id || entry.run?.timestamp || idx"
          class="card"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                {{ new Date(entry.run?.timestamp || entry.receivedAt).toLocaleString() }}
              </div>
              <div class="text-xs text-gray-500">
                {{ entry.site?.env }}
                <span v-if="entry.run?.git_branch"> • {{ entry.run.git_branch }}</span>
                <span v-if="entry.run?.git_sha"> ({{ entry.run.git_sha }})</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="pill pill-blue">Updated: {{ entry.summary?.updated_count || 0 }}</span>
              <span class="pill pill-emerald">Added: {{ entry.summary?.added_count || 0 }}</span>
              <span class="pill pill-rose">Removed: {{ entry.summary?.removed_count || 0 }}</span>
              <span class="pill pill-gray">Unchanged: {{ entry.summary?.unchanged_count || 0 }}</span>
              <span
                v-if="entry.summary?.total_plugins"
                class="pill pill-gray"
              >Total: {{ entry.summary?.total_plugins }}</span>
            </div>
          </div>

          <div class="mt-3 overflow-hidden rounded-lg ring-1 ring-gray-200">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr class="text-left">
                  <th class="th">
                    Package
                  </th>
                  <th class="th">
                    Old
                  </th>
                  <th class="th">
                    New
                  </th>
                  <th class="th">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody
                v-if="(entry.plugins && entry.plugins.length) || (!entry.summary?.has_changes)"
                class="divide-y"
              >
                <tr
                  v-for="p in (entry.plugins || [])"
                  :key="'all-'+p.name"
                >
                  <td
                    class="td font-medium"
                    :title="p.name"
                  >
                    {{ p.displayName || p.name }}
                  </td>
                  <td class="td">
                    <code>{{ p.old ?? (p.status==='added'||p.status==='current' ? '—' : '') }}</code>
                  </td>
                  <td class="td">
                    <code>{{ p.new ?? (p.status==='removed' ? '—' : '') }}</code>
                  </td>
                  <td class="td">
                    <span
                      class="pill"
                      :class="{
                        'pill-blue': p.status==='updated',
                        'pill-emerald': p.status==='added' || p.status==='current',
                        'pill-rose': p.status==='removed',
                        'pill-gray': p.status==='unchanged',
                      }"
                    >{{ p.status }}</span>
                  </td>
                </tr>
                <tr v-if="!entry.plugins || entry.plugins.length===0">
                  <td
                    class="td"
                    colspan="4"
                  >
                    <em>No dependency changes. (Snapshot not available for this run.)</em>
                  </td>
                </tr>
              </tbody>

              <tbody
                v-else
                class="divide-y"
              >
                <tr
                  v-for="p in entry.changes?.updated || []"
                  :key="'u-'+p.name"
                >
                  <td
                    class="td font-medium"
                    :title="p.name"
                  >
                    {{ p.displayName || p.name }}
                  </td>
                  <td class="td">
                    <code>{{ p.old }}</code>
                  </td>
                  <td class="td">
                    <code>{{ p.new }}</code>
                  </td>
                  <td class="td">
                    <span class="pill pill-blue">updated</span>
                  </td>
                </tr>
                <tr
                  v-for="p in entry.changes?.added || []"
                  :key="'a-'+p.name"
                >
                  <td
                    class="td font-medium text-emerald-700"
                    :title="p.name"
                  >
                    {{ p.displayName || p.name }}
                  </td>
                  <td class="td">
                    <em>—</em>
                  </td>
                  <td class="td">
                    <code>{{ p.new }}</code>
                  </td>
                  <td class="td">
                    <span class="pill pill-emerald">added</span>
                  </td>
                </tr>
                <tr
                  v-for="p in entry.changes?.removed || []"
                  :key="'r-'+p.name"
                >
                  <td
                    class="td font-medium text-rose-700"
                    :title="p.name"
                  >
                    {{ p.displayName || p.name }}
                  </td>
                  <td class="td">
                    <code>{{ p.old }}</code>
                  </td>
                  <td class="td">
                    <em>—</em>
                  </td>
                  <td class="td">
                    <span class="pill pill-rose">removed</span>
                  </td>
                </tr>
                <tr
                  v-for="p in entry.changes?.unchanged || []"
                  :key="'n-'+p.name"
                >
                  <td
                    class="td font-medium text-gray-700"
                    :title="p.name"
                  >
                    {{ p.displayName || p.name }}
                  </td>
                  <td class="td">
                    <code>{{ p.version }}</code>
                  </td>
                  <td class="td">
                    <code>{{ p.version }}</code>
                  </td>
                  <td class="td">
                    <span class="pill pill-gray">unchanged</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-2">
            <a
              v-if="entry.run?.ci_url"
              :href="entry.run.ci_url"
              target="_blank"
              class="link"
            >CI build</a>
          </div>
        </div>

        <div class="flex justify-center">
          <button
            class="btn"
            @click="moreChangelogs"
          >
            Load more
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
