/**
 * API Utilities
 * This file contains utility functions for fetching data from various cryptocurrency APIs
 */

import { API_CONFIG, CACHE_CONFIG, COMMON_SYMBOLS, CURRENCY_MAPPING, SYMBOL_TO_ID_MAPPING } from "./api-config"
import { cacheUtils, fetchWithTimeout, isOnline } from "./api"

// API status tracking
export const apiStatus = {
  primary: { operational: true, lastChecked: 0 },
  secondary: { operational: true, lastChecked: 0 },
  tertiary: { operational: true, lastChecked: 0 },
  quaternary: { operational: true, lastChecked: 0 },
  currentSource: "primary" as "primary" | "secondary" | "tertiary" | "quaternary" | "mock",

  // Reset all API statuses
  resetStatuses() {
    this.primary.operational = true
    this.secondary.operational = true
    this.tertiary.operational = true
    this.quaternary.operational = true
    this.primary.lastChecked = 0
    this.secondary.lastChecked = 0
    this.tertiary.lastChecked = 0
    this.quaternary.lastChecked = 0
    this.currentSource = "primary"
  },

  // Update API status
  updateStatus(api: "primary" | "secondary" | "tertiary" | "quaternary", available: boolean) {
    this[api].operational = available
    this[api].lastChecked = Date.now()

    // Update current source based on availability
    if (api === this.currentSource && !available) {
      if (this.primary.operational) {
        this.currentSource = "primary"
      } else if (this.secondary.operational) {
        this.currentSource = "secondary"
      } else if (this.tertiary.operational) {
        this.currentSource = "tertiary"
      } else if (this.quaternary.operational) {
        this.currentSource = "quaternary"
      } else {
        this.currentSource = "mock"
      }
    } else if (available && this.currentSource === "mock") {
      this.currentSource = api
    }
  },
}

// Function to get the current API source
export function getCurrentApiSource(): string {
  return apiStatus.currentSource
}

/**
 * Reset API status periodically to retry failed APIs
 */
export function setupApiStatusReset(intervalMinutes = 30) {
  // Only run in browser environment
  if (typeof window !== "undefined") {
    // Initial reset after 1 minute
    setTimeout(() => {
      apiStatus.resetStatuses()
      console.log("API statuses reset")
    }, 60 * 1000)

    // Then reset periodically
    setInterval(
      () => {
        apiStatus.resetStatuses()
        console.log("API statuses reset")
      },
      intervalMinutes * 60 * 1000,
    )
  }
}

/**
 * Format a user-friendly error message
 */
export function formatErrorMessage(error: unknown): string {
  if (!isOnline()) {
    return "You appear to be offline. Please check your internet connection and try again."
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("timeout")) {
      return "The request timed out. Please try again."
    }

    if (error.message.includes("Rate limit exceeded")) {
      return error.message
    }

    // Handle CORS errors
    if (error.message.includes("CORS") || error.message.includes("cross-origin")) {
      return "There was a network issue accessing the cryptocurrency data. Using cached or mock data where available."
    }

    return error.message
  }

  return "An unexpected error occurred. Please try again."
}

/**
 * Fetch cryptocurrency list with fallback to multiple APIs
 */
