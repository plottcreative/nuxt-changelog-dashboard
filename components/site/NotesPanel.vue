<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'

const props = defineProps<{ siteId: string, env?: string, authed: boolean, my?: any }>()
const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

const notes = ref<{ items: any[] } | null>(null)
async function loadNotes() { notes.value = await $fetch(`/api/sites/${props.siteId}/notes`, { query: { env: props.env }, headers }) }
const noteForm = reactive({ title: '', body: '', pinned: false })
const noteSaving = ref(false)
function canEditNote(n: any) { if (!props.authed) return false; return props.my?.role === 'admin' || props.my?.role === 'manager' || String(n.author?.id) === String(props.my?.id) }
async function saveNote(n: any, patch: any) { await $fetch(`/api/sites/${props.siteId}/notes/${n._id}`, { method: 'PATCH', body: patch, headers }); await loadNotes() }
async function delNote(n: any) { if (!confirm('Delete this note?')) return; await $fetch(`/api/sites/${props.siteId}/notes/${n._id}`, { method: 'DELETE', headers }); await loadNotes() }

async function addNote() {
  if (!props.authed) return
  noteSaving.value = true
  try {
    await $fetch(`/api/sites/${props.siteId}/notes`, {
      method: 'POST',
      body: { ...noteForm, env: props.env },
      headers,
    })
    noteForm.title = ''; noteForm.body = ''; noteForm.pinned = false
    await loadNotes()
  }
  finally { noteSaving.value = false }
}

onMounted(() => { if (props.authed) loadNotes() })
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">
      Notes
    </h2>

    <div
      v-if="authed"
      class="rounded-2xl border bg-white p-5 shadow-sm space-y-3"
    >
      <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          v-model="noteForm.title"
          placeholder="Title"
          class="input md:col-span-3"
        />
        <label class="inline-flex items-center gap-2 text-sm md:col-span-1 select-none">
          <input
            v-model="noteForm.pinned"
            type="checkbox"
            class="rounded border-gray-300 focus:ring-0"
          /> Pinned
        </label>
      </div>
      <textarea
        v-model="noteForm.body"
        rows="4"
        placeholder="Write a note…"
        class="input w-full"
      />
      <div class="flex gap-3">
        <button
          :disabled="noteSaving"
          class="btn-primary"
          @click="addNote"
        >
          {{ noteSaving ? 'Saving…' : 'Add note' }}
        </button>
        <button
          class="btn"
          @click="loadNotes"
        >
          Refresh
        </button>
      </div>
    </div>
    <div
      v-else
      class="rounded-2xl border bg-white p-5 text-sm text-gray-500 shadow-sm"
    >
      Sign in to add and manage notes.
    </div>

    <div class="space-y-3">
      <div
        v-if="!notes?.items"
        class="flex justify-center"
      >
        <button
          class="btn"
          @click="loadNotes"
        >
          Load notes
        </button>
      </div>
      <div
        v-else-if="notes.items.length === 0"
        class="empty"
      >
        No notes yet.
      </div>

      <div
        v-for="n in notes.items"
        v-else
        :key="n._id"
        class="card"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-semibold tracking-tight">
                {{ n.title || 'Untitled' }}
              </h3>
              <span
                v-if="n.pinned"
                class="pill pill-amber"
              >Pinned</span>
            </div>
            <p class="whitespace-pre-wrap text-sm mt-1">
              {{ n.body }}
            </p>
            <p class="text-xs text-gray-500 mt-2">
              by {{ n.author?.name || n.author?.email }} • {{ new Date(n.updatedAt).toLocaleString() }}
            </p>
          </div>
          <div
            v-if="canEditNote(n)"
            class="shrink-0 flex gap-2"
          >
            <button
              class="link text-xs"
              @click="saveNote(n, { pinned: !n.pinned })"
            >
              {{ n.pinned ? 'Unpin' : 'Pin' }}
            </button>
            <button
              class="link text-xs text-rose-600"
              @click="delNote(n)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
