// composables/useGlobalLoading.ts
import { useState } from '#imports'

export const useGlobalLoading = () => {
    const isLoading = useState<boolean>('global-loading', () => false)

    const startLoading = () => {
        isLoading.value = true
    }

    const stopLoading = () => {
        isLoading.value = false
    }

    return {
        isLoading,
        startLoading,
        stopLoading,
    }
}