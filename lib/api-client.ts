// API Configuration
export const API_SOURCES = {
  CRYPTOCOMPARE: "cryptocompare",
  COINGECKO: "coingecko",
  COINCAP: "coincap",
  BINANCE: "binance", // Adding Binance as another reliable API source
  MOCK: "mock",
} as const

export type ApiSource = (typeof API_SOURCES)[keyof typeof API_SOURCES]

// API Endpoints Configuration
const API_CONFIG = {
  [API_SOURCES.COINGECKO]: {
    baseUrl: "https://api.coingecko.com/api/v3",
    endpoints: {
      markets: "/coins/markets",
      coinDetail: "/coins/{id}",
      marketChart: "/coins/{id}/market_chart",
    },
    headers: {
      Accept: "application/json",
    },
    rateLimit: {
      maxRequests: 10, // Requests per minute for free tier
      resetTime: 60 * 1000, // 1 minute in milliseconds
    },
  },
  [API_SOURCES.COINCAP]: {
    baseUrl: "https://api.coincap.io/v2",
    endpoints: {
      assets: "/assets",
      assetDetail: "/assets/{id}",
      assetHistory: "/assets/{id}/history",
    },
    headers: {
      Accept: "application/json",
    },
  },
  [API_SOURCES.CRYPTOCOMPARE]: {
    baseUrl: "https://min-api.cryptocompare.com/data",
    endpoints: {
      priceMultiFull: "/pricemultifull",
      coinList: "/all/coinlist",
      histoDay: "/histoday",
      histoHour: "/histohour",
      histoMinute: "/histominute",
      coinInfo: "/coin/generalinfo",
    },
    headers: {
      Accept: "application/json",
    },
    rateLimit: {
      maxRequests: 50, // Higher limit than CoinGecko
      resetTime: 60 * 1000,
    },
  },
  [API_SOURCES.BINANCE]: {
    baseUrl: "https://api.binance.com/api/v3",
    endpoints: {
      ticker24hr: "/ticker/24hr",
      klines: "/klines",
      exchangeInfo: "/exchangeInfo",
    },
    headers: {
      Accept: "application/json",
    },
  },
}

// Cache configuration
const CACHE_CONFIG = {
  marketsList: 10 * 60 * 1000, // 10 minutes
  coinDetail: 15 * 60 * 1000, // 15 minutes
  marketChart: 20 * 60 * 1000, // 20 minutes
}

// API Status Tracking
export const apiStatusTracker = {
  [API_SOURCES.COINGECKO]: { operational: true, lastChecked: 0, priority: 1 },
  [API_SOURCES.COINCAP]: { operational: true, lastChecked: 0, priority: 2 },
  [API_SOURCES.CRYPTOCOMPARE]: { operational: true, lastChecked: 0, priority: 3 },
  [API_SOURCES.BINANCE]: { operational: true, lastChecked: 0, priority: 4 },
  currentSource: API_SOURCES.COINGECKO as ApiSource,

  // Update API status
  updateStatus(api: ApiSource, isOperational: boolean) {
    this[api].operational = isOperational
    this[api].lastChecked = Date.now()

    // If the current API is not operational, update the current source
    if (api === this.currentSource && !isOperational) {
      this.currentSource = this.getNextAvailableApi()
    }
  },

  // Get the next available API based on priority
  getNextAvailableApi(): ApiSource {
    const apis = [
      API_SOURCES.COINGECKO,
      API_SOURCES.COINCAP,
      API_SOURCES.CRYPTOCOMPARE,
      API_SOURCES.BINANCE,
    ] as ApiSource[]

    // Sort by priority and operational status
    const sortedApis = apis.filter((api) => this[api].operational).sort((a, b) => this[a].priority - this[b].priority)

    return sortedApis[0] || API_SOURCES.MOCK
  },

  // Reset all API statuses (called periodically to retry failed APIs)
  resetStatuses() {
    Object.keys(this).forEach((key) => {
      if (
        key !== "currentSource" &&
        key !== "getNextAvailableApi" &&
        key !== "updateStatus" &&
        key !== "resetStatuses"
      ) {
        this[key as ApiSource].operational = true
      }
    })
    this.currentSource = this.getNextAvailableApi()
  },
}

