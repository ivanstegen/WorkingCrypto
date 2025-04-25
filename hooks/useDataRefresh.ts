import { useCallback, useRef } from 'react'

const DEBOUNCE_DELAY = 1000 // 1 second
const CRYPTO_PREFIX = 'crypto-'

export function useDataRefresh() {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearCryptoStorage = useCallback(() => {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(CRYPTO_PREFIX)) {
        sessionStorage.removeItem(key)
      }
    })
  }, [])

  const refreshData = useCallback(() => {
    // Clear any pending refresh
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    // Debounce the refresh to prevent multiple rapid refreshes
    debounceTimer.current = setTimeout(() => {
      clearCryptoStorage()
      window.location.reload()
    }, DEBOUNCE_DELAY)

    // Cleanup on unmount
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [clearCryptoStorage])

  return { refreshData }
} 