export async function getCryptoList(currency = "usd", forceRefresh = false) {
  const cacheKey = `crypto-list-${currency}`

  try {
    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = cacheUtils.get(cacheKey)
      if (cachedData) {
        return cachedData.data
      }
    }

    // Try primary API (CoinGecko) first if it's available
    if (apiStatus.primary.operational) {
      try {
        const url = new URL(`${API_CONFIG.primary.baseUrl}${API_CONFIG.primary.endpoints.markets}`)
        url.searchParams.append("vs_currency", currency)
        url.searchParams.append("order", "market_cap_desc")
        url.searchParams.append("per_page", "250")
        url.searchParams.append("page", "1")
        url.searchParams.append("sparkline", "false")
        url.searchParams.append("price_change_percentage", "24h")

        const response = await fetchWithTimeout(url.toString(), {
          headers: API_CONFIG.primary.headers,
        })

        if (!response.ok) {
          throw new Error(`Primary API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketsList)

        apiStatus.updateStatus("primary", true)
        return data
      } catch (error) {
        console.error("Primary API error:", error)
        apiStatus.updateStatus("primary", false)
      }
    }

    // Try secondary API (CoinCap) if primary failed
    if (apiStatus.secondary.operational) {
      try {
        const response = await fetchWithTimeout(
          `${API_CONFIG.secondary.baseUrl}${API_CONFIG.secondary.endpoints.markets}`,
          {
            headers: API_CONFIG.secondary.headers,
          },
        )

        if (!response.ok) {
          throw new Error(`Secondary API error: ${response.status} ${response.statusText}`)
        }

        const rawData = await response.json()

        // Transform CoinCap data to match CoinGecko format
        const data = rawData.data.map((asset: any) => ({
          id: asset.id,
          symbol: asset.symbol.toLowerCase(),
          name: asset.name,
          image: `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`,
          current_price: Number(asset.priceUsd),
          market_cap: Number(asset.marketCapUsd),
          total_volume: Number(asset.volumeUsd24Hr),
          price_change_percentage_24h: Number(asset.changePercent24Hr),
          market_cap_rank: Number(asset.rank),
        }))

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketsList)

        apiStatus.updateStatus("secondary", true)
        return data
      } catch (error) {
        console.error("Secondary API error:", error)
        apiStatus.updateStatus("secondary", false)
      }
    }

    // Try tertiary API (CryptoCompare) if both primary and secondary failed
    if (apiStatus.tertiary.operational) {
      try {
        // First, get the coin list to map symbols to IDs
        const coinListResponse = await fetchWithTimeout(
          `${API_CONFIG.tertiary.baseUrl}${API_CONFIG.tertiary.endpoints.coinList}?summary=true`,
          { headers: API_CONFIG.tertiary.headers },
        )

        if (!coinListResponse.ok) {
          throw new Error(`Failed to fetch coin list: ${coinListResponse.status}`)
        }

        const coinListData = await coinListResponse.json()

        // Then get price data for common symbols
        const fsym = COMMON_SYMBOLS.join(",")
        const tsym = CURRENCY_MAPPING[currency] || "USD"

        const priceResponse = await fetchWithTimeout(
          `${API_CONFIG.tertiary.baseUrl}${API_CONFIG.tertiary.endpoints.priceMultiFull}?fsyms=${fsym}&tsyms=${tsym}`,
          { headers: API_CONFIG.tertiary.headers },
        )

        if (!priceResponse.ok) {
          throw new Error(`Failed to fetch price data: ${priceResponse.status}`)
        }

        const priceData = await priceResponse.json()

        // Transform the data to match our expected format
        const cryptoList = Object.entries(priceData.RAW || {}).map(([symbol, currencies]: [string, any]) => {
          const currencyData = currencies[tsym]
          const coinInfo = coinListData.Data[symbol]

          return {
            id: SYMBOL_TO_ID_MAPPING[symbol] || symbol.toLowerCase(),
            symbol: symbol.toLowerCase(),
            name: coinInfo?.CoinName || symbol,
            image: coinInfo?.ImageUrl ? `${API_CONFIG.tertiary.imageBaseUrl}${coinInfo.ImageUrl}` : null,
            current_price: currencyData?.PRICE || 0,
            market_cap: currencyData?.MKTCAP || 0,
            total_volume: currencyData?.TOTALVOLUME24H || 0,
            price_change_percentage_24h: currencyData?.CHANGEPCT24HOUR || 0,
            market_cap_rank: currencyData?.MKTCAPORDER || 999,
          }
        })

        // Sort by market cap
        cryptoList.sort((a, b) => a.market_cap_rank - b.market_cap_rank)

        // Cache the result
        cacheUtils.set(cacheKey, cryptoList, Date.now() + CACHE_CONFIG.marketsList)

        apiStatus.updateStatus("tertiary", true)
        return cryptoList
      } catch (error) {
        console.error("Tertiary API error:", error)
        apiStatus.updateStatus("tertiary", false)
      }
    }

    // Try quaternary API (Binance) if all others failed
    if (apiStatus.quaternary.operational) {
      try {
        const response = await fetchWithTimeout(
          `${API_CONFIG.quaternary.baseUrl}${API_CONFIG.quaternary.endpoints.ticker24hr}`,
          {
            headers: API_CONFIG.quaternary.headers,
          },
        )

        if (!response.ok) {
          throw new Error(`Quaternary API error: ${response.status} ${response.statusText}`)
        }

        const rawData = await response.json()

        // Filter for USDT pairs and transform to match our format
        const data = rawData
          .filter((item: any) => item.symbol.endsWith("USDT"))
          .map((item: any, index: number) => {
            const symbol = item.symbol.replace("USDT", "").toLowerCase()
            const id = SYMBOL_TO_ID_MAPPING[symbol.toUpperCase()] || symbol

            return {
              id,
              symbol,
              name: symbol.charAt(0).toUpperCase() + symbol.slice(1),
              image: `https://cryptologos.cc/logos/${id}-${symbol}-logo.png`,
              current_price: Number(item.lastPrice),
              market_cap: Number(item.quoteVolume) * 10, // Rough estimate
              total_volume: Number(item.volume),
              price_change_percentage_24h: Number(item.priceChangePercent),
              market_cap_rank: index + 1, // Approximate rank
            }
          })

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketsList)

        apiStatus.updateStatus("quaternary", true)
        return data
      } catch (error) {
        console.error("Quaternary API error:", error)
        apiStatus.updateStatus("quaternary", false)
      }
    }

    // If all APIs failed, use mock data
    apiStatus.currentSource = "mock"
    return getMockCryptoList(currency)
  } catch (error) {
    console.error("Error fetching crypto list:", error)
    throw error
  }
}