// Request tracking for rate limiting
const requestTracker = {
  [API_SOURCES.COINGECKO]: [] as number[],
  [API_SOURCES.CRYPTOCOMPARE]: [] as number[],
  [API_SOURCES.BINANCE]: [] as number[],
  isRateLimited: {
    [API_SOURCES.COINGECKO]: false,
    [API_SOURCES.CRYPTOCOMPARE]: false,
    [API_SOURCES.BINANCE]: false,
  },
  rateLimitResetTime: {
    [API_SOURCES.COINGECKO]: 0,
    [API_SOURCES.CRYPTOCOMPARE]: 0,
    [API_SOURCES.BINANCE]: 0,
  },

  // Add a timestamp for a new request
  addRequest(api: ApiSource) {
    if (!this[api]) return true // Skip if API doesn't have rate limiting

    const now = Date.now()
    this[api].push(now)
    this.cleanOldRequests(api, now)

    // Get rate limit config for this API
    const rateLimit = API_CONFIG[api]?.rateLimit
    if (!rateLimit) return true // Skip if no rate limit config

    // Check if we're over the rate limit
    if (this[api].length > rateLimit.maxRequests) {
      this.isRateLimited[api] = true
      this.rateLimitResetTime[api] = now + rateLimit.resetTime

      // Schedule automatic reset
      setTimeout(() => {
        this.isRateLimited[api] = false
        this[api] = []
      }, rateLimit.resetTime)

      return false
    }

    return true
  },

  // Remove requests older than the reset time
  cleanOldRequests(api: ApiSource, now: number) {
    if (!this[api]) return // Skip if API doesn't have rate limiting

    const rateLimit = API_CONFIG[api]?.rateLimit
    if (!rateLimit) return // Skip if no rate limit config

    const cutoff = now - rateLimit.resetTime
    this[api] = this[api].filter((time) => time > cutoff)
  },

  // Get time until rate limit reset
  getTimeUntilReset(api: ApiSource) {
    const now = Date.now()
    return Math.max(0, this.rateLimitResetTime[api] - now)
  },
}

/**
 * Fetch data with automatic fallback to alternative APIs
 */
export async function fetchCryptoData<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: {
    preferredApi?: ApiSource
    cacheKey?: string
    cacheTime?: number
    forceRefresh?: boolean
    timeout?: number
    retries?: number
  } = {},
): Promise<{ data: T; source: ApiSource }> {
  const {
    preferredApi,
    cacheKey,
    cacheTime = 5 * 60 * 1000, // 5 minutes default
    forceRefresh = false,
    timeout = 30000,
    retries = 3, // Increased retries
  } = options

  // Check cache first if we have a cache key and aren't forcing a refresh
  if (cacheKey && !forceRefresh) {
    const cachedData = getCachedData<T>(cacheKey)
    if (cachedData) {
      console.log(`Using cached data for ${cacheKey}`)
      return { data: cachedData.data, source: cachedData.source || API_SOURCES.MOCK }
    }
  }

  // Determine which APIs to try, in order of preference
  const apisToTry: ApiSource[] = []

  // If a preferred API is specified and operational, try it first
  if (preferredApi && apiStatusTracker[preferredApi].operational) {
    apisToTry.push(preferredApi)
  }

  // Add all other operational APIs in priority order
  const remainingApis = Object.keys(apiStatusTracker)
    .filter(
      (key) =>
        key !== "currentSource" &&
        key !== "getNextAvailableApi" &&
        key !== "updateStatus" &&
        key !== "resetStatuses" &&
        key !== preferredApi,
    )
    .map((key) => key as ApiSource)
    .filter((api) => apiStatusTracker[api].operational)
    .sort((a, b) => apiStatusTracker[a].priority - apiStatusTracker[b].priority)

  apisToTry.push(...remainingApis)

  // Try each API in sequence
  let lastError: Error | null = null

  for (const api of apisToTry) {
    try {
      console.log(`Trying to fetch data from ${api}...`)

      // Check if this API is rate limited
      if (requestTracker.isRateLimited[api]) {
        const waitTime = requestTracker.getTimeUntilReset(api)
        console.log(`${api} is rate limited. Reset in ${waitTime}ms`)
        continue // Skip to next API
      }

      // Track this request for rate limiting
      requestTracker.addRequest(api)

      // Fetch data from this API with retries
      let attempts = 0
      let data: T | null = null

      while (attempts < retries) {
        try {
          data = await fetchFromApi<T>(api, endpoint, params, timeout, retries)
          break
        } catch (error) {
          attempts++
          if (attempts === retries) throw error
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
        }
      }

      if (!data) throw new Error('Failed to fetch data after retries')

      // Update API status and current source
      apiStatusTracker.updateStatus(api, true)
      apiStatusTracker.currentSource = api

      // Cache the successful response if we have a cache key
      if (cacheKey) {
        cacheData(cacheKey, data, api, cacheTime)
      }

      return { data, source: api }
    } catch (error) {
      console.error(`Error fetching from ${api}:`, error)
      lastError = error instanceof Error ? error : new Error(String(error))

      // Update API status
      apiStatusTracker.updateStatus(api, false)
    }
  }

  // If all APIs failed, try to use mock data
  console.log("All APIs failed. Using mock data.")
  const mockData = await getMockData<T>(endpoint, params)

  // Cache the mock data with a shorter expiration
  if (cacheKey) {
    cacheData(cacheKey, mockData, API_SOURCES.MOCK, Math.min(cacheTime, 5 * 60 * 1000)) // Max 5 minutes for mock data
  }

  return { data: mockData, source: API_SOURCES.MOCK }
}

