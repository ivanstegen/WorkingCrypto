export interface SearchSuggestion {
  id: string
  name: string
  symbol: string
}

const CACHE_EXPIRY = 10 * 60 * 1000 // 10 minutes

export function getCachedSuggestions(query: string): SearchSuggestion[] | null {
  const cacheKey = `search-suggestions-${query.toLowerCase()}`
  const cachedData = sessionStorage.getItem(cacheKey)

  if (cachedData) {
    const { data, timestamp } = JSON.parse(cachedData)
    if (Date.now() - timestamp < CACHE_EXPIRY) {
      return data
    }
  }

  return null
}

export function cacheSuggestions(query: string, suggestions: SearchSuggestion[]): void {
  const cacheKey = `search-suggestions-${query.toLowerCase()}`
  sessionStorage.setItem(
    cacheKey,
    JSON.stringify({
      data: suggestions,
      timestamp: Date.now(),
    }),
  )
} 