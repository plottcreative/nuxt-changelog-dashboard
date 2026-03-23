// composables/useGlobalLoading.ts
import { useState } from '#imports'
import { computed } from 'vue'

export const useGlobalLoading = () => {
    const _count = useState<number>('global-loading-count', () => 0)
    const isLoading = computed(() => _count.value > 0)

    const startLoading = () => { _count.value++ }
    const stopLoading = () => { _count.value = Math.max(0, _count.value - 1) }
    const forceStop = () => { _count.value = 0 }

    return {
        isLoading,
        startLoading,
        stopLoading,
        forceStop,
    }
}