/**
 * Fetch data from a specific API
 */
async function fetchFromApi<T>(
  api: ApiSource,
  endpoint: string,
  params: Record<string, string>,
  timeout: number,
  retries: number,
): Promise<T> {
  // Get API config
  const apiConfig = API_CONFIG[api]
  if (!apiConfig) {
    throw new Error(`No configuration found for API: ${api}`)
  }

  // Map the generic endpoint to the specific API endpoint
  const { mappedEndpoint, mappedParams } = mapEndpointAndParams(api, endpoint, params)

  // Prepare URL with parameters
  const url = prepareUrl(apiConfig.baseUrl, mappedEndpoint, mappedParams)

  // Try with retries
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching from ${api}: ${url} (attempt ${attempt + 1}/${retries + 1})`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: apiConfig.headers,
        credentials: "omit", // Avoid CORS preflight
      })

      clearTimeout(timeoutId)

      // Handle rate limiting
      if (response.status === 429) {
        console.log(`Rate limit hit on ${api}`)
        if (requestTracker.isRateLimited) {
          requestTracker.isRateLimited[api] = true
          const retryAfter = response.headers.get("Retry-After")
          const waitTime = retryAfter ? Number.parseInt(retryAfter) * 1000 : apiConfig.rateLimit?.resetTime || 60000
          requestTracker.rateLimitResetTime[api] = Date.now() + waitTime
        }
        throw new Error(`Rate limit exceeded for ${api}. Please try again later.`)
      }

      // Handle other errors
      if (!response.ok) {
        throw new Error(`API request to ${api} failed with status ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Transform the data to our standard format
      return transformApiResponse<T>(api, endpoint, data, params)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.error(`${api} API error (attempt ${attempt + 1}/${retries + 1}):`, lastError.message)

      // Don't retry aborted requests or rate limit errors
      if (lastError.name === "AbortError" || lastError.message.includes("Rate limit exceeded")) {
        break
      }

      // If this wasn't the last attempt, wait before retrying
      if (attempt < retries) {
        const retryDelay = 1000 * Math.pow(2, attempt) // Exponential backoff
        console.log(`Retrying in ${retryDelay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }
  }

  // If we get here, all attempts failed
  throw lastError || new Error(`Failed to fetch data from ${api} after multiple attempts`)
}

/**
 * Map generic endpoint and params to API-specific ones
 */
function mapEndpointAndParams(
  api: ApiSource,
  endpoint: string,
  params: Record<string, string>,
): { mappedEndpoint: string; mappedParams: Record<string, string> } {
  const apiConfig = API_CONFIG[api]
  if (!apiConfig) {
    return { mappedEndpoint: endpoint, mappedParams: params }
  }

  let mappedEndpoint = endpoint
  let mappedParams = { ...params }

  switch (api) {
    case API_SOURCES.COINGECKO:
      // CoinGecko uses the endpoints as-is
      break

    case API_SOURCES.COINCAP:
      // Map CoinGecko endpoints to CoinCap endpoints
      if (endpoint.includes("/coins/markets")) {
        mappedEndpoint = apiConfig.endpoints.assets
      } else if (endpoint.includes("/coins/") && endpoint.includes("/market_chart")) {
        const id = endpoint.split("/coins/")[1].split("/market_chart")[0]
        mappedEndpoint = apiConfig.endpoints.assetHistory.replace("{id}", id)

        // Convert CoinGecko params to CoinCap params
        if (params.days) {
          const days = Number.parseInt(params.days)
          const interval = days <= 1 ? "m5" : days <= 7 ? "h1" : days <= 30 ? "h6" : "d1"
          mappedParams = {
            interval,
            start: String(Date.now() - days * 24 * 60 * 60 * 1000),
            end: String(Date.now()),
          }
        }
      } else if (endpoint.includes("/coins/") && !endpoint.includes("/market_chart")) {
        const id = endpoint.split("/coins/")[1].split("?")[0]
        mappedEndpoint = apiConfig.endpoints.assetDetail.replace("{id}", id)
      }
      break

    case API_SOURCES.CRYPTOCOMPARE:
      // Map CoinGecko endpoints to CryptoCompare endpoints
      if (endpoint.includes("/coins/markets")) {
        mappedEndpoint = apiConfig.endpoints.priceMultiFull

        // Get top cryptocurrencies
        const topCoins = [
          "BTC",
          "ETH",
          "XRP",
          "BNB",
          "SOL",
          "ADA",
          "DOGE",
          "TRX",
          "LINK",
          "DOT",
          "MATIC",
          "LTC",
          "SHIB",
          "UNI",
          "AVAX",
          "ATOM",
          "XLM",
          "NEAR",
          "ALGO",
          "FIL",
        ]

        mappedParams = {
          fsyms: topCoins.join(","),
          tsyms: (params.vs_currency || "usd").toUpperCase(),
        }
      } else if (endpoint.includes("/coins/") && endpoint.includes("/market_chart")) {
        const id = endpoint.split("/coins/")[1].split("/market_chart")[0]
        const days = Number.parseInt(params.days || "7")

        // Convert ID to symbol (simplified mapping)
        const symbolMap: Record<string, string> = {
          bitcoin: "BTC",
          ethereum: "ETH",
          ripple: "XRP",
          binancecoin: "BNB",
          solana: "SOL",
          cardano: "ADA",
          dogecoin: "DOGE",
          tron: "TRX",
          chainlink: "LINK",
          polkadot: "DOT",
        }

        const symbol = symbolMap[id] || id.toUpperCase()

        // Choose appropriate time interval based on days
        if (days <= 1) {
          mappedEndpoint = apiConfig.endpoints.histoMinute
          mappedParams = {
            fsym: symbol,
            tsym: (params.vs_currency || "usd").toUpperCase(),
            limit: "1440", // 24 hours of minute data
          }
        } else if (days <= 7) {
          mappedEndpoint = apiConfig.endpoints.histoHour
          mappedParams = {
            fsym: symbol,
            tsym: (params.vs_currency || "usd").toUpperCase(),
            limit: String(days * 24), // hours
          }
        } else {
          mappedEndpoint = apiConfig.endpoints.histoDay
          mappedParams = {
            fsym: symbol,
            tsym: (params.vs_currency || "usd").toUpperCase(),
            limit: days.toString(),
          }
        }
      } else if (endpoint.includes("/coins/") && !endpoint.includes("/market_chart")) {
        const id = endpoint.split("/coins/")[1].split("?")[0]

        // Convert ID to symbol (simplified mapping)
        const symbolMap: Record<string, string> = {
          bitcoin: "BTC",
          ethereum: "ETH",
          ripple: "XRP",
          binancecoin: "BNB",
          solana: "SOL",
          cardano: "ADA",
          dogecoin: "DOGE",
          tron: "TRX",
          chainlink: "LINK",
          polkadot: "DOT",
        }

        const symbol = symbolMap[id] || id.toUpperCase()

        mappedEndpoint = apiConfig.endpoints.coinInfo
        mappedParams = {
          fsyms: symbol,
          tsym: (params.vs_currency || "usd").toUpperCase(),
        }
      }
      break

    case API_SOURCES.BINANCE:
      // Map CoinGecko endpoints to Binance endpoints
      if (endpoint.includes("/coins/markets")) {
        mappedEndpoint = apiConfig.endpoints.ticker24hr
        // Binance doesn't need params for this endpoint
      } else if (endpoint.includes("/coins/") && endpoint.includes("/market_chart")) {
        mappedEndpoint = apiConfig.endpoints.klines

        const id = endpoint.split("/coins/")[1].split("/market_chart")[0]
        const days = Number.parseInt(params.days || "7")

        // Convert ID to symbol (simplified mapping)
        const symbolMap: Record<string, string> = {
          bitcoin: "BTCUSDT",
          ethereum: "ETHUSDT",
          ripple: "XRPUSDT",
          binancecoin: "BNBUSDT",
          solana: "SOLUSDT",
          cardano: "ADAUSDT",
          dogecoin: "DOGEUSDT",
          tron: "TRXUSDT",
          chainlink: "LINKUSDT",
          polkadot: "DOTUSDT",
        }

        const symbol = symbolMap[id] || `${id.toUpperCase()}USDT`

        // Choose appropriate interval based on days
        let interval = "1d"
        if (days <= 1) interval = "1h"
        else if (days <= 7) interval = "4h"

        mappedParams = {
          symbol,
          interval,
          limit: "500", // Maximum allowed
        }
      } else if (endpoint.includes("/coins/") && !endpoint.includes("/market_chart")) {
        // Binance doesn't have a direct endpoint for coin details
        // We'll use ticker24hr and exchangeInfo to get what we can
        mappedEndpoint = apiConfig.endpoints.ticker24hr

        const id = endpoint.split("/coins/")[1].split("?")[0]
        const symbolMap: Record<string, string> = {
          bitcoin: "BTCUSDT",
          ethereum: "ETHUSDT",
          ripple: "XRPUSDT",
          binancecoin: "BNBUSDT",
          solana: "SOLUSDT",
          cardano: "ADAUSDT",
          dogecoin: "DOGEUSDT",
          tron: "TRXUSDT",
          chainlink: "LINKUSDT",
          polkadot: "DOTUSDT",
        }

        const symbol = symbolMap[id] || `${id.toUpperCase()}USDT`
        mappedParams = { symbol }
      }
      break
  }

  return { mappedEndpoint, mappedParams }
}

/**
 * Transform API response to our standard format
 */
function transformApiResponse<T>(api: ApiSource, endpoint: string, data: any, params: Record<string, string>): T {
  switch (api) {
    case API_SOURCES.COINGECKO:
      // CoinGecko already returns data in our expected format
      return data as T

    case API_SOURCES.COINCAP:
      // Transform CoinCap data to match our expected format
      if (endpoint.includes("/coins/markets")) {
        return {
          data: data.data.map((asset: any) => ({
            id: asset.id,
            symbol: asset.symbol.toLowerCase(),
            name: asset.name,
            image: `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`,
            current_price: Number.parseFloat(asset.priceUsd),
            market_cap: Number.parseFloat(asset.marketCapUsd),
            total_volume: Number.parseFloat(asset.volumeUsd24Hr),
            price_change_percentage_24h: Number.parseFloat(asset.changePercent24Hr),
            market_cap_rank: Number.parseInt(asset.rank),
          })),
        } as unknown as T
      } else if (endpoint.includes("/market_chart")) {
        const prices = data.data.map((item: any) => [Number.parseInt(item.time), Number.parseFloat(item.priceUsd)])

        return {
          prices,
          market_caps: data.data.map((item: any) => [
            Number.parseInt(item.time),
            Number.parseFloat(item.marketCapUsd || "0"),
          ]),
          total_volumes: data.data.map((item: any) => [
            Number.parseInt(item.time),
            Number.parseFloat(item.volumeUsd || "0"),
          ]),
        } as unknown as T
      } else if (endpoint.includes("/coins/")) {
        const asset = data.data
        return {
          id: asset.id,
          symbol: asset.symbol.toLowerCase(),
          name: asset.name,
          image: {
            large: `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`,
          },
          market_data: {
            current_price: {
              usd: Number.parseFloat(asset.priceUsd),
              eur: Number.parseFloat(asset.priceUsd) * 0.93, // Approximate conversion
              gbp: Number.parseFloat(asset.priceUsd) * 0.79, // Approximate conversion
              jpy: Number.parseFloat(asset.priceUsd) * 150, // Approximate conversion
            },
            market_cap: {
              usd: Number.parseFloat(asset.marketCapUsd),
              eur: Number.parseFloat(asset.marketCapUsd) * 0.93,
              gbp: Number.parseFloat(asset.marketCapUsd) * 0.79,
              jpy: Number.parseFloat(asset.marketCapUsd) * 150,
            },
            total_volume: {
              usd: Number.parseFloat(asset.volumeUsd24Hr),
              eur: Number.parseFloat(asset.volumeUsd24Hr) * 0.93,
              gbp: Number.parseFloat(asset.volumeUsd24Hr) * 0.79,
              jpy: Number.parseFloat(asset.volumeUsd24Hr) * 150,
            },
            price_change_percentage_24h: Number.parseFloat(asset.changePercent24Hr),
            circulating_supply: Number.parseFloat(asset.supply),
            total_supply: Number.parseFloat(asset.maxSupply || asset.supply),
            max_supply: Number.parseFloat(asset.maxSupply || "0"),
          },
          market_cap_rank: Number.parseInt(asset.rank),
        } as unknown as T
      }
      break

    case API_SOURCES.CRYPTOCOMPARE:
      // Transform CryptoCompare data to match our expected format
      if (endpoint.includes("/coins/markets")) {
        const cryptoData = data.RAW || {}
        const displayData = data.DISPLAY || {}
        const currency = (params.vs_currency || "usd").toUpperCase()

        const transformedData = Object.keys(cryptoData).map((symbol, index) => {
          const coinData = cryptoData[symbol][currency]
          const displayCoinData = displayData[symbol]?.[currency] || {}

          // Map common cryptocurrency symbols to IDs
          const idMap: Record<string, string> = {
            BTC: "bitcoin",
            ETH: "ethereum",
            XRP: "ripple",
            BNB: "binancecoin",
            SOL: "solana",
            ADA: "cardano",
            DOGE: "dogecoin",
            TRX: "tron",
            LINK: "chainlink",
            DOT: "polkadot",
          }

          return {
            id: idMap[symbol] || symbol.toLowerCase(),
            symbol: symbol.toLowerCase(),
            name: displayCoinData.FROMSYMBOL || symbol,
            image: `https://www.cryptocompare.com${coinData.IMAGEURL || ""}`,
            current_price: coinData.PRICE || 0,
            market_cap: coinData.MKTCAP || 0,
            total_volume: coinData.TOTALVOLUME24H || 0,
            price_change_percentage_24h: coinData.CHANGEPCT24HOUR || 0,
            market_cap_rank: index + 1, // Approximate rank based on order
          }
        })

        return transformedData as unknown as T
      } else if (endpoint.includes("/market_chart")) {
        const histoData = data.Data || []

        const prices = histoData.map((item: any) => [
          item.time * 1000, // Convert to milliseconds
          item.close, // Use closing price
        ])

        // CryptoCompare doesn't provide market cap and volume in the same endpoint
        // So we'll create approximate data based on price
        const baseVolume = 1000000000 // $1B base volume
        const baseMarketCap = 10000000000 // $10B base market cap

        return {
          prices,
          market_caps: prices.map(([time, price]) => [time, (price * baseMarketCap) / 1000]),
          total_volumes: prices.map(([time, price]) => [time, (price * baseVolume) / 1000]),
        } as unknown as T
      } else if (endpoint.includes("/coins/")) {
        const symbol = Object.keys(data.RAW || {})[0]
        const currency = (params.vs_currency || "usd").toUpperCase()

        if (!symbol || !data.RAW?.[symbol]?.[currency]) {
          throw new Error("Invalid data format from CryptoCompare")
        }

        const coinData = data.RAW[symbol][currency]
        const coinInfo = data.DISPLAY?.[symbol]?.[currency] || {}
        const generalInfo = data.CoinList?.[symbol] || {}

        // Map common cryptocurrency symbols to IDs
        const idMap: Record<string, string> = {
          BTC: "bitcoin",
          ETH: "ethereum",
          XRP: "ripple",
          BNB: "binancecoin",
          SOL: "solana",
          ADA: "cardano",
          DOGE: "dogecoin",
          TRX: "tron",
          LINK: "chainlink",
          DOT: "polkadot",
        }

        return {
          id: idMap[symbol] || symbol.toLowerCase(),
          symbol: symbol.toLowerCase(),
          name: generalInfo.FullName || symbol,
          image: {
            large: `https://www.cryptocompare.com${coinData.IMAGEURL || ""}`,
          },
          market_data: {
            current_price: {
              [params.vs_currency || "usd"]: coinData.PRICE || 0,
              usd: coinData.PRICE || 0,
              eur: coinData.PRICE * 0.93 || 0, // Approximate conversion
              gbp: coinData.PRICE * 0.79 || 0, // Approximate conversion
              jpy: coinData.PRICE * 150 || 0, // Approximate conversion
            },
            market_cap: {
              [params.vs_currency || "usd"]: coinData.MKTCAP || 0,
              usd: coinData.MKTCAP || 0,
              eur: (coinData.MKTCAP || 0) * 0.93,
              gbp: (coinData.MKTCAP || 0) * 0.79,
              jpy: (coinData.MKTCAP || 0) * 150,
            },
            total_volume: {
              [params.vs_currency || "usd"]: coinData.TOTALVOLUME24H || 0,
              usd: coinData.TOTALVOLUME24H || 0,
              eur: (coinData.TOTALVOLUME24H || 0) * 0.93,
              gbp: (coinData.TOTALVOLUME24H || 0) * 0.79,
              jpy: (coinData.TOTALVOLUME24H || 0) * 150,
            },
            price_change_percentage_24h: coinData.CHANGEPCT24HOUR || 0,
            price_change_percentage_7d: 0, // Not available in this endpoint
            price_change_percentage_30d: 0, // Not available in this endpoint
            circulating_supply: coinData.SUPPLY || 0,
            total_supply: coinData.SUPPLY || 0,
            max_supply: 0, // Not available in this endpoint
            ath: coinData.HIGH24HOUR || 0, // Use 24h high as a fallback
            atl: coinData.LOW24HOUR || 0, // Use 24h low as a fallback
            ath_change_percentage: 0, // Not available
            atl_change_percentage: 0, // Not available
            ath_date: new Date().toISOString(), // Not available
            atl_date: new Date().toISOString(), // Not available
          },
          market_cap_rank: 1, // Not available
          description: {
            en: generalInfo.Description || "No description available.",
          },
          links: {
            homepage: [generalInfo.Url ? [generalInfo.Url] : []],
            blockchain_site: [],
            official_forum_url: [],
            twitter_screen_name: "",
            telegram_channel_identifier: "",
            subreddit_url: "",
          },
          categories: [generalInfo.Category || "Cryptocurrency"],
        } as unknown as T
      }
      break

    case API_SOURCES.BINANCE:
      // Transform Binance data to match our expected format
      if (endpoint.includes("/coins/markets")) {
        // For market overview, we need to filter for USDT pairs
        const usdtPairs = Array.isArray(data) ? data.filter((item: any) => item.symbol.endsWith("USDT")) : []

        return usdtPairs.map((item: any) => {
          const symbol = item.symbol.replace("USDT", "").toLowerCase()
          const idMap: Record<string, string> = {
            btc: "bitcoin",
            eth: "ethereum",
            xrp: "ripple",
            bnb: "binancecoin",
            sol: "solana",
            ada: "cardano",
            doge: "dogecoin",
            trx: "tron",
            link: "chainlink",
            dot: "polkadot",
          }

          return {
            id: idMap[symbol] || symbol,
            symbol: symbol,
            name: symbol.charAt(0).toUpperCase() + symbol.slice(1), // Capitalize first letter
            image: `https://bin.bnbstatic.com/image/admin_mgs_image_upload/20201110/87496d50-380c-43c9-8ab5-5d41c0bf1e5a.png`, // Generic Binance logo as fallback
            current_price: Number.parseFloat(item.lastPrice),
            market_cap: Number.parseFloat(item.quoteVolume) * 10, // Rough estimate
            total_volume: Number.parseFloat(item.volume),
            price_change_percentage_24h: Number.parseFloat(item.priceChangePercent),
            market_cap_rank: 0, // Not available
          }
        }) as unknown as T
      } else if (endpoint.includes("/market_chart")) {
        // For historical data from klines endpoint
        const klines = Array.isArray(data) ? data : []

        // Binance klines format: [openTime, open, high, low, close, volume, closeTime, ...]
        const prices = klines.map((item: any) => [
          item[0], // Open time
          Number.parseFloat(item[4]), // Close price
        ])

        const volumes = klines.map((item: any) => [
          item[0], // Open time
          Number.parseFloat(item[5]), // Volume
        ])

        // Estimate market cap (not directly available)
        const marketCaps = klines.map((item: any) => [
          item[0], // Open time
          Number.parseFloat(item[4]) * Number.parseFloat(item[5]) * 10, // Close price * volume * multiplier
        ])

        return {
          prices,
          market_caps: marketCaps,
          total_volumes: volumes,
        } as unknown as T
      } else if (endpoint.includes("/coins/")) {
        // For coin details, we need to combine data from ticker and exchange info
        const ticker = Array.isArray(data) ? data[0] : data

        if (!ticker) {
          throw new Error("Invalid data format from Binance")
        }

        const symbol = ticker.symbol.replace("USDT", "")
        const idMap: Record<string, string> = {
          BTC: "bitcoin",
          ETH: "ethereum",
          XRP: "ripple",
          BNB: "binancecoin",
          SOL: "solana",
          ADA: "cardano",
          DOGE: "dogecoin",
          TRX: "tron",
          LINK: "chainlink",
          DOT: "polkadot",
        }

        return {
          id: idMap[symbol] || symbol.toLowerCase(),
          symbol: symbol.toLowerCase(),
          name: symbol,
          image: {
            large: `https://bin.bnbstatic.com/image/admin_mgs_image_upload/20201110/87496d50-380c-43c9-8ab5-5d41c0bf1e5a.png`,
          },
          market_data: {
            current_price: {
              usd: Number.parseFloat(ticker.lastPrice),
              eur: Number.parseFloat(ticker.lastPrice) * 0.93,
              gbp: Number.parseFloat(ticker.lastPrice) * 0.79,
              jpy: Number.parseFloat(ticker.lastPrice) * 150,
            },
            market_cap: {
              usd: Number.parseFloat(ticker.quoteVolume) * 10,
              eur: Number.parseFloat(ticker.quoteVolume) * 10 * 0.93,
              gbp: Number.parseFloat(ticker.quoteVolume) * 10 * 0.79,
              jpy: Number.parseFloat(ticker.quoteVolume) * 10 * 150,
            },
            total_volume: {
              usd: Number.parseFloat(ticker.volume),
              eur: Number.parseFloat(ticker.volume) * 0.93,
              gbp: Number.parseFloat(ticker.volume) * 0.79,
              jpy: Number.parseFloat(ticker.volume) * 150,
            },
            price_change_percentage_24h: Number.parseFloat(ticker.priceChangePercent),
            circulating_supply: 0, // Not available
            total_supply: 0, // Not available
            max_supply: 0, // Not available
            ath: Number.parseFloat(ticker.highPrice), // 24h high
            atl: Number.parseFloat(ticker.lowPrice), // 24h low
          },
          market_cap_rank: 0, // Not available
          description: {
            en: `${symbol} cryptocurrency trading on Binance.`,
          },
          links: {
            homepage: [`https://www.binance.com/en/trade/${symbol}_USDT`],
            blockchain_site: [],
            official_forum_url: [],
            twitter_screen_name: "binance",
            telegram_channel_identifier: "",
            subreddit_url: "",
          },
          categories: ["Cryptocurrency"],
        } as unknown as T
      }
      break
  }

  // Default: return data as-is
  return data as T
}

