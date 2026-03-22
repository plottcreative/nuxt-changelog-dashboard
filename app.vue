<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- Global loading spinner -->
    <div
      v-if="isLoading"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 backdrop-blur-md transition-all"
    >
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from '#imports'
import { useGlobalLoading } from '~/composables/useGlobalLoading'

const { isLoading, startLoading, stopLoading } = useGlobalLoading()
const router = useRouter()

router.beforeEach((to, from, next) => {
  startLoading()
  next()
})

router.afterEach(() => {
  // Wait a tiny bit to ensure the new page has started rendering
  // (the page may trigger stopLoading itself after its data is ready)
  setTimeout(() => {
    stopLoading()
  }, 100)
})
</script>