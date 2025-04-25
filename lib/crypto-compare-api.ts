/**
 * CryptoCompare API integration
 * This file provides functions to fetch cryptocurrency data from CryptoCompare API
 * as an alternative to CoinGecko and CoinCap
 */

import { cacheUtils } from "./api"

// API configuration
const API_CONFIG = {
  baseUrl: "https://min-api.cryptocompare.com/data",
  endpoints: {
    priceMultiFull: "/pricemultifull",
    coinList: "/all/coinlist",
    histoDay: "/histoday",
    histoHour: "/histohour",
    histoMinute: "/histominute",
    coinInfo: "/coin/generalinfo",
  },
  imageBaseUrl: "https://www.cryptocompare.com",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
}

// Cache configuration
const CACHE_CONFIG = {
  coinList: 24 * 60 * 60 * 1000, // 24 hours
  priceData: 5 * 60 * 1000, // 5 minutes
  historicalData: 15 * 60 * 1000, // 15 minutes
  coinInfo: 60 * 60 * 1000, // 1 hour
}

// Common cryptocurrency symbols to fetch by default
const COMMON_SYMBOLS = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "DOT",
  "MATIC",
  "LINK",
  "UNI",
  "LTC",
  "ATOM",
  "ETC",
  "FIL",
  "XLM",
  "NEAR",
  "ALGO",
  "FLOW",
  "APE",
  "AXS",
  "SAND",
  "MANA",
  "GALA",
]

// Currency mapping
const CURRENCY_MAPPING: Record<string, string> = {
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  jpy: "JPY",
}

/**
 * Fetch cryptocurrency list from CryptoCompare
 */
export async function fetchCryptoList(currency = "usd", forceRefresh = false): Promise<any[]> {
  const cacheKey = `cryptocompare-list-${currency}`

  // Check cache first
  if (!forceRefresh) {
    const cachedData = cacheUtils.get(cacheKey)
    if (cachedData) {
      return cachedData.data
    }
  }

  try {
    // First, get the coin list to map symbols to IDs
    const coinListResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.coinList}?summary=true`)

    if (!coinListResponse.ok) {
      throw new Error(`Failed to fetch coin list: ${coinListResponse.status}`)
    }

    const coinListData = await coinListResponse.json()

    // Then get price data for common symbols
    const fsym = COMMON_SYMBOLS.join(",")
    const tsym = CURRENCY_MAPPING[currency] || "USD"

    const priceResponse = await fetch(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.priceMultiFull}?fsyms=${fsym}&tsyms=${tsym}`,
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
        id: coinInfo?.Id || symbol.toLowerCase(),
        symbol: symbol.toLowerCase(),
        name: coinInfo?.CoinName || symbol,
        image: coinInfo?.ImageUrl ? `${API_CONFIG.imageBaseUrl}${coinInfo.ImageUrl}` : null,
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
    cacheUtils.set(cacheKey, cryptoList, CACHE_CONFIG.priceData)

    return cryptoList
  } catch (error) {
    console.error("Error fetching crypto list from CryptoCompare:", error)
    throw error
  }
}

/**
 * Fetch detailed information about a specific cryptocurrency
 */