/**
 * Prepare a URL with parameters
 */
function prepareUrl(baseUrl: string, endpoint: string, params: Record<string, string>): string {
  const url = new URL(baseUrl + endpoint)

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value)
  })

  // Add a cache-busting parameter
  url.searchParams.append("_t", Date.now().toString())

  return url.toString()
}

/**
 * Get cached data if it exists and is not expired
 */
function getCachedData<T>(key: string): { data: T; source: ApiSource; timestamp: number } | null {
  try {
    const cached = sessionStorage.getItem(key)
    if (!cached) return null

    const { data, source, timestamp, expiry } = JSON.parse(cached)

    // Check if the cache is expired
    if (Date.now() - timestamp > expiry) {
      sessionStorage.removeItem(key)
      return null
    }

    return { data, source, timestamp }
  } catch (error) {
    console.error("Error retrieving from cache:", error)
    return null
  }
}

/**
 * Cache data with an expiration time
 */
function cacheData<T>(key: string, data: T, source: ApiSource, expiry: number): void {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        data,
        source,
        timestamp: Date.now(),
        expiry,
      }),
    )
  } catch (error) {
    console.error("Error storing in cache:", error)
  }
}

/**
 * Get mock data as a last resort
 */
async function getMockData<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  // Helper function to ensure numbers are within safe range
  function safeNumber(value: number): number {
    return Math.min(Math.max(value, -Number.MAX_SAFE_INTEGER / 2), Number.MAX_SAFE_INTEGER / 2)
  }

  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      if (endpoint.includes("/coins/markets")) {
        resolve({
          data: [
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
            // Add more mock cryptocurrencies
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
          ],
        } as unknown as T)
      } else if (endpoint.includes("/market_chart")) {
        // Generate mock price data for the chart
        const days = Number.parseInt(params.days || "7")
        const now = Date.now()
        const interval = days <= 1 ? 3600000 : days <= 7 ? 21600000 : 86400000 // 1h, 6h, or 1d
        const dataPoints = days <= 1 ? 24 : days <= 7 ? 28 : days // 24 points for 1d, 28 for 7d, or days for longer periods

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

        resolve({
          prices,
          market_caps: prices.map(([time, price]) => [time, safeNumber(price * 19000000)]), // Approx BTC supply * price
          total_volumes: prices.map(([time]) => [time, safeNumber(30000000000 + Math.random() * 5000000000)]),
        } as unknown as T)
      } else if (endpoint.includes("/coins/")) {
        // Mock data for a specific coin (using Bitcoin as an example)
        const id = endpoint.split("/coins/")[1].split("?")[0]

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
            description:
              "Cardano is a proof-of-stake blockchain platform with a focus on sustainability and scalability.",
            rank: 8,
          },
          solana: {
            price: 120,
            marketCap: 50000000000,
            volume: 2000000000,
            change24h: 3.7,
            supply: 400000000,
            maxSupply: null,
            description:
              "Solana is a high-performance blockchain supporting builders around the world creating crypto apps.",
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

        resolve({
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
              usd: safeNumber(coinData.marketCap),
              eur: safeNumber(coinData.marketCap * 0.93),
              gbp: safeNumber(coinData.marketCap * 0.79),
              jpy: safeNumber(coinData.marketCap * 150),
            },
            total_volume: {
              usd: safeNumber(coinData.volume),
              eur: safeNumber(coinData.volume * 0.93),
              gbp: safeNumber(coinData.volume * 0.79),
              jpy: safeNumber(coinData.volume * 150),
            },
            price_change_percentage_24h: coinData.change24h,
            price_change_percentage_7d: coinData.change24h * 1.5,
            price_change_percentage_30d: coinData.change24h * 2,
            circulating_supply: coinData.supply,
            total_supply: coinData.supply,
            max_supply: coinData.maxSupply,
            ath: coinData.price * 1.5,
            atl: coinData.price * 0.5,
            ath_change_percentage: -30,
            atl_change_percentage: 100,
            ath_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            atl_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
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
        } as unknown as T)
      } else {
        // Default mock data
        resolve({} as T)
      }
    }, 500) // Reduced delay for better UX
  })
}

/**
 * Reset API status periodically to retry failed APIs
 */
export function setupApiStatusReset(intervalMinutes = 30) {
  // Only run in browser environment
  if (typeof window !== "undefined") {
    // Initial reset after 1 minute
    setTimeout(() => {
      apiStatusTracker.resetStatuses()
      console.log("API statuses reset")
    }, 60 * 1000)

    // Then reset periodically
    setInterval(
      () => {
        apiStatusTracker.resetStatuses()
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
 * Check if the browser is online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine
}
