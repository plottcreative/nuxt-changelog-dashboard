<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAsyncData } from '#imports'
import type { FormLog } from '~/composables/site'
import { toISOOrUndefined } from '~/composables/site'

const props = defineProps<{ siteId: string, env: string }>()
const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

const selectedEnv = ref<string>(''); watchEffect(() => { selectedEnv.value = props.env || '' })
const flLimit = ref(20); const flEmail = ref(''); const flFrom = ref(''); const flTo = ref('')
const { data: flData, pending: flPending, refresh: flRefresh } = await useAsyncData<{ items: FormLog[] }>(
  `site-formlogs-${props.siteId}`,
  () => $fetch('/api/form-logs', { query: {
    site: props.siteId, env: selectedEnv.value || undefined, limit: flLimit.value, email: flEmail.value || undefined,
    from: toISOOrUndefined(flFrom.value), to: toISOOrUndefined(flTo.value),
  }, headers }),
  { watch: [selectedEnv, flLimit, flEmail, flFrom, flTo] },
)
function moreForms() { flLimit.value += 20 }

// Notification tracking
const notificationUpdates = ref<Record<string, Partial<FormLog>>>({})

function updateNotificationField(logId: string | undefined, field: 'notificationRecipient' | 'notificationDate', value: string) {
  if (!logId) return

  // Validate date field to prevent future dates
  if (field === 'notificationDate' && value) {
    const selectedDate = new Date(value)
    const now = new Date()
    if (selectedDate > now) {
      // Don't update if the date is in the future
      return
    }
  }

  if (!notificationUpdates.value[logId]) {
    notificationUpdates.value[logId] = {}
  }

  notificationUpdates.value[logId][field] = value || undefined

  // Also update the local data for immediate UI feedback
  const log = flData.value?.items.find(item => item._id === logId)
  if (log) {
    log[field] = value || undefined
  }
}

async function saveNotificationData(logId: string | undefined) {
  if (!logId || !notificationUpdates.value[logId]) return

  try {
    await $fetch(`/api/forms/${logId}/notification`, {
      method: 'PATCH',
      body: notificationUpdates.value[logId],
      headers,
    })

    // Clear the pending updates for this log
    delete notificationUpdates.value[logId]

    // Optionally refresh the data to ensure consistency
    // await flRefresh()
  }
  catch (error) {
    console.error('Failed to save notification data:', error)
  }
}

// Helper functions for date validation and read-only state
function getCurrentDateTime(): string {
  return new Date().toISOString().slice(0, 16)
}

function isNotificationLocked(log: FormLog): boolean {
  // Lock if both recipient and date are already saved (not just pending updates)
  return !!(log.notificationRecipient && log.notificationDate
    && !notificationUpdates.value[log._id || ''])
}

function canSaveNotification(log: FormLog): boolean {
  const updates = notificationUpdates.value[log._id || ''] || {}
  const recipient = updates.notificationRecipient ?? log.notificationRecipient
  const dateValue = updates.notificationDate ?? log.notificationDate

  // Must have both recipient and date to save
  if (!recipient || !dateValue) return false

  // Check if date is not in the future
  const selectedDate = new Date(dateValue)
  const now = new Date()
  return selectedDate <= now
}

function formatLoggedDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString()
  }
  catch {
    return dateStr
  }
}
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">
      Forms
    </h2>
    <div class="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
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
        <div>
          <label class="label">Email</label>
          <input
            v-model="flEmail"
            placeholder="name@plott.co.uk"
            class="input"
          />
        </div>
        <div>
          <label class="label">From</label>
          <input
            v-model="flFrom"
            type="datetime-local"
            class="input"
          />
        </div>
        <div>
          <label class="label">To</label>
          <input
            v-model="flTo"
            type="datetime-local"
            class="input"
          />
        </div>
        <div class="flex items-end gap-2">
          <input
            v-model.number="flLimit"
            type="number"
            min="1"
            class="input w-24"
          />
          <button
            class="btn-primary"
            :disabled="flPending"
            @click="flRefresh"
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        v-if="flPending"
        class="text-sm text-gray-500"
      >
        Loading submissions…
      </div>
      <div
        v-else-if="(flData?.items || []).length === 0"
        class="empty"
      >
        No form submissions.
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <div
          v-for="(log, i) in flData?.items || []"
          :key="log._id || i"
          class="card"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-medium">
                {{ new Date(log.entry?.created_at || (log as any).receivedAt).toLocaleString() }}
              </div>
              <div class="text-xs text-gray-500">
                {{ log.form?.title || 'Form' }} • {{ log.entry?.email }}
              </div>
            </div>
            <span class="pill pill-purple">GF submission</span>
          </div>

          <!-- Notification Tracking Section -->
          <div class="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 class="text-sm font-medium text-blue-900 mb-2">
              Notification Tracking
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="text-xs font-medium text-blue-800 block mb-1">Who received notification:</label>
                <input
                  :value="log.notificationRecipient || ''"
                  :readonly="isNotificationLocked(log)"
                  type="text"
                  placeholder="Enter recipient name"
                  class="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  :class="{ 'bg-gray-100 cursor-not-allowed': isNotificationLocked(log) }"
                  @input="updateNotificationField(log._id, 'notificationRecipient', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-blue-800 block mb-1">Date received:</label>
                <input
                  :value="log.notificationDate ? new Date(log.notificationDate).toISOString().slice(0, 16) : ''"
                  :max="getCurrentDateTime()"
                  :readonly="isNotificationLocked(log)"
                  type="datetime-local"
                  class="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  :class="{ 'bg-gray-100 cursor-not-allowed': isNotificationLocked(log) }"
                  @input="updateNotificationField(log._id, 'notificationDate', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="flex items-end">
                <button
                  v-if="!isNotificationLocked(log)"
                  :disabled="!log._id || !canSaveNotification(log)"
                  class="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="saveNotificationData(log._id)"
                >
                  Save
                </button>
                <div
                  v-else
                  class="flex flex-col items-end"
                >
                  <span class="text-xs text-green-700 font-medium">✓ Logged</span>
                  <span class="text-xs text-gray-500">
                    {{ log.notificationDate ? formatLoggedDate(log.notificationDate) : '' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3 overflow-hidden rounded-lg ring-1 ring-gray-200">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr class="text-left">
                  <th class="th">
                    Field
                  </th>
                  <th class="th">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr
                  v-for="(val, label) in (log.fields || {})"
                  :key="label"
                  class="align-top"
                >
                  <td class="td font-medium">
                    {{ label }}
                  </td>
                  <td class="td break-all">
                    {{ val }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="text-xs text-gray-500 mt-2">
            PHP {{ log.run?.php_version }} • WP {{ log.run?.wp_version }} • GF {{ log.run?.gf_version }}
          </p>
        </div>

        <div class="flex justify-center">
          <button
            class="btn"
            @click="moreForms"
          >
            Load more
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
