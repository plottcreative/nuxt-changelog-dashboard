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
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600"></div>
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
let showTimer: ReturnType<typeof setTimeout> | undefined

// Delay showing the spinner so fast navigations (e.g. pressing back) never flash it
watch(isLoading, (loading) => {
  clearTimeout(showTimer)
  if (loading) {
    showTimer = setTimeout(() => { visible.value = true }, 200)
  } else {
    visible.value = false
  }
})

router.beforeEach((to, from, next) => {
  startLoading()
  next()
})

router.afterEach(() => {
  setTimeout(() => {
    stopLoading()
  }, 100)
})
</script>