/**
 * Get detailed information about a specific cryptocurrency
 */
export async function getCryptoDetail(id: string, currency = "usd", forceRefresh = false) {
  const cacheKey = `crypto-detail-${id}-${currency}`

  try {
    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = cacheUtils.get(cacheKey)
      if (cachedData) {
        return cachedData.data
      }
    }

    // Try primary API (CoinGecko) first if it's available
    if (apiStatus.primary.operational) {
      try {
        const url = new URL(
          `${API_CONFIG.primary.baseUrl}${API_CONFIG.primary.endpoints.coinDetail.replace("{id}", id)}`,
        )
        url.searchParams.append("localization", "false")
        url.searchParams.append("tickers", "false")
        url.searchParams.append("market_data", "true")
        url.searchParams.append("community_data", "false")
        url.searchParams.append("developer_data", "false")
        url.searchParams.append("sparkline", "true")

        const response = await fetchWithTimeout(url.toString(), {
          headers: API_CONFIG.primary.headers,
        })

        if (!response.ok) {
          throw new Error(`Primary API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.coinDetail)

        apiStatus.updateStatus("primary", true)
        return data
      } catch (error) {
        console.error(`Primary API error for ${id}:`, error)
        apiStatus.updateStatus("primary", false)
      }
    }

    // Try secondary API (CoinCap) if primary failed
    if (apiStatus.secondary.operational) {
      try {
        const response = await fetchWithTimeout(
          `${API_CONFIG.secondary.baseUrl}${API_CONFIG.secondary.endpoints.coinDetail.replace("{id}", id)}`,
          { headers: API_CONFIG.secondary.headers },
        )

        if (!response.ok) {
          throw new Error(`Secondary API error: ${response.status} ${response.statusText}`)
        }

        const rawData = await response.json()
        const asset = rawData.data

        // Transform CoinCap data to match CoinGecko format
        const data = {
          id: asset.id,
          symbol: asset.symbol.toLowerCase(),
          name: asset.name,
          image: {
            large: `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`,
          },
          market_data: {
            current_price: {
              usd: Number(asset.priceUsd),
              eur: Number(asset.priceUsd) * 0.93, // Approximate conversion
              gbp: Number(asset.priceUsd) * 0.79, // Approximate conversion
              jpy: Number(asset.priceUsd) * 150, // Approximate conversion
            },
            market_cap: {
              usd: Number(asset.marketCapUsd),
              eur: Number(asset.marketCapUsd) * 0.93,
              gbp: Number(asset.marketCapUsd) * 0.79,
              jpy: Number(asset.marketCapUsd) * 150,
            },
            total_volume: {
              usd: Number(asset.volumeUsd24Hr),
              eur: Number(asset.volumeUsd24Hr) * 0.93,
              gbp: Number(asset.volumeUsd24Hr) * 0.79,
              jpy: Number(asset.volumeUsd24Hr) * 150,
            },
            price_change_percentage_24h: Number(asset.changePercent24Hr),
            price_change_percentage_7d: Number(asset.changePercent24Hr) * 1.5, // Approximation
            price_change_percentage_30d: Number(asset.changePercent24Hr) * 2, // Approximation
            circulating_supply: Number(asset.supply),
            total_supply: Number(asset.maxSupply || asset.supply),
            max_supply: Number(asset.maxSupply || 0),
          },
          market_cap_rank: Number(asset.rank),
          description: {
            en: `${asset.name} (${asset.symbol}) is a cryptocurrency.`,
          },
          links: {
            homepage: [""],
            blockchain_site: [],
            official_forum_url: [""],
            twitter_screen_name: "",
            telegram_channel_identifier: "",
            subreddit_url: "",
          },
          categories: ["Cryptocurrency"],
        }

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.coinDetail)

        apiStatus.updateStatus("secondary", true)
        return data
      } catch (error) {
        console.error(`Secondary API error for ${id}:`, error)
        apiStatus.updateStatus("secondary", false)
      }
    }

    // Try tertiary API (CryptoCompare) if both primary and secondary failed
    if (apiStatus.tertiary.operational) {
      try {
        // Convert ID to symbol if needed
        const symbol =
          id.toUpperCase() in SYMBOL_TO_ID_MAPPING
            ? id.toUpperCase()
            : Object.entries(SYMBOL_TO_ID_MAPPING).find(([_, val]) => val === id)?.[0] || id.toUpperCase()

        const tsym = CURRENCY_MAPPING[currency] || "USD"

        // Get price data
        const priceResponse = await fetchWithTimeout(
          `${API_CONFIG.tertiary.baseUrl}${API_CONFIG.tertiary.endpoints.priceMultiFull}?fsyms=${symbol}&tsyms=${tsym},EUR,GBP,JPY`,
          { headers: API_CONFIG.tertiary.headers },
        )

        if (!priceResponse.ok) {
          throw new Error(`Failed to fetch price data: ${priceResponse.status}`)
        }

        const priceData = await priceResponse.json()

        if (!priceData.RAW || !priceData.RAW[symbol]) {
          throw new Error(`No data found for ${symbol}`)
        }

        // Get coin info
        const infoResponse = await fetchWithTimeout(
          `${API_CONFIG.tertiary.baseUrl}${API_CONFIG.tertiary.endpoints.coinInfo}?fsyms=${symbol}&tsym=${tsym}`,
          { headers: API_CONFIG.tertiary.headers },
        )

        if (!infoResponse.ok) {
          throw new Error(`Failed to fetch coin info: ${infoResponse.status}`)
        }

        const infoData = await infoResponse.json()
        const coinInfo = infoData.Data?.[0]?.CoinInfo

        // Transform the data to match our expected format
        const data = {
          id,
          symbol: symbol.toLowerCase(),
          name: coinInfo?.FullName || symbol,
          image: {
            large: coinInfo?.ImageUrl ? `${API_CONFIG.tertiary.baseUrl}${coinInfo.ImageUrl}` : null,
          },
          market_data: {
            current_price: {
              usd: priceData.RAW[symbol].USD?.PRICE || 0,
              eur: priceData.RAW[symbol].EUR?.PRICE || 0,
              gbp: priceData.RAW[symbol].GBP?.PRICE || 0,
              jpy: priceData.RAW[symbol].JPY?.PRICE || 0,
            },
            market_cap: {
              usd: priceData.RAW[symbol].USD?.MKTCAP || 0,
              eur: priceData.RAW[symbol].EUR?.MKTCAP || 0,
              gbp: priceData.RAW[symbol].GBP?.MKTCAP || 0,
              jpy: priceData.RAW[symbol].JPY?.MKTCAP || 0,
            },
            total_volume: {
              usd: priceData.RAW[symbol].USD?.TOTALVOLUME24H || 0,
              eur: priceData.RAW[symbol].EUR?.TOTALVOLUME24H || 0,
              gbp: priceData.RAW[symbol].GBP?.TOTALVOLUME24H || 0,
              jpy: priceData.RAW[symbol].JPY?.TOTALVOLUME24H || 0,
            },
            price_change_percentage_24h: priceData.RAW[symbol].USD?.CHANGEPCT24HOUR || 0,
            price_change_percentage_7d: 0, // Not available directly
            price_change_percentage_30d: 0, // Not available directly
            circulating_supply: priceData.RAW[symbol].USD?.SUPPLY || 0,
            total_supply: priceData.RAW[symbol].USD?.SUPPLY || 0,
            max_supply: coinInfo?.MaxSupply || 0,
            ath: {
              usd: priceData.RAW[symbol].USD?.HIGH24HOUR || 0, // Using 24h high as fallback
              eur: priceData.RAW[symbol].EUR?.HIGH24HOUR || 0,
              gbp: priceData.RAW[symbol].GBP?.HIGH24HOUR || 0,
              jpy: priceData.RAW[symbol].JPY?.HIGH24HOUR || 0,
            },
            atl: {
              usd: priceData.RAW[symbol].USD?.LOW24HOUR || 0, // Using 24h low as fallback
              eur: priceData.RAW[symbol].EUR?.LOW24HOUR || 0,
              gbp: priceData.RAW[symbol].GBP?.LOW24HOUR || 0,
              jpy: priceData.RAW[symbol].JPY?.LOW24HOUR || 0,
            },
            ath_change_percentage: {
              usd: 0, // Not available
              eur: 0,
              gbp: 0,
              jpy: 0,
            },
            atl_change_percentage: {
              usd: 0, // Not available
              eur: 0,
              gbp: 0,
              jpy: 0,
            },
            ath_date: {
              usd: new Date().toISOString(), // Not available
              eur: new Date().toISOString(),
              gbp: new Date().toISOString(),
              jpy: new Date().toISOString(),
            },
            atl_date: {
              usd: new Date().toISOString(), // Not available
              eur: new Date().toISOString(),
              gbp: new Date().toISOString(),
              jpy: new Date().toISOString(),
            },
          },
          market_cap_rank: priceData.RAW[symbol].USD?.MKTCAPORDER || 999,
          description: {
            en: coinInfo?.Description || `Information about ${symbol} cryptocurrency.`,
          },
          links: {
            homepage: [coinInfo?.Url || ""],
            blockchain_site: [],
            official_forum_url: [coinInfo?.ForumUrl || ""],
            twitter_screen_name: coinInfo?.Twitter || "",
            telegram_channel_identifier: "",
            subreddit_url: coinInfo?.Reddit || "",
          },
          categories: [coinInfo?.Algorithm || "Cryptocurrency"],
        }

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.coinDetail)

        apiStatus.updateStatus("tertiary", true)
        return data
      } catch (error) {
        console.error(`Tertiary API error for ${id}:`, error)
        apiStatus.updateStatus("tertiary", false)
      }
    }

    // If all APIs failed, use mock data
    apiStatus.currentSource = "mock"
    return getMockCryptoDetail(id, currency)
  } catch (error) {
    console.error(`Error fetching details for ${id}:`, error)
    throw error
  }
}

/**
 * Get historical price data for a cryptocurrency
 */
export async function getCryptoChartData(id: string, currency = "usd", days = "7", forceRefresh = false) {
  const cacheKey = `chart-${id}-${currency}-${days}`

  try {
    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = cacheUtils.get(cacheKey)
      if (cachedData) {
        return cachedData.data
      }
    }

    // Try primary API (CoinGecko) first if it's available
    if (apiStatus.primary.operational) {
      try {
        const url = new URL(
          `${API_CONFIG.primary.baseUrl}${API_CONFIG.primary.endpoints.marketChart.replace("{id}", id)}`,
        )
        url.searchParams.append("vs_currency", currency)
        url.searchParams.append("days", days)

        // For longer time ranges, use daily interval to reduce data points
        if (Number(days) > 90) {
          url.searchParams.append("interval", "daily")
        }

        const response = await fetchWithTimeout(url.toString(), {
          headers: API_CONFIG.primary.headers,
        })

        if (!response.ok) {
          throw new Error(`Primary API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketChart)

        apiStatus.updateStatus("primary", true)
        return data
      } catch (error) {
        console.error(`Primary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("primary", false)
      }
    }

    // Try secondary API (CoinCap) if primary failed
    if (apiStatus.secondary.operational) {
      try {
        const daysNum = Number(days)
        const interval = daysNum <= 1 ? "m5" : daysNum <= 7 ? "h1" : daysNum <= 30 ? "h6" : "d1"

        const start = Date.now() - daysNum * 24 * 60 * 60 * 1000
        const end = Date.now()

        const url = new URL(
          `${API_CONFIG.secondary.baseUrl}${API_CONFIG.secondary.endpoints.marketChart.replace("{id}", id)}`,
        )
        url.searchParams.append("interval", interval)
        url.searchParams.append("start", start.toString())
        url.searchParams.append("end", end.toString())

        const response = await fetchWithTimeout(url.toString(), {
          headers: API_CONFIG.secondary.headers,
        })

        if (!response.ok) {
          throw new Error(`Secondary API error: ${response.status} ${response.statusText}`)
        }

        const rawData = await response.json()

        // Transform CoinCap data to match CoinGecko format
        const prices = rawData.data.map((item: any) => [Number(item.time), Number(item.priceUsd)])

        const data = {
          prices,
          market_caps: rawData.data.map((item: any) => [
            Number(item.time),
            Number(item.priceUsd) * Number(item.circulatingSupply || 0),
          ]),
          total_volumes: rawData.data.map((item: any) => [Number(item.time), Number(item.volumeUsd || 0)]),
        }

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketChart)

        apiStatus.updateStatus("secondary", true)
        return data
      } catch (error) {
        console.error(`Secondary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("secondary", false)
      }
    }

    // Try tertiary API (CryptoCompare) if both primary and secondary failed
    if (apiStatus.tertiary.operational) {
      try {
        // Convert ID to symbol if needed
        const symbol =
          id.toUpperCase() in SYMBOL_TO_ID_MAPPING
            ? id.toUpperCase()
            : Object.entries(SYMBOL_TO_ID_MAPPING).find(([_, val]) => val === id)?.[0] || id.toUpperCase()

        const tsym = CURRENCY_MAPPING[currency] || "USD"
        const daysNum = Number(days)

        // Determine the appropriate endpoint and limit based on days
        let endpoint = API_CONFIG.tertiary.endpoints.histoDay
        let limit = daysNum

        if (daysNum <= 1) {
          endpoint = API_CONFIG.tertiary.endpoints.histoHour
          limit = 24 // 24 hours
        } else if (daysNum <= 7) {
          endpoint = API_CONFIG.tertiary.endpoints.histoHour
          limit = daysNum * 24 // hours in requested days
        } else if (daysNum <= 30) {
          endpoint = API_CONFIG.tertiary.endpoints.histoDay
          limit = 30
        } else {
          endpoint = API_CONFIG.tertiary.endpoints.histoDay
          limit = Math.min(daysNum, 365) // Max 365 days
        }

        // Get historical data
        const url = new URL(`${API_CONFIG.tertiary.baseUrl}${endpoint}`)
        url.searchParams.append("fsym", symbol)
        url.searchParams.append("tsym", tsym)
        url.searchParams.append("limit", limit.toString())

        const response = await fetchWithTimeout(url.toString(), {
          headers: API_CONFIG.tertiary.headers,
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch historical data: ${response.status}`)
        }

        const historyData = await response.json()

        if (!historyData.Data) {
          throw new Error(`No historical data found for ${symbol}`)
        }

        // Transform the data to match our expected format
        const prices = historyData.Data.map((item: any) => [
          item.time * 1000, // Convert to milliseconds
          item.close,
        ])

        const volumes = historyData.Data.map((item: any) => [
          item.time * 1000, // Convert to milliseconds
          item.volumeto,
        ])

        // We don't have market cap history directly, so we'll estimate it
        // by multiplying price by circulating supply (which is also not available historically)
        // This is just a rough approximation
        const marketCaps = historyData.Data.map((item: any) => [
          item.time * 1000, // Convert to milliseconds
          item.close * (historyData.Data[0]?.volumefrom || 1000000), // Rough estimate
        ])

        const data = {
          prices,
          market_caps: marketCaps,
          total_volumes: volumes,
        }

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketChart)

        apiStatus.updateStatus("tertiary", true)
        return data
      } catch (error) {
        console.error(`Tertiary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("tertiary", false)
      }
    }

    // Try quaternary API (Binance) if all others failed
    if (apiStatus.quaternary.operational) {
      try {
        // Convert ID to symbol if needed
        const symbol =
          id.toUpperCase() in SYMBOL_TO_ID_MAPPING
            ? id.toUpperCase()
            : Object.entries(SYMBOL_TO_ID_MAPPING).find(([_, val]) => val === id)?.[0] || id.toUpperCase()

        const daysNum = Number(days)

        // Choose appropriate interval based on days
        let interval = "1d"
        if (daysNum <= 1) interval = "1h"
        else if (daysNum <= 7) interval = "4h"

        // Calculate limit (max 1000)
        let limit = Math.min(1000, daysNum * 24)
        if (interval === "4h") limit = Math.min(1000, Math.ceil((daysNum * 24) / 4))
        if (interval === "1d") limit = Math.min(1000, daysNum)

        const url = new URL(`${API_CONFIG.quaternary.baseUrl}${API_CONFIG.quaternary.endpoints.klines}`)
        url.searchParams.append("symbol", `${symbol}USDT`)
        url.searchParams.append("interval", interval)
        url.searchParams.append("limit", limit.toString())

        const response = await fetchWithTimeout(url.toString(), {
          headers: API_CONFIG.quaternary.headers,
        })

        if (!response.ok) {
          throw new Error(`Quaternary API error: ${response.status} ${response.statusText}`)
        }

        const klines = await response.json()

        // Binance klines format: [openTime, open, high, low, close, volume, closeTime, ...]
        const prices = klines.map((item: any) => [
          item[0], // Open time
          Number(item[4]), // Close price
        ])

        const volumes = klines.map((item: any) => [
          item[0], // Open time
          Number(item[5]), // Volume
        ])

        // Estimate market cap (not directly available)
        const marketCaps = klines.map((item: any) => [
          item[0], // Open time
          Number(item[4]) * Number(item[5]) * 10, // Close price * volume * multiplier
        ])

        const data = {
          prices,
          market_caps: marketCaps,
          total_volumes: volumes,
        }

        // Cache the result
        cacheUtils.set(cacheKey, data, Date.now() + CACHE_CONFIG.marketChart)

        apiStatus.updateStatus("quaternary", true)
        return data
      } catch (error) {
        console.error(`Quaternary API error for chart data ${id}:`, error)
        apiStatus.updateStatus("quaternary", false)
      }
    }

    // If all APIs failed, use mock data
    apiStatus.currentSource = "mock"
    return getMockChartData(id, currency, days)
  } catch (error) {
    console.error(`Error fetching chart data for ${id}:`, error)
    throw error
  }
}

/**
 * Format cryptocurrency data for display
 */
export const formatters = {
  currency(value: number | undefined, currency = "usd", options: Intl.NumberFormatOptions = {}): string {
    if (value === undefined || isNaN(value)) return "N/A"

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
        ...options,
      }).format(value)
    } catch (error) {
      console.error("Error formatting currency:", error)
      return `${currency.toUpperCase()} ${value}`
    }
  },

  largeNumber(value: number | undefined): string {
    if (value === undefined || isNaN(value)) return "N/A"

    try {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
      if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
      if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
      return value.toString()
    } catch (error) {
      console.error("Error formatting large number:", error)
      return String(value)
    }
  },

  date(dateString: string | undefined, options: Intl.DateTimeFormatOptions = {}): string {
    if (!dateString) return "N/A"

    try {
      const date = new Date(dateString)
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...options,
      })
    } catch (error) {
      console.error("Error formatting date:", error)
      return dateString
    }
  },

  percentage(value: number | undefined, digits = 2): string {
    if (value === undefined || isNaN(value)) return "N/A"

    try {
      return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`
    } catch (error) {
      console.error("Error formatting percentage:", error)
      return `${value}%`
    }
  },
}

/**
 * Generate mock cryptocurrency list data
 */
function getMockCryptoList(currency = "usd"): any[] {
  // Helper function to ensure numbers are within safe range
  function safeNumber(value: number): number {
    return Math.min(Math.max(value, -Number.MAX_SAFE_INTEGER / 2), Number.MAX_SAFE_INTEGER / 2)
  }

  return [
    {
      id: "bitcoin",
      symbol: "btc",
      name: "Bitcoin",
      image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
      current_price: 50000,
      market_cap: safeNumber(950000000000),
      total_volume: safeNumber(30000000000),
      price_change_percentage_24h: 2.5,
      market_cap_rank: 1,
    },
    {
      id: "ethereum",
      symbol: "eth",
      name: "Ethereum",
      image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
      current_price: 3000,
      market_cap: safeNumber(350000000000),
      total_volume: safeNumber(15000000000),
      price_change_percentage_24h: 1.8,
      market_cap_rank: 2,
    },
    {
      id: "cardano",
      symbol: "ada",
      name: "Cardano",
      image: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
      current_price: 0.45,
      market_cap: safeNumber(15000000000),
      total_volume: safeNumber(500000000),
      price_change_percentage_24h: -1.2,
      market_cap_rank: 8,
    },
    {
      id: "solana",
      symbol: "sol",
      name: "Solana",
      image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
      current_price: 120,
      market_cap: safeNumber(50000000000),
      total_volume: safeNumber(2000000000),
      price_change_percentage_24h: 3.7,
      market_cap_rank: 5,
    },
    {
      id: "ripple",
      symbol: "xrp",
      name: "XRP",
      image: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
      current_price: 0.55,
      market_cap: safeNumber(28000000000),
      total_volume: safeNumber(1200000000),
      price_change_percentage_24h: -0.8,
      market_cap_rank: 6,
    },
    {
      id: "binancecoin",
      symbol: "bnb",
      name: "Binance Coin",
      image: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
      current_price: 380,
      market_cap: safeNumber(58000000000),
      total_volume: safeNumber(1800000000),
      price_change_percentage_24h: 1.2,
      market_cap_rank: 4,
    },
    {
      id: "dogecoin",
      symbol: "doge",
      name: "Dogecoin",
      image: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
      current_price: 0.08,
      market_cap: safeNumber(11000000000),
      total_volume: safeNumber(500000000),
      price_change_percentage_24h: -2.1,
      market_cap_rank: 10,
    },
    {
      id: "polkadot",
      symbol: "dot",
      name: "Polkadot",
      image: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
      current_price: 6.2,
      market_cap: safeNumber(7800000000),
      total_volume: safeNumber(320000000),
      price_change_percentage_24h: 0.9,
      market_cap_rank: 12,
    },
    {
      id: "chainlink",
      symbol: "link",
      name: "Chainlink",
      image: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
      current_price: 13.5,
      market_cap: safeNumber(7500000000),
      total_volume: safeNumber(410000000),
      price_change_percentage_24h: 2.3,
      market_cap_rank: 13,
    },
    {
      id: "litecoin",
      symbol: "ltc",
      name: "Litecoin",
      image: "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
      current_price: 68,
      market_cap: safeNumber(5000000000),
      total_volume: safeNumber(350000000),
      price_change_percentage_24h: 0.5,
      market_cap_rank: 15,
    },
  ]
}

/**
 * Generate mock cryptocurrency detail data
 */
function getMockCryptoDetail(id: string, currency = "usd"): any {
  // Create different mock data based on coin ID
  const mockCoins: Record<string, any> = {
    bitcoin: {
      price: 50000,
      marketCap: 950000000000,
      volume: 30000000000,
      change24h: 2.5,
      supply: 19000000,
      maxSupply: 21000000,
      description: "Bitcoin is the first decentralized cryptocurrency, released as open-source software in 2009.",
      rank: 1,
    },
    ethereum: {
      price: 3000,
      marketCap: 350000000000,
      volume: 15000000000,
      change24h: 1.8,
      supply: 120000000,
      maxSupply: null,
      description: "Ethereum is a decentralized, open-source blockchain with smart contract functionality.",
      rank: 2,
    },
    cardano: {
      price: 0.45,
      marketCap: 15000000000,
      volume: 500000000,
      change24h: -1.2,
      supply: 35000000000,
      maxSupply: 45000000000,
      description: "Cardano is a proof-of-stake blockchain platform with a focus on sustainability and scalability.",
      rank: 8,
    },
    solana: {
      price: 120,
      marketCap: 50000000000,
      volume: 2000000000,
      change24h: 3.7,
      supply: 400000000,
      maxSupply: null,
      description: "Solana is a high-performance blockchain supporting builders around the world creating crypto apps.",
      rank: 5,
    },
  }

  // Default mock data if specific coin not found
  const coinData = mockCoins[id] || {
    price: 10,
    marketCap: 1000000000,
    volume: 100000000,
    change24h: 0.5,
    supply: 1000000,
    maxSupply: 2000000,
    description: `${id.charAt(0).toUpperCase() + id.slice(1)} is a cryptocurrency.`,
    rank: 50,
  }

  return {
    id,
    symbol: id.substring(0, 4).toLowerCase(),
    name: id.charAt(0).toUpperCase() + id.slice(1),
    image: {
      large: `https://assets.coingecko.com/coins/images/1/large/${id}.png`,
    },
    market_data: {
      current_price: {
        usd: coinData.price,
        eur: coinData.price * 0.93,
        gbp: coinData.price * 0.79,
        jpy: coinData.price * 150,
      },
      market_cap: {
        usd: coinData.marketCap,
        eur: coinData.marketCap * 0.93,
        gbp: coinData.marketCap * 0.79,
        jpy: coinData.marketCap * 150,
      },
      total_volume: {
        usd: coinData.volume,
        eur: coinData.volume * 0.93,
        gbp: coinData.volume * 0.79,
        jpy: coinData.volume * 150,
      },
      price_change_percentage_24h: coinData.change24h,
      price_change_percentage_7d: coinData.change24h * 1.5,
      price_change_percentage_30d: coinData.change24h * 2,
      circulating_supply: coinData.supply,
      total_supply: coinData.supply,
      max_supply: coinData.maxSupply,
      ath: {
        usd: coinData.price * 1.5,
        eur: coinData.price * 1.5 * 0.93,
        gbp: coinData.price * 1.5 * 0.79,
        jpy: coinData.price * 1.5 * 150,
      },
      atl: {
        usd: coinData.price * 0.5,
        eur: coinData.price * 0.5 * 0.93,
        gbp: coinData.price * 0.5 * 0.79,
        jpy: coinData.price * 0.5 * 150,
      },
      ath_change_percentage: {
        usd: -30,
        eur: -30,
        gbp: -30,
        jpy: -30,
      },
      atl_change_percentage: {
        usd: 100,
        eur: 100,
        gbp: 100,
        jpy: 100,
      },
      ath_date: {
        usd: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        eur: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        gbp: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        jpy: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
      atl_date: {
        usd: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        eur: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        gbp: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        jpy: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    market_cap_rank: coinData.rank,
    description: {
      en: coinData.description,
    },
    links: {
      homepage: [`https://${id}.org`],
      blockchain_site: ["https://blockchain.com", "https://blockchair.com"],
      official_forum_url: [`https://${id}.org/forum`],
      twitter_screen_name: id,
      telegram_channel_identifier: "",
      subreddit_url: `https://reddit.com/r/${id}`,
    },
    categories: ["Cryptocurrency"],
  }
}

/**
 * Generate mock chart data
 */
function getMockChartData(id: string, currency = "usd", days = "7"): any {
  const daysNum = Number(days)
  const now = Date.now()
  const interval = daysNum <= 1 ? 3600000 : daysNum <= 7 ? 21600000 : 86400000 // 1h, 6h, or 1d
  const dataPoints = daysNum <= 1 ? 24 : daysNum <= 7 ? 28 : daysNum // 24 points for 1d, 28 for 7d, or days for longer periods

  // Generate more realistic price data with trends
  let lastPrice = 50000 // Starting price
  const volatility = 0.02 // 2% volatility
  const trend = 0.001 // Slight upward trend

  const prices = Array.from({ length: dataPoints }, (_, i) => {
    const time = now - (dataPoints - i) * interval
    // Random walk with trend
    const randomChange = (Math.random() - 0.5) * 2 * volatility
    const trendChange = trend
    lastPrice = lastPrice * (1 + randomChange + trendChange)
    return [time, lastPrice]
  })

  return {
    prices,
    market_caps: prices.map(([time, price]) => [time, price * 19000000]), // Approx BTC supply * price
    total_volumes: prices.map(([time]) => [time, 30000000000 + Math.random() * 5000000000]),
  }
}
