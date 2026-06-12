<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- Global loading spinner -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 backdrop-blur-md"
      >
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from '#imports'
import { useGlobalLoading } from '~/composables/useGlobalLoading'

const { isLoading, startLoading, stopLoading } = useGlobalLoading()
const router = useRouter()
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

watch(isLoading, (loading) => {
  clearTimeout(hideTimer)
  if (loading) {
    visible.value = true
  }
  else {
    // Small delay before hiding so we don't flash off/on between route guard and page fetch
    hideTimer = setTimeout(() => {
      visible.value = false
    }, 50)
  }
})

router.beforeEach((to, from, next) => {
  startLoading()
  next()
})

router.afterEach(() => {
  // Safety-net: stop loading after a generous window so pages that manage
  // their own loading (e.g. site/[id]) can call startLoading() before this fires.
  setTimeout(() => {
    stopLoading()
  }, 400)
})
</script>
