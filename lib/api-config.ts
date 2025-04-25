/**
 * API Configuration
 * This file contains configuration for all API endpoints used in the application
 */

// API endpoints
export const API_CONFIG = {
  primary: {
    name: "CoinGecko",
    baseUrl: "https://api.coingecko.com/api/v3",
    endpoints: {
      markets: "/coins/markets",
      coinDetail: "/coins/{id}",
      marketChart: "/coins/{id}/market_chart",
      search: "/search",
    },
    headers: {
      Accept: "application/json",
    },
  },
  secondary: {
    name: "CoinCap",
    baseUrl: "https://api.coincap.io/v2",
    endpoints: {
      markets: "/assets",
      coinDetail: "/assets/{id}",
      marketChart: "/assets/{id}/history",
    },
    headers: {
      Accept: "application/json",
    },
  },
  tertiary: {
    name: "CryptoCompare",
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
  },
  quaternary: {
    name: "Binance",
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
export const CACHE_CONFIG = {
  marketsList: 10 * 60 * 1000, // 10 minutes
  coinDetail: 15 * 60 * 1000, // 15 minutes
  marketChart: 20 * 60 * 1000, // 20 minutes
  search: 30 * 60 * 1000, // 30 minutes
}

// Common cryptocurrency symbols to fetch by default
export const COMMON_SYMBOLS = [
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

// Currency mapping for different APIs
export const CURRENCY_MAPPING: Record<string, string> = {
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  jpy: "JPY",
}

// Symbol to ID mapping for common cryptocurrencies
export const SYMBOL_TO_ID_MAPPING: Record<string, string> = {
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
  MATIC: "polygon",
  LTC: "litecoin",
  ATOM: "cosmos",
  AVAX: "avalanche",
  UNI: "uniswap",
  ALGO: "algorand",
  XLM: "stellar",
  NEAR: "near",
  FIL: "filecoin",
  ETC: "ethereum-classic",
}

// ID to Symbol mapping for common cryptocurrencies
export const ID_TO_SYMBOL_MAPPING: Record<string, string> = Object.entries(SYMBOL_TO_ID_MAPPING).reduce(
  (acc, [symbol, id]) => ({ ...acc, [id]: symbol }),
  {},
)
