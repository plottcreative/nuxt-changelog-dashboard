<script setup lang="ts">
const roles = ['viewer', 'manager', 'admin']

const { data, refresh, pending, error } = await useFetch('/api/users')

const form = reactive({ email: '', name: '', role: 'viewer', password: '' })
const creating = ref(false)
const createMsg = ref<string | null>(null)
const createErr = ref<string | null>(null)
const revealPass = ref(false)

async function createUser() {
  createMsg.value = createErr.value = null
  creating.value = true
  try {
    const res: any = await $fetch('/api/users', { method: 'POST', body: form })
    await refresh()
    const pw = res?.tempPassword || form.password || ''
    createMsg.value = `User created${pw ? ' — temporary password: ' + pw : ''}`
    form.email = ''; form.name = ''; form.role = 'viewer'; form.password = ''
    revealPass.value = false
  }
  catch (e: any) {
    createErr.value = e?.data?.message || e?.message || 'Failed to create user'
  }
  finally {
    creating.value = false
  }
}

async function setRole(id: string, role: string) {
  await $fetch(`/api/users/${id}`, { method: 'PATCH', body: { role } })
  refresh()
}
async function del(id: string) {
  if (!confirm('Delete this user?')) return
  await $fetch(`/api/users/${id}`, { method: 'DELETE' })
  refresh()
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">
        Users
      </h1>
    </div>

    <div class="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 class="text-lg font-semibold mb-3">
        Add user
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          v-model="form.email"
          type="email"
          placeholder="Email"
          class="border rounded px-3 py-2 w-full"
        />
        <input
          v-model="form.name"
          placeholder="Name"
          class="border rounded px-3 py-2 w-full"
        />
        <select
          v-model="form.role"
          class="border rounded px-3 py-2 w-full"
        >
          <option
            v-for="r in roles"
            :key="r"
            :value="r"
          >
            {{ r }}
          </option>
        </select>
        <div class="flex items-center gap-2">
          <input
            v-model="form.password"
            :type="revealPass ? 'text' : 'password'"
            placeholder="Password (optional)"
            class="border rounded px-3 py-2 w-full"
          />
          <button
            class="text-xs underline"
            @click="revealPass = !revealPass"
          >
            {{ revealPass ? 'Hide' : 'Show' }}
          </button>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <button
          :disabled="creating"
          class="px-4 py-2 rounded bg-black text-white"
          @click="createUser"
        >
          {{ creating ? 'Creating…' : 'Create user' }}
        </button>
        <p
          v-if="createMsg"
          class="text-emerald-700 text-sm"
        >
          {{ createMsg }}
        </p>
        <p
          v-if="createErr"
          class="text-red-600 text-sm"
        >
          {{ createErr }}
        </p>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        If no password is provided, a temporary one will be generated and shown once.
      </p>
    </div>

    <div v-if="pending">
      Loading…
    </div>
    <div
      v-else-if="error"
      class="text-red-600"
    >
      Failed to load users.
    </div>

    <table
      v-else
      class="min-w-full text-sm border rounded-xl bg-white overflow-hidden"
    >
      <thead class="bg-gray-50">
        <tr class="text-left">
          <th class="py-2 px-3">
            Email
          </th>
          <th class="py-2 px-3">
            Name
          </th>
          <th class="py-2 px-3">
            Role
          </th>
          <th class="py-2 px-3" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="u in data?.users || []"
          :key="u.id"
          class="border-t"
        >
          <td class="py-2 px-3">
            {{ u.email }}
          </td>
          <td class="py-2 px-3">
            {{ u.name }}
          </td>
          <td class="py-2 px-3">
            <select
              :value="u.role"
              class="border rounded px-2 py-1"
              @change="setRole(u.id, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="r in roles"
                :key="r"
                :value="r"
              >
                {{ r }}
              </option>
            </select>
          </td>
          <td class="py-2 px-3 text-right">
            <button
              class="text-red-600 text-sm"
              @click="del(u.id)"
            >
              Delete
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
