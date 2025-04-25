// Add this to the top of api-utils.ts

import {
  fetchCryptoList as fetchCryptoCompareList,
  fetchCryptoDetail as fetchCryptoCompareDetail,
  fetchCryptoChartData as fetchCryptoCompareChartData,
} from "./crypto-compare-api"

import { API_CONFIG, CACHE_CONFIG } from "./api-config"
import { fetchWithFallback, fetchFromFallbackApi } from "./api-fetch"
import { getMockData } from "./mock-data"

// Add this after the API_CONFIG object
// API status tracking
export const apiStatus = {
  primary: { available: true, lastChecked: 0 },
  secondary: { available: true, lastChecked: 0 },
  tertiary: { available: true, lastChecked: 0 },
  currentSource: "primary" as "primary" | "secondary" | "tertiary" | "mock",

  // Reset all API statuses
  resetStatuses() {
    this.primary.available = true
    this.secondary.available = true
    this.tertiary.available = true
    this.primary.lastChecked = 0
    this.secondary.lastChecked = 0
    this.tertiary.lastChecked = 0
    this.currentSource = "primary"
  },

  // Update API status
  updateStatus(api: "primary" | "secondary" | "tertiary", available: boolean) {
    this[api].available = available
    this[api].lastChecked = Date.now()

    // Update current source based on availability
    if (api === this.currentSource && !available) {
      if (this.primary.available) {
        this.currentSource = "primary"
      } else if (this.secondary.available) {
        this.currentSource = "secondary"
      } else if (this.tertiary.available) {
        this.currentSource = "tertiary"
      } else {
        this.currentSource = "mock"
      }
    } else if (available && this.currentSource === "mock") {
      this.currentSource = api
    }
  },
}

// Update the getCryptoList function
export async function getCryptoList(currency = "usd", forceRefresh = false) {
  const cacheKey = `crypto-list-${currency}`

  try {
    // Try primary API (CoinGecko) first if it's available
    if (apiStatus.primary.available) {
      try {
        const response = await fetchWithFallback(
          API_CONFIG.primary.endpoints.markets,
          {
            vs_currency: currency,
            order: "market_cap_desc",
            per_page: "250",
            page: "1",
            sparkline: "false",
            price_change_percentage: "24h",
          },
          {
            cacheKey,
            cacheTime: CACHE_CONFIG.marketsList,
            forceRefresh,
            useFallback: false, // Don't use fallback yet
          },
        )

        apiStatus.updateStatus("primary", true)
        return response
      } catch (error) {
        console.error("Primary API error:", error)
        apiStatus.updateStatus("primary", false)
      }
    }

    // Try secondary API (CoinCap) if primary failed
    if (apiStatus.secondary.available) {
      try {
        const response = await fetchFromFallbackApi(API_CONFIG.primary.endpoints.markets, { vs_currency: currency })

        apiStatus.updateStatus("secondary", true)
        return response
      } catch (error) {
        console.error("Secondary API error:", error)
        apiStatus.updateStatus("secondary", false)
      }
    }

    // Try tertiary API (CryptoCompare) if both primary and secondary failed
    if (apiStatus.tertiary.available) {
      try {
        const response = await fetchCryptoCompareList(currency, forceRefresh)
        apiStatus.updateStatus("tertiary", true)
        return { data: response } // Match the expected format
      } catch (error) {
        console.error("Tertiary API error:", error)
        apiStatus.updateStatus("tertiary", false)
      }
    }

    // If all APIs failed, use mock data
    apiStatus.currentSource = "mock"
    return getMockData(API_CONFIG.primary.endpoints.markets, { vs_currency: currency })
  } catch (error) {
    console.error("Error fetching crypto list:", error)
    throw error
  }
}

