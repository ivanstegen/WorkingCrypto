"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { RefreshCw, ZoomIn, ZoomOut, AlertTriangle, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { Progress } from "@/components/ui/progress"
import { getCryptoChartData, formatters, formatErrorMessage } from "@/lib/api-utils"

interface PriceChartProps {
  cryptoId: string
  currency: string
}

interface ChartData {
  date: string
  price: number
  timestamp: number
  volume?: number
  market_cap?: number
  rawDate?: string
}

export function PriceChart({ cryptoId, currency }: PriceChartProps) {
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(`chart-timerange-${cryptoId}`) || "7"
    }
    return "7"
  })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showVolume, setShowVolume] = useState(false)
  const [showMarketCap, setShowMarketCap] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [priceStats, setPriceStats] = useState({
    min: 0,
    max: 0,
    avg: 0,
    change: 0,
    changePercent: 0,
  })
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [fetchProgress, setFetchProgress] = useState(0)
  const maxRetries = 3
  const abortControllerRef = useRef<AbortController | null>(null)

  // Save time range preference
  useEffect(() => {
    localStorage.setItem(`chart-timerange-${cryptoId}`, timeRange)
  }, [timeRange, cryptoId])

  // Cleanup function for aborting ongoing requests when component unmounts or timeRange changes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [timeRange])

  const fetchChartData = useCallback(
    async (forceRefresh = false) => {
      // Abort any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController()

      try {
        setLoading(true)
        setError(null)
        setFetchProgress(10) // Start progress

        // Simulate progress while fetching
        const progressInterval = setInterval(() => {
          setFetchProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval)
              return prev
            }
            return prev + 10
          })
        }, 300)

        const data = await getCryptoChartData(cryptoId, currency, timeRange, forceRefresh)

        if (!data || !data.prices || !Array.isArray(data.prices)) {
          throw new Error("Invalid chart data received")
        }

        // Format the data for the chart
        const formattedData = data.prices.map((item: [number, number], index: number) => {
          const date = new Date(item[0])
          const volumeData = data.total_volumes && data.total_volumes[index] ? data.total_volumes[index][1] : 0
          const marketCapData = data.market_caps && data.market_caps[index] ? data.market_caps[index][1] : 0

          return {
            date: formatDate(date, timeRange),
            price: item[1],
            timestamp: date.getTime(),
            volume: volumeData,
            market_cap: marketCapData,
            rawDate: date.toISOString(),
          }
        })

        // Sort data by timestamp to ensure chronological order
        formattedData.sort((a, b) => a.timestamp - b.timestamp)

        // For long time ranges, reduce the number of data points to improve performance
        let processedData = formattedData
        if (formattedData.length > 500) {
          const factor = Math.ceil(formattedData.length / 500)
          processedData = formattedData.filter((_, index) => index % factor === 0)
        }

        // Ensure we have at least the first and last data points
        if (
          processedData.length > 0 &&
          formattedData.length > 0 &&
          processedData[processedData.length - 1].timestamp !== formattedData[formattedData.length - 1].timestamp
        ) {
          processedData.push(formattedData[formattedData.length - 1])
        }

        setChartData(processedData)
        calculatePriceStats(processedData)
        setLastUpdated(new Date())
        setRetryCount(0) // Reset retry count on success
        setIsRetrying(false)

        clearInterval(progressInterval)
        setFetchProgress(100) // Complete progress
      } catch (err) {
        // Don't handle aborted requests as errors
        if (abortControllerRef.current?.signal.aborted) {
          console.log("Request was aborted")
          return
        }

        console.error("Chart data fetch error:", err)
        const errorMessage = formatErrorMessage(err)
        setError(errorMessage)

        if (retryCount < maxRetries && !isRetrying) {
          // Auto-retry with exponential backoff
          setIsRetrying(true)
          const delay = Math.pow(2, retryCount) * 1000
          toast({
            title: "Retrying chart data fetch",
            description: `Attempt ${retryCount + 1} of ${maxRetries}. Retrying in ${delay / 1000} seconds.`,
            variant: "default",
          })

          setTimeout(() => {
            setRetryCount((prev) => prev + 1)
            fetchChartData(true)
          }, delay)
        }
      } finally {
        setLoading(false)
        // Reset progress after a delay to allow the progress bar to complete visually
        setTimeout(() => setFetchProgress(0), 500)
      }
    },
    [cryptoId, currency, timeRange, retryCount, isRetrying],
  )

  const calculatePriceStats = (data: ChartData[]) => {
    if (!data || data.length === 0) return

    try {
      const prices = data.map((d) => d.price).filter((price) => !isNaN(price) && isFinite(price))

      if (prices.length === 0) return

      const min = Math.min(...prices)
      const max = Math.max(...prices)
      const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length

      const firstPrice = data[0].price
      const lastPrice = data[data.length - 1].price
      const change = lastPrice - firstPrice
      const changePercent = (change / firstPrice) * 100

      setPriceStats({
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 0,
        avg: isFinite(avg) ? avg : 0,
        change: isFinite(change) ? change : 0,
        changePercent: isFinite(changePercent) ? changePercent : 0,
      })
    } catch (err) {
      console.error("Error calculating price stats:", err)
      setPriceStats({ min: 0, max: 0, avg: 0, change: 0, changePercent: 0 })
    }
  }

  useEffect(() => {
    fetchChartData()
  }, [fetchChartData])

  // Add a helper function to format dates based on time range
  function formatDate(date: Date, range: string): string {
    try {
      if (range === "1") {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      } else if (range === "7") {
        return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
      } else if (range === "30" || range === "90") {
        return date.toLocaleDateString([], { month: "short", day: "numeric" })
      } else {
        // For 365 days
        return date.toLocaleDateString([], { month: "short", year: "numeric" })
      }
    } catch (err) {
      console.error("Error formatting date:", err)
      return date.toISOString()
    }
  }

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3))
  }

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 1))
  }

  // Get visible data based on zoom level
  const getVisibleData = () => {
    if (zoomLevel === 1 || !chartData || chartData.length === 0) return chartData

    try {
      const dataLength = chartData.length
      const visibleLength = Math.floor(dataLength / zoomLevel)
      const startIndex = Math.floor((dataLength - visibleLength) / 2)

      return chartData.slice(startIndex, startIndex + visibleLength)
    } catch (err) {
      console.error("Error calculating visible data:", err)
      return chartData
    }
  }

  const visibleData = getVisibleData()
  const hasData = chartData && chartData.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs defaultValue={timeRange} onValueChange={setTimeRange} value={timeRange}>
          <TabsList>
            <TabsTrigger value="1">24h</TabsTrigger>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
            <TabsTrigger value="365">1y</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">Updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchChartData(true)}
            title="Refresh chart data"
            disabled={loading || isRetrying}
          >
            <RefreshCw className={`h-4 w-4 ${loading || isRetrying ? "animate-spin" : ""}`} />
            <span className="sr-only">Refresh chart data</span>
          </Button>
        </div>
      </div>

      {fetchProgress > 0 && fetchProgress < 100 && (
        <div className="w-full">
          <Progress value={fetchProgress} className="h-1" />
          <p className="text-xs text-muted-foreground text-center mt-1">Loading chart data...</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="bg-destructive/10 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error loading chart data</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChartData(true)}
              disabled={loading || isRetrying}
              className="self-start"
            >
              {isRetrying ? "Retrying..." : "Try Again"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-3">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handleZoomIn} disabled={zoomLevel >= 3 || !hasData}>
                  <ZoomIn className="h-4 w-4" />
                  <span className="sr-only">Zoom in</span>
                </Button>
                <Button variant="outline" size="icon" onClick={handleZoomOut} disabled={zoomLevel <= 1 || !hasData}>
                  <ZoomOut className="h-4 w-4" />
                  <span className="sr-only">Zoom out</span>
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-volume"
                    checked={showVolume}
                    onCheckedChange={(checked) => setShowVolume(checked === true)}
                    disabled={!hasData}
                  />
                  <Label htmlFor="show-volume" className="text-sm">
                    Volume
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-market-cap"
                    checked={showMarketCap}
                    onCheckedChange={(checked) => setShowMarketCap(checked === true)}
                    disabled={!hasData}
                  />
                  <Label htmlFor="show-market-cap" className="text-sm">
                    Market Cap
                  </Label>
                </div>
              </div>
            </div>
            <div ref={chartContainerRef} className="h-[300px]">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : hasData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={visibleData}
                    margin={{
                      top: 10,
                      right: 30,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMarketCap" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffc658" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#ffc658" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                      // Use timestamp for sorting to ensure correct order
                      tickFormatter={(_, index) => visibleData[index]?.date || ""}
                    />
                    <YAxis
                      dataKey="price"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      tickFormatter={(value) => {
                        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
                        return value.toFixed(1)
                      }}
                    />
                    {showVolume && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        dataKey="volume"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => {
                          if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
                          if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
                          if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
                          return value.toFixed(0)
                        }}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-lg border bg-background p-2 shadow-md">
                              <div className="mb-2 font-medium">{label}</div>
                              <div className="grid gap-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full bg-[#8884d8]" />
                                  <span>Price: {formatters.currency(payload[0].value as number, currency)}</span>
                                </div>
                                {showVolume && payload[1] && (
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#82ca9d]" />
                                    <span>Volume: {formatters.currency(payload[1].value as number, currency)}</span>
                                  </div>
                                )}
                                {showMarketCap && payload[showVolume ? 2 : 1] && (
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#ffc658]" />
                                    <span>
                                      Market Cap:{" "}
                                      {formatters.currency(payload[showVolume ? 2 : 1].value as number, currency)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <ReferenceLine
                      y={priceStats.avg}
                      stroke="#ff7300"
                      strokeDasharray="3 3"
                      label={{ value: "Avg", position: "insideBottomRight" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#8884d8"
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                      isAnimationActive={true}
                      animationDuration={1000}
                    />
                    {showVolume && (
                      <Area
                        type="monotone"
                        dataKey="volume"
                        stroke="#82ca9d"
                        fillOpacity={0.3}
                        fill="url(#colorVolume)"
                        yAxisId="right"
                      />
                    )}
                    {showMarketCap && (
                      <Area
                        type="monotone"
                        dataKey="market_cap"
                        stroke="#ffc658"
                        fillOpacity={0.3}
                        fill="url(#colorMarketCap)"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <Info className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground text-center">No chart data available</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchChartData(true)}
                    disabled={loading || isRetrying}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price Statistics</CardTitle>
            <CardDescription>
              {timeRange === "1"
                ? "24h"
                : timeRange === "7"
                  ? "7d"
                  : timeRange === "30"
                    ? "30d"
                    : timeRange === "90"
                      ? "90d"
                      : "1y"}{" "}
              price data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Low</span>
                  <span className="font-medium">{formatters.currency(priceStats.min, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">High</span>
                  <span className="font-medium">{formatters.currency(priceStats.max, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Average</span>
                  <span className="font-medium">{formatters.currency(priceStats.avg, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Change</span>
                  <span
                    className={`font-medium ${
                      priceStats.change > 0 ? "text-green-500" : priceStats.change < 0 ? "text-red-500" : ""
                    }`}
                  >
                    {formatters.currency(priceStats.change, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Change %</span>
                  <span
                    className={`font-medium ${
                      priceStats.changePercent > 0
                        ? "text-green-500"
                        : priceStats.changePercent < 0
                          ? "text-red-500"
                          : ""
                    }`}
                  >
                    {formatters.percentage(priceStats.changePercent)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-muted-foreground">
                <p>No statistics available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
