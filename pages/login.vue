
<script setup lang="ts">
definePageMeta({ layout: false, middleware: 'guest' })
const email = ref('')
const password = ref('')
const errorMsg = ref<string|null>(null)
const loading = ref(false)

const { ensure } = useAuth()

async function submit() {
  loading.value = true
  errorMsg.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await ensure(true) // force-refresh cached auth state
    return navigateTo('/dashboard')
  } catch (e:any) {
    errorMsg.value = e?.data?.message || e?.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-gray-50">
    <div class="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
      <h1 class="text-xl font-semibold mb-4">Sign in</h1>
      <div class="space-y-3">
        <input v-model="email" type="email" placeholder="Email" class="border rounded px-3 py-2 w-full" />
        <input v-model="password" type="password" placeholder="Password" class="border rounded px-3 py-2 w-full" />
        <button @click="submit" :disabled="loading" class="w-full px-4 py-2 rounded bg-black text-white">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
      </div>
    </div>
  </div>
</template>
