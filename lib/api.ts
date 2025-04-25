/**
 * Utility functions for API requests
 */

// Default timeout for fetch requests (in milliseconds)
const DEFAULT_TIMEOUT = 30000

/**
 * Fetch with timeout and better error handling
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT,
): Promise<Response> {
  // Create an abort controller for this request
  const controller = new AbortController()
  const { signal } = controller

  // Set up timeout
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeout)

  try {
    // Merge the provided signal with our timeout signal
    const mergedOptions: RequestInit = {
      ...options,
      signal,
    }

    const response = await fetch(url, mergedOptions)
    clearTimeout(timeoutId)

    return response
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error) {
      // Check if this is an abort error
      if (error.name === "AbortError") {
        throw new Error("Request timed out")
      }
    }

    // Re-throw the original error
    throw error
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000, backoff = 2): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries <= 0) {
      throw error
    }

    // Wait for the specified delay
    await new Promise((resolve) => setTimeout(resolve, delay))

    // Retry with exponential backoff
    return retry(fn, retries - 1, delay * backoff, backoff)
  }
}

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine
}

/**
 * Format API error messages
 */
export function formatApiError(error: unknown): string {
  if (!isOnline()) {
    return "You appear to be offline. Please check your internet connection and try again."
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("timeout")) {
      return "The request timed out. Please try again."
    }
    return error.message
  }

  return "An unknown error occurred. Please try again."
}

/**
 * Check if a response indicates a rate limit error
 */
export function isRateLimited(response: Response): boolean {
  return response.status === 429
}

/**
 * Get the retry delay from a rate-limited response
 */
export function getRetryAfter(response: Response): number {
  const retryAfter = response.headers.get("Retry-After")
  if (retryAfter) {
    // Retry-After can be a date or seconds
    if (isNaN(Number(retryAfter))) {
      // It's a date
      const retryDate = new Date(retryAfter)
      return Math.max(0, Math.floor((retryDate.getTime() - Date.now()) / 1000))
    }
    // It's seconds
    return Number(retryAfter)
  }
  // Default to 60 seconds if no header is present
  return 60
}

/**
 * Cache management utilities
 */
export const cacheUtils = {
  /**
   * Get data from cache
   */
  get<T>(key: string): { data: T; timestamp: number } | null {
    try {
      const cached = sessionStorage.getItem(key)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.error("Error retrieving from cache:", error)
    }
    return null
  },

  /**
   * Store data in cache
   */
  set<T>(key: string, data: T, timestamp = Date.now()): void {
    try {
      sessionStorage.setItem(key, JSON.stringify({ data, timestamp }))
    } catch (error) {
      console.error("Error storing in cache:", error)
    }
  },

  /**
   * Check if cached data is still valid
   */
  isValid(key: string, maxAge: number): boolean {
    const cached = this.get(key)
    if (!cached) return false
    return Date.now() - cached.timestamp < maxAge
  },

  /**
   * Clear specific cache entry
   */
  clear(key: string): void {
    try {
      sessionStorage.removeItem(key)
    } catch (error) {
      console.error("Error clearing cache:", error)
    }
  },

  /**
   * Clear all cache entries with a specific prefix
   */
  clearByPrefix(prefix: string): void {
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith(prefix)) {
          sessionStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.error("Error clearing cache by prefix:", error)
    }
  },
}