export async function fetchCryptoDetail(id: string, currency = "usd", forceRefresh = false): Promise<any> {
  const cacheKey = `cryptocompare-detail-${id}-${currency}`

  // Check cache first
  if (!forceRefresh) {
    const cachedData = cacheUtils.get(cacheKey)
    if (cachedData) {
      return cachedData.data
    }
  }

  try {
    // Convert ID to symbol if needed
    let symbol = id.toUpperCase()

    // For common IDs that don't match their symbols
    if (id === "bitcoin") symbol = "BTC"
    if (id === "ethereum") symbol = "ETH"
    if (id === "ripple") symbol = "XRP"
    if (id === "cardano") symbol = "ADA"
    if (id === "solana") symbol = "SOL"

    const tsym = CURRENCY_MAPPING[currency] || "USD"

    // Get price data
    const priceResponse = await fetch(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.priceMultiFull}?fsyms=${symbol}&tsyms=${tsym},EUR,GBP,JPY`,
    )

    if (!priceResponse.ok) {
      throw new Error(`Failed to fetch price data: ${priceResponse.status}`)
    }

    const priceData = await priceResponse.json()

    if (!priceData.RAW || !priceData.RAW[symbol]) {
      throw new Error(`No data found for ${symbol}`)
    }

    // Get coin info
    const infoResponse = await fetch(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.coinInfo}?fsyms=${symbol}&tsym=${tsym}`,
    )

    if (!infoResponse.ok) {
      throw new Error(`Failed to fetch coin info: ${infoResponse.status}`)
    }

    const infoData = await infoResponse.json()
    const coinInfo = infoData.Data?.[0]?.CoinInfo

    // Transform the data to match our expected format
    const cryptoDetail = {
      id,
      symbol: symbol.toLowerCase(),
      name: coinInfo?.FullName || symbol,
      image: {
        large: coinInfo?.ImageUrl ? `${API_CONFIG.imageBaseUrl}${coinInfo.ImageUrl}` : null,
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
        },
        atl: {
          usd: priceData.RAW[symbol].USD?.LOW24HOUR || 0, // Using 24h low as fallback
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
    cacheUtils.set(cacheKey, cryptoDetail, CACHE_CONFIG.coinInfo)

    return cryptoDetail
  } catch (error) {
    console.error(`Error fetching crypto detail for ${id} from CryptoCompare:`, error)
    throw error
  }
}

/**
 * Fetch historical price data for a cryptocurrency
 */
export async function fetchCryptoChartData(
  id: string,
  currency = "usd",
  days = "7",
  forceRefresh = false,
): Promise<any> {
  const cacheKey = `cryptocompare-chart-${id}-${currency}-${days}`

  // Check cache first
  if (!forceRefresh) {
    const cachedData = cacheUtils.get(cacheKey)
    if (cachedData) {
      return cachedData.data
    }
  }

  try {
    // Convert ID to symbol if needed
    let symbol = id.toUpperCase()

    // For common IDs that don't match their symbols
    if (id === "bitcoin") symbol = "BTC"
    if (id === "ethereum") symbol = "ETH"
    if (id === "ripple") symbol = "XRP"
    if (id === "cardano") symbol = "ADA"
    if (id === "solana") symbol = "SOL"

    const tsym = CURRENCY_MAPPING[currency] || "USD"
    const daysNum = Number.parseInt(days)

    // Determine the appropriate endpoint and limit based on days
    let endpoint = API_CONFIG.endpoints.histoDay
    let limit = daysNum

    if (daysNum <= 1) {
      endpoint = API_CONFIG.endpoints.histoHour
      limit = 24 // 24 hours
    } else if (daysNum <= 7) {
      endpoint = API_CONFIG.endpoints.histoHour
      limit = daysNum * 24 // hours in requested days
    } else if (daysNum <= 30) {
      endpoint = API_CONFIG.endpoints.histoDay
      limit = 30
    } else {
      endpoint = API_CONFIG.endpoints.histoDay
      limit = Math.min(daysNum, 365) // Max 365 days
    }

    // Get historical data
    const historyResponse = await fetch(`${API_CONFIG.baseUrl}${endpoint}?fsym=${symbol}&tsym=${tsym}&limit=${limit}`)

    if (!historyResponse.ok) {
      throw new Error(`Failed to fetch historical data: ${historyResponse.status}`)
    }

    const historyData = await historyResponse.json()

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

    const chartData = {
      prices,
      market_caps: marketCaps,
      total_volumes: volumes,
    }

    // Cache the result
    cacheUtils.set(cacheKey, chartData, CACHE_CONFIG.historicalData)

    return chartData
  } catch (error) {
    console.error(`Error fetching chart data for ${id} from CryptoCompare:`, error)
    throw error
  }
}