// Update the getCryptoDetail function
export async function getCryptoDetail(id: string, currency = "usd", forceRefresh = false) {
  const cacheKey = `crypto-detail-${id}-${currency}`

  try {
    // Try primary API (CoinGecko) first if it's available
    if (apiStatus.primary.available) {
      try {
        const response = await fetchWithFallback(
          API_CONFIG.primary.endpoints.coinDetail.replace("{id}", id),
          {
            localization: "false",
            tickers: "false",
            market_data: "true",
            community_data: "false",
            developer_data: "false",
            sparkline: "true",
          },
          {
            cacheKey,
            cacheTime: CACHE_CONFIG.coinDetail,
            forceRefresh,
            useFallback: false, // Don't use fallback yet
          },
        )

        apiStatus.updateStatus("primary", true)
        return response
      } catch (error) {
        console.error(`Primary API error for ${id}:`, error)
        apiStatus.updateStatus("primary", false)
      }
    }

    // Try secondary API (CoinCap) if primary failed
    if (apiStatus.secondary.available) {
      try {
        const response = await fetchFromFallbackApi(API_CONFIG.primary.endpoints.coinDetail.replace("{id}", id), {
          vs_currency: currency,
        })

        apiStatus.updateStatus("secondary", true)
        return response
      } catch (error) {
        console.error(`Secondary API error for ${id}:`, error)
        apiStatus.updateStatus("secondary", false)
      }
    }

    // Try tertiary API (CryptoCompare) if both primary and secondary failed
    if (apiStatus.tertiary.available) {
      try {
        const response = await fetchCryptoCompareDetail(id, currency, forceRefresh)
        apiStatus.updateStatus("tertiary", true)
        return response
      } catch (error) {
        console.error(`Tertiary API error for ${id}:`, error)
        apiStatus.updateStatus("tertiary", false)
      }
    }

    // If all APIs failed, use mock data
    apiStatus.currentSource = "mock"
    return getMockData(API_CONFIG.primary.endpoints.coinDetail.replace("{id}", id), { vs_currency: currency })
  } catch (error) {
    console.error(`Error fetching details for ${id}:`, error)
    throw error
  }
}

// Update the getCryptoChartData function
export async function getCryptoChartData(id: string, currency = "usd", days = "7", forceRefresh = false) {
  const cacheKey = `chart-${id}-${currency}-${days}`

  try {
    // Try primary API (CoinGecko) first if it's available
    if (apiStatus.primary.available) {
      try {
        // For longer time ranges, use daily interval to reduce data points
        const interval = Number(days) > 90 ? "daily" : undefined

        const response = await fetchWithFallback(
          API_CONFIG.primary.endpoints.marketChart.replace("{id}", id),
          {
            vs_currency: currency,
            days,
            ...(interval ? { interval } : {}),
          },
          {
            cacheKey,
            cacheTime: CACHE_CONFIG.marketChart,
            forceRefresh,
            useFallback: false, // Don't use fallback yet
          },
        )

        apiStatus.updateStatus("primary", true)
        return response
      } catch (error) {
        console.error(`Primary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("primary", false)
      }
    }

    // Try secondary API (CoinCap) if primary failed
    if (apiStatus.secondary.available) {
      try {
        const response = await fetchFromFallbackApi(API_CONFIG.primary.endpoints.marketChart.replace("{id}", id), {
          vs_currency: currency,
          days,
        })

        apiStatus.updateStatus("secondary", true)
        return response
      } catch (error) {
        console.error(`Secondary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("secondary", false)
      }
    }

    // Try tertiary API (CryptoCompare) if both primary and secondary failed
    if (apiStatus.tertiary.available) {
      try {
        const response = await fetchCryptoCompareChartData(id, currency, days, forceRefresh)
        apiStatus.updateStatus("tertiary", true)
        return response
      } catch (error) {
        console.error(`Tertiary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("tertiary", false)
      }
    }

    // If all APIs failed, use mock data
    apiStatus.currentSource = "mock"
    return getMockData(API_CONFIG.primary.endpoints.marketChart.replace("{id}", id), { vs_currency: currency, days })
  } catch (error) {
    console.error(`Error fetching chart data for ${id}:`, error)
    throw error
  }
}
