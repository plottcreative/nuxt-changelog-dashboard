<template>
  <div class="bg-white rounded-2xl border shadow-sm">
    <div class="border-b border-slate-200 p-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold text-slate-800">
          Security Scan
        </h2>
        <button
          v-if="canManageSite"
          :disabled="scanning"
          class="btn-primary"
          @click="runScan"
        >
          {{ scanning ? 'Scanning...' : 'Run Security Scan' }}
        </button>
      </div>
      <p class="text-sm text-slate-600 mt-2">
        Automated security vulnerability assessment for {{ siteUrl || 'this site' }}
      </p>
    </div>

    <div class="p-6">
      <!-- Latest Scan Results -->
      <div
        v-if="latestScan"
        class="space-y-6"
      >
        <!-- Overall Status -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="status-badge"
              :class="statusClass(latestScan.overallStatus)"
            >
              <div
                class="status-icon"
                :class="statusIconClass(latestScan.overallStatus)"
              >
                {{ statusIcon(latestScan.overallStatus) }}
              </div>
              <span class="font-medium">{{ statusText(latestScan.overallStatus) }}</span>
            </div>
            <div class="text-sm text-slate-500">
              Score: <span
                class="font-semibold"
                :class="scoreClass(latestScan.score)"
              >{{ latestScan.score }}/100</span>
            </div>
          </div>
          <div class="text-xs text-slate-500">
            Last scanned {{ formatDate(latestScan.scannedAt) }}
          </div>
        </div>

        <!-- Security Checks -->
        <div class="space-y-4">
          <h3 class="font-semibold text-slate-800">
            Security Checks
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="check in latestScan.checks"
              :key="check.name"
              class="check-card"
            >
              <div class="flex items-start gap-3">
                <div
                  class="check-status"
                  :class="checkStatusClass(check.status)"
                >
                  {{ checkStatusIcon(check.status) }}
                </div>
                <div class="min-w-0 flex-1">
                  <h4 class="font-medium text-slate-800 text-sm">
                    {{ check.name }}
                  </h4>
                  <p class="text-xs text-slate-600 mt-1">
                    {{ check.message }}
                  </p>
                  <div
                    v-if="check.details"
                    class="mt-2 text-xs text-slate-500"
                  >
                    <details class="cursor-pointer">
                      <summary class="hover:text-slate-700">
                        View details
                      </summary>
                      <pre class="mt-1 p-2 bg-slate-50 rounded text-[10px] overflow-x-auto">{{ JSON.stringify(check.details, null, 2) }}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recommendations -->
        <div
          v-if="latestScan.recommendations?.length"
          class="space-y-4"
        >
          <h3 class="font-semibold text-slate-800">
            Recommendations
          </h3>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <ul class="space-y-2">
              <li
                v-for="rec in latestScan.recommendations"
                :key="rec"
                class="flex items-start gap-2 text-sm text-amber-800"
              >
                <span class="text-amber-600 font-bold">•</span>
                <span>{{ rec }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- No Scans State -->
      <div
        v-else-if="!scanning"
        class="text-center py-12"
      >
        <div class="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <svg
            class="h-6 w-6 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-slate-800 mb-2">
          No Security Scans
        </h3>
        <p class="text-slate-500 mb-4">
          Run your first security scan to check for vulnerabilities
        </p>
        <button
          v-if="canManageSite"
          class="btn-primary"
          @click="runScan"
        >
          Run First Scan
        </button>
      </div>

      <!-- Scanning State -->
      <div
        v-if="scanning"
        class="text-center py-12"
      >
        <div class="mx-auto h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4 animate-pulse">
          <svg
            class="h-6 w-6 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-slate-800 mb-2">
          Running Security Scan
        </h3>
        <p class="text-slate-500">
          Checking for vulnerabilities and security issues...
        </p>
      </div>

      <!-- Error State -->
      <div
        v-if="error"
        class="bg-red-50 border border-red-200 rounded-lg p-4 mt-4"
      >
        <div class="flex items-start gap-3">
          <div class="text-red-600">
            ⚠️
          </div>
          <div>
            <h4 class="font-medium text-red-800">
              Scan Failed
            </h4>
            <p class="text-sm text-red-700 mt-1">
              {{ error }}
            </p>
          </div>
        </div>
      </div>

      <!-- Scan History -->
      <div
        v-if="scans?.length > 1"
        class="mt-8 border-t border-slate-200 pt-6"
      >
        <h3 class="font-semibold text-slate-800 mb-4">
          Recent Scans
        </h3>
        <div class="space-y-3">
          <div
            v-for="scan in scans.slice(1, 6)"
            :key="scan._id"
            class="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <div
                class="status-badge-small"
                :class="statusClass(scan.overallStatus)"
              >
                {{ statusIcon(scan.overallStatus) }}
              </div>
              <div class="text-sm">
                <span class="font-medium">{{ statusText(scan.overallStatus) }}</span>
                <span class="text-slate-500 ml-2">{{ scan.score }}/100</span>
              </div>
            </div>
            <div class="text-xs text-slate-500">
              {{ formatDate(scan.scannedAt) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface SecurityCheck {
  name: string
  status: 'pass' | 'fail' | 'warning' | 'error'
  message: string
  details?: any
}

interface SecurityScan {
  _id: string
  scannedAt: string
  scannedBy?: string
  overallStatus: 'secure' | 'warnings' | 'vulnerable' | 'error'
  score: number
  checks: SecurityCheck[]
  recommendations: string[]
  url: string
}

const props = defineProps<{
  siteId: string
  siteUrl?: string
  canManageSite: boolean
}>()

const scanning = ref(false)
const error = ref<string | null>(null)
const scans = ref<SecurityScan[]>([])

const latestScan = computed(() => scans.value[0] || null)

// Load scan history
async function loadScans() {
  try {
    const response = await $fetch(`/api/sites/${props.siteId}/security-scans`)
    scans.value = response.scans || []
  }
  catch (err: any) {
    console.error('Failed to load security scans:', err)
  }
}

// Run new security scan
async function runScan() {
  if (scanning.value) return

  scanning.value = true
  error.value = null

  try {
    const result = await $fetch(`/api/sites/${props.siteId}/security-scan`, {
      method: 'POST',
    })

    // Add to the beginning of scans array
    scans.value.unshift({
      _id: Date.now().toString(),
      scannedAt: result.scannedAt,
      overallStatus: result.overallStatus,
      score: result.score,
      checks: result.checks,
      recommendations: result.recommendations,
      url: result.url,
    })
  }
  catch (err: any) {
    error.value = err.data?.statusMessage || err.message || 'Scan failed'
  }
  finally {
    scanning.value = false
  }
}

// Utility functions
function statusClass(status: string) {
  switch (status) {
    case 'secure': return 'status-secure'
    case 'warnings': return 'status-warnings'
    case 'vulnerable': return 'status-vulnerable'
    case 'error': return 'status-error'
    default: return 'status-error'
  }
}

function statusIconClass(status: string) {
  switch (status) {
    case 'secure': return 'text-green-600'
    case 'warnings': return 'text-yellow-600'
    case 'vulnerable': return 'text-red-600'
    case 'error': return 'text-gray-600'
    default: return 'text-gray-600'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'secure': return '✅'
    case 'warnings': return '⚠️'
    case 'vulnerable': return '🔥'
    case 'error': return '❌'
    default: return '❓'
  }
}

function statusText(status: string) {
  switch (status) {
    case 'secure': return 'Secure'
    case 'warnings': return 'Minor Issues'
    case 'vulnerable': return 'Vulnerable'
    case 'error': return 'Scan Error'
    default: return 'Unknown'
  }
}

function scoreClass(score: number) {
  if (score >= 90) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

function checkStatusClass(status: string) {
  switch (status) {
    case 'pass': return 'check-pass'
    case 'warning': return 'check-warning'
    case 'fail': return 'check-fail'
    case 'error': return 'check-error'
    default: return 'check-error'
  }
}

function checkStatusIcon(status: string) {
  switch (status) {
    case 'pass': return '✓'
    case 'warning': return '!'
    case 'fail': return '✗'
    case 'error': return '?'
    default: return '?'
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString()
}

onMounted(() => {
  loadScans()
})
</script>

<style scoped>
.btn-primary {
  @apply inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-blue-600 shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed;
}

.status-badge {
  @apply inline-flex items-center gap-2 px-4 py-2 rounded-full border font-medium;
}

.status-badge-small {
  @apply inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium;
}

.status-secure {
  @apply bg-green-100 text-green-800 border-green-200;
}

.status-warnings {
  @apply bg-yellow-100 text-yellow-800 border-yellow-200;
}

.status-vulnerable {
  @apply bg-red-100 text-red-800 border-red-200;
}

.status-error {
  @apply bg-gray-100 text-gray-800 border-gray-200;
}

.check-card {
  @apply bg-slate-50 rounded-lg p-4 border border-slate-200;
}

.check-status {
  @apply flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0;
}

.check-pass {
  @apply bg-green-100 text-green-700;
}

.check-warning {
  @apply bg-yellow-100 text-yellow-700;
}

.check-fail {
  @apply bg-red-100 text-red-700;
}

.check-error {
  @apply bg-gray-100 text-gray-700;
}
</style>
