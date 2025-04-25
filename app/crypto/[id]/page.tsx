"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Star,
  AlertTriangle,
  Database,
  Server,
  CloudOff,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CurrencyToggle } from "@/components/currency-toggle"
import { PriceChart } from "@/components/price-chart"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useFavorites } from "@/components/favorites-provider"
import { toast } from "@/components/ui/use-toast"
import { getCryptoDetail, formatErrorMessage, formatters, apiStatus } from "@/lib/api-utils"

interface CryptoDetailProps {
  params: {
    id: string
  }
}

export default function CryptoDetailPage({ params }: CryptoDetailProps) {
  const [crypto, setCrypto] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState(() => {
    // Get currency from localStorage if available
    if (typeof window !== "undefined") {
      return localStorage.getItem("preferred-currency") || "usd"
    }
    return "usd"
  })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const { isFavorite, toggleFavorite } = useFavorites()
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [dataSource, setDataSource] = useState(apiStatus.currentSource)

  // Save currency preference to localStorage
  useEffect(() => {
    localStorage.setItem("preferred-currency", currency)
  }, [currency])

  // Update data source when it changes
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (dataSource !== apiStatus.currentSource) {
        setDataSource(apiStatus.currentSource)
      }
    }, 1000)

    return () => clearInterval(checkInterval)
  }, [dataSource])

  const fetchCryptoDetail = useCallback(
    async (forceRefresh = false) => {
      try {
        setLoading(true)
        setError(null)
        setLoadingProgress(10)

        // Simulate progress while fetching
        const progressInterval = setInterval(() => {
          setLoadingProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval)
              return prev
            }
            return prev + 10
          })
        }, 300)

        const data = await getCryptoDetail(params.id, currency, forceRefresh)
        setDataSource(apiStatus.currentSource)

        setCrypto(data)
        setLastUpdated(new Date())
        setRetryCount(0)
        setIsRetrying(false)
        setLoadingProgress(100)

        clearInterval(progressInterval)
      } catch (err) {
        console.error("Error fetching crypto details:", err)
        const errorMessage = formatErrorMessage(err)
        setError(errorMessage)

        if (retryCount < maxRetries && !isRetrying) {
          // Auto-retry with exponential backoff
          setIsRetrying(true)
          const delay = Math.pow(2, retryCount) * 1000
          toast({
            title: "Retrying data fetch",
            description: `Attempt ${retryCount + 1} of ${maxRetries}. Retrying in ${delay / 1000} seconds.`,
            variant: "default",
          })

          setTimeout(() => {
            setRetryCount((prev) => prev + 1)
            fetchCryptoDetail(true)
          }, delay)
        }
      } finally {
        setLoading(false)
        // Reset progress after a delay to allow the progress bar to complete visually
        setTimeout(() => setLoadingProgress(0), 500)
      }
    },
    [params.id, currency, retryCount, isRetrying],
  )

  useEffect(() => {
    fetchCryptoDetail()
  }, [fetchCryptoDetail])

  const handleToggleFavorite = () => {
    toggleFavorite(params.id)
    toast({
      title: isFavorite(params.id) ? "Removed from favorites" : "Added to favorites",
      description: isFavorite(params.id)
        ? `${crypto?.name} has been removed from your favorites`
        : `${crypto?.name} has been added to your favorites`,
      duration: 3000,
    })
  }

  if (loading) {
    return (
      <div className="container py-6 md:py-10">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to all cryptocurrencies
          </Link>
        </div>

        {loadingProgress > 0 && (
          <div className="w-full mb-6">
            <Progress value={loadingProgress} className="h-1" />
            <p className="text-xs text-muted-foreground text-center mt-1">Loading cryptocurrency data...</p>
          </div>
        )}

        <div className="grid gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div>
                <Skeleton className="h-8 w-40" />
                <Skeleton className="mt-2 h-4 w-20" />
              </div>
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error && !crypto) {
    return (
      <div className="container py-6 md:py-10">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to all cryptocurrencies
          </Link>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="mb-2 text-xl font-semibold">Failed to load data</h3>
              <p className="text-muted-foreground mb-4">{error || "Could not find cryptocurrency details"}</p>
              <Button onClick={() => fetchCryptoDetail(true)} className="mt-4" disabled={isRetrying}>
                {isRetrying ? "Retrying..." : "Try Again"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container py-6 md:py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to all cryptocurrencies
        </Link>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6 bg-destructive/10 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchCryptoDetail(true)}
              disabled={isRetrying}
              className="self-start"
            >
              {isRetrying ? "Retrying..." : "Refresh Data"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Image
              src={crypto?.image?.large || "/placeholder.svg"}
              alt={crypto?.name || "Cryptocurrency"}
              width={64}
              height={64}
              className="rounded-full"
            />
            {crypto?.market_cap_rank && (
              <Badge className="absolute -bottom-2 -right-2 px-2 py-1">#{crypto.market_cap_rank}</Badge>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{crypto?.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-yellow-400"
                onClick={handleToggleFavorite}
                title={isFavorite(params.id) ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={`h-5 w-5 ${isFavorite(params.id) ? "fill-yellow-400" : ""}`} />
                <span className="sr-only">{isFavorite(params.id) ? "Remove from favorites" : "Add to favorites"}</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => fetchCryptoDetail(true)}
                title="Refresh data"
                disabled={isRetrying}
              >
                <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                <span className="sr-only">Refresh data</span>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-lg text-muted-foreground uppercase">{crypto?.symbol}</p>
              {crypto?.categories && crypto.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {crypto.categories.slice(0, 2).map((category: string) => (
                    <Badge key={category} variant="outline" className="text-xs">
                      {category}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CurrencyToggle currency={currency} setCurrency={setCurrency} />
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</p>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Data Source:
            {dataSource === "server" ? (
              <>
                <Server className="h-3 w-3" />
                Server
              </>
            ) : dataSource === "local" ? (
              <>
                <Database className="h-3 w-3" />
                Local
              </>
            ) : (
              <>
                <CloudOff className="h-3 w-3" />
                Fallback
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Price Chart</CardTitle>
                <CardDescription>Historical price data for {crypto?.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <PriceChart cryptoId={params.id} currency={currency} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Price Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Current Price</div>
                    <div className="text-2xl font-bold">
                      {formatters.currency(crypto?.market_data?.current_price?.[currency], currency)}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">24h</div>
                      <div
                        className={`flex items-center font-medium ${
                          crypto?.market_data?.price_change_percentage_24h > 0
                            ? "text-green-500"
                            : crypto?.market_data?.price_change_percentage_24h < 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        {crypto?.market_data?.price_change_percentage_24h > 0 ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : crypto?.market_data?.price_change_percentage_24h < 0 ? (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        ) : null}
                        {formatters.percentage(crypto?.market_data?.price_change_percentage_24h)}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-muted-foreground">7d</div>
                      <div
                        className={`flex items-center font-medium ${
                          crypto?.market_data?.price_change_percentage_7d > 0
                            ? "text-green-500"
                            : crypto?.market_data?.price_change_percentage_7d < 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        {crypto?.market_data?.price_change_percentage_7d > 0 ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : crypto?.market_data?.price_change_percentage_7d < 0 ? (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        ) : null}
                        {formatters.percentage(crypto?.market_data?.price_change_percentage_7d)}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-muted-foreground">30d</div>
                      <div
                        className={`flex items-center font-medium ${
                          crypto?.market_data?.price_change_percentage_30d > 0
                            ? "text-green-500"
                            : crypto?.market_data?.price_change_percentage_30d < 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        {crypto?.market_data?.price_change_percentage_30d > 0 ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : crypto?.market_data?.price_change_percentage_30d < 0 ? (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        ) : null}
                        {formatters.percentage(crypto?.market_data?.price_change_percentage_30d)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Market Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <div className="text-sm text-muted-foreground">Market Cap</div>
                    <div className="font-medium">
                      {formatters.currency(crypto?.market_data?.market_cap?.[currency], currency)}
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <div className="text-sm text-muted-foreground">24h Volume</div>
                    <div className="font-medium">
                      {formatters.currency(crypto?.market_data?.total_volume?.[currency], currency)}
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <div className="text-sm text-muted-foreground">Circulating Supply</div>
                    <div className="font-medium">
                      {formatters.largeNumber(crypto?.market_data?.circulating_supply)} {crypto?.symbol?.toUpperCase()}
                    </div>
                  </div>

                  {crypto?.market_data?.total_supply && (
                    <div className="flex justify-between">
                      <div className="text-sm text-muted-foreground">Total Supply</div>
                      <div className="font-medium">
                        {formatters.largeNumber(crypto?.market_data?.total_supply)} {crypto?.symbol?.toUpperCase()}
                      </div>
                    </div>
                  )}

                  {crypto?.market_data?.max_supply && (
                    <div className="flex justify-between">
                      <div className="text-sm text-muted-foreground">Max Supply</div>
                      <div className="font-medium">
                        {formatters.largeNumber(crypto?.market_data?.max_supply)} {crypto?.symbol?.toUpperCase()}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All-Time Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between">
                      <span className="text-sm text-muted-foreground">All-Time High</span>
                      <span className="font-medium">
                        {formatters.currency(crypto?.market_data?.ath?.[currency], currency)}
                      </span>
                    </div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {formatters.date(crypto?.market_data?.ath_date?.[currency])}
                      </span>
                      <span
                        className={
                          crypto?.market_data?.ath_change_percentage?.[currency] >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {formatters.percentage(crypto?.market_data?.ath_change_percentage?.[currency])}
                      </span>
                    </div>
                    <Progress
                      value={
                        crypto?.market_data?.current_price?.[currency] && crypto?.market_data?.ath?.[currency]
                          ? (crypto.market_data.current_price[currency] / crypto.market_data.ath[currency]) * 100
                          : 0
                      }
                      className="h-1.5"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between">
                      <span className="text-sm text-muted-foreground">All-Time Low</span>
                      <span className="font-medium">
                        {formatters.currency(crypto?.market_data?.atl?.[currency], currency)}
                      </span>
                    </div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {formatters.date(crypto?.market_data?.atl_date?.[currency])}
                      </span>
                      <span
                        className={
                          crypto?.market_data?.atl_change_percentage?.[currency] >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {formatters.percentage(crypto?.market_data?.atl_change_percentage?.[currency])}
                      </span>
                    </div>
                    <Progress
                      value={
                        crypto?.market_data?.atl?.[currency] && crypto?.market_data?.current_price?.[currency]
                          ? 100 - (crypto.market_data.atl[currency] / crypto.market_data.current_price[currency]) * 100
                          : 100
                      }
                      className="h-1.5"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="markets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Price Change</CardTitle>
              <CardDescription>Historical price changes for different time periods</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  { label: "24 Hours", value: crypto?.market_data?.price_change_percentage_24h },
                  { label: "7 Days", value: crypto?.market_data?.price_change_percentage_7d },
                  { label: "30 Days", value: crypto?.market_data?.price_change_percentage_30d },
                  { label: "60 Days", value: crypto?.market_data?.price_change_percentage_60d },
                  { label: "200 Days", value: crypto?.market_data?.price_change_percentage_200d },
                  { label: "1 Year", value: crypto?.market_data?.price_change_percentage_1y },
                ].map((item) => (
                  <Card key={item.label} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">{item.label}</div>
                      <div
                        className={`text-xl font-bold ${
                          item.value && item.value > 0
                            ? "text-green-500"
                            : item.value && item.value < 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        {formatters.percentage(item.value)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Links</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Official</h3>
                  <div className="space-y-2">
                    {crypto?.links?.homepage?.[0] && (
                      <a
                        href={crypto.links.homepage[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Official Website
                      </a>
                    )}
                    {crypto?.links?.announcement_url?.[0] && (
                      <a
                        href={crypto.links.announcement_url[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Announcements
                      </a>
                    )}
                    {crypto?.links?.official_forum_url?.[0] && (
                      <a
                        href={crypto.links.official_forum_url[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Official Forum
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Social</h3>
                  <div className="space-y-2">
                    {crypto?.links?.twitter_screen_name && (
                      <a
                        href={`https://twitter.com/${crypto.links.twitter_screen_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Twitter
                      </a>
                    )}
                    {crypto?.links?.facebook_username && (
                      <a
                        href={`https://facebook.com/${crypto.links.facebook_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Facebook
                      </a>
                    )}
                    {crypto?.links?.telegram_channel_identifier && (
                      <a
                        href={`https://t.me/${crypto.links.telegram_channel_identifier}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Telegram
                      </a>
                    )}
                    {crypto?.links?.subreddit_url && (
                      <a
                        href={crypto.links.subreddit_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm hover:underline"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Reddit
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Blockchain</h3>
                  <div className="space-y-2">
                    {crypto?.links?.blockchain_site?.slice(0, 3).map(
                      (site: string, index: number) =>
                        site && (
                          <a
                            key={index}
                            href={site}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-sm hover:underline"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Explorer {index + 1}
                          </a>
                        ),
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Chat</h3>
                  <div className="space-y-2">
                    {crypto?.links?.chat_url?.slice(0, 3).map(
                      (chat: string, index: number) =>
                        chat && (
                          <a
                            key={index}
                            href={chat}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-sm hover:underline"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Chat {index + 1}
                          </a>
                        ),
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>About {crypto?.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {crypto?.description?.en ? (
                <div
                  className="prose max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: crypto.description.en }}
                />
              ) : (
                <p className="text-muted-foreground">No description available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
