<script setup lang="ts">
const me = await $fetch('/api/auth/me')
const name = ref(me?.user?.name || '')
const email = me?.user?.email
const role = me?.user?.role
const pass1 = ref('')
const pass2 = ref('')
const msg = ref<string | null>(null)
const err = ref<string | null>(null)

async function save() {
  msg.value = err.value = null
  if (pass1.value || pass2.value) {
    if (pass1.value !== pass2.value) { err.value = 'Passwords do not match'; return }
    if (pass1.value.length < 8) { err.value = 'Password too short'; return }
  }
  try {
    await $fetch('/api/auth/profile', { method: 'PATCH', body: { name: name.value, password: pass1.value || undefined } })
    msg.value = 'Saved'
  }
  catch (e: any) {
    err.value = e?.data?.message || e?.message || 'Failed'
  }
}
async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  navigateTo('/login')
}
</script>

<template>
  <div class="p-6 max-w-2xl space-y-6">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">
        Account
      </h1>
      <button
        class="ml-auto text-sm underline"
        @click="logout"
      >
        Logout
      </button>
    </div>

    <div class="border rounded-xl p-5 space-y-4 bg-white">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium">Email</label>
          <input
            :value="email"
            disabled
            class="border rounded px-3 py-2 w-full bg-gray-50"
          />
        </div>
        <div>
          <label class="block text-sm font-medium">Role</label>
          <input
            :value="role"
            disabled
            class="border rounded px-3 py-2 w-full bg-gray-50"
          />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium">Name</label>
          <input
            v-model="name"
            class="border rounded px-3 py-2 w-full"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium">New password</label><input
            v-model="pass1"
            type="password"
            class="border rounded px-3 py-2 w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium">Confirm password</label><input
            v-model="pass2"
            type="password"
            class="border rounded px-3 py-2 w-full"
          />
        </div>
      </div>

      <div class="flex gap-3">
        <button
          class="px-4 py-2 rounded bg-black text-white"
          @click="save"
        >
          Save
        </button>
        <p
          v-if="msg"
          class="text-emerald-700 text-sm"
        >
          {{ msg }}
        </p>
        <p
          v-if="err"
          class="text-red-600 text-sm"
        >
          {{ err }}
        </p>
      </div>
    </div>
  </div>
</template>
