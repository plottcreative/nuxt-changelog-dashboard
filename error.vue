<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps({
  error: Object as () => NuxtError,
})
</script>

<template>
  <div class="flex items-center justify-center h-[100dvh] text-center">
    <div class="">
      <h1 class="text-5xl mb-3">
        {{ error.statusCode }}
      </h1>
      <p class="mb-7">
        {{ error.message }}
      </p>
      <NuxtLink
        to="/"
        class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded block w-fit uppercase"
      >Dashboard</NuxtLink>
    </div>
  </div>
</template>
