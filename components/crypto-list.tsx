"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpDown, ChevronDown, ChevronUp, Loader2, Star, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { CurrencyToggle } from "@/components/currency-toggle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { useFavorites } from "@/components/favorites-provider"
import { toast } from "@/components/ui/use-toast"
import { Progress } from "@/components/ui/progress"
import { getCryptoList, formatErrorMessage, formatters, getCurrentApiSource } from "@/lib/api-utils"
import { ApiSourceIndicator } from "@/components/api-source-indicator"

interface CryptoListProps {
  filterFavorites?: boolean
}

export function CryptoList({ filterFavorites = false }: CryptoListProps) {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""
  const [cryptos, setCryptos] = useState<any[]>([])
  const [allCryptos, setAllCryptos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("preferred-currency") || "usd"
    }
    return "usd"
  })
  const [sortBy, setSortBy] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sort-by") || "market_cap_rank"
    }
    return "market_cap_rank"
  })
  const [sortDirection, setSortDirection] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sort-direction") || "asc"
    }
    return "asc"
  })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [perPage, setPerPage] = useState(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("per-page")) || 25
    }
    return 25
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  const { favorites, toggleFavorite, isFavorite } = useFavorites()
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [dataSource, setDataSource] = useState(getCurrentApiSource())
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const maxRetries = 3

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem("preferred-currency", currency)
    localStorage.setItem("sort-by", sortBy)
    localStorage.setItem("sort-direction", sortDirection)
    localStorage.setItem("per-page", String(perPage))
  }, [currency, sortBy, sortDirection, perPage])

  // Reset to page 1 when perPage changes
  useEffect(() => {
    setCurrentPage(1)
  }, [perPage])

  // Update data source when it changes
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const newSource = getCurrentApiSource()
      if (dataSource !== newSource) {
        setDataSource(newSource)
      }
    }, 1000)

    return () => clearInterval(checkInterval)
  }, [dataSource])

  // Add a refresh function
  const refreshData = useCallback(async () => {
    setIsRefreshing(true)
    await fetchCryptos(true)
    setIsRefreshing(false)
  }, [currency])

  // Handle favorite toggle with toast notification
  const handleToggleFavorite = (id: string, name: string) => {
    toggleFavorite(id)
    toast({
      title: isFavorite(id) ? "Removed from favorites" : "Added to favorites",
      description: isFavorite(id)
        ? `${name} has been removed from your favorites`
        : `${name} has been added to your favorites`,
      duration: 3000,
    })
  }

  // Add the fetchCryptos function as a named function that can be called elsewhere
  const fetchCryptos = useCallback(
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

        const data = await getCryptoList(currency, forceRefresh)
        setDataSource(getCurrentApiSource())

        // Store the last fetch time
        sessionStorage.setItem("last-fetch-time", Date.now().toString())

        // Set all cryptos
        setAllCryptos(Array.isArray(data) ? data : [])
        setLastUpdated(new Date())
        setRetryCount(0)
        setIsRetrying(false)
        setLoadingProgress(100)

        clearInterval(progressInterval)
        return data
      } catch (err) {
        console.error("Error fetching crypto list:", err)
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
            fetchCryptos(true)
          }, delay)
        }
        return []
      } finally {
        setLoading(false)
        // Reset progress after a delay to allow the progress bar to complete visually
        setTimeout(() => setLoadingProgress(0), 500)
      }
    },
    [currency, retryCount, isRetrying],
  )

  // Process and sort data
  useEffect(() => {
    if (allCryptos.length === 0) return

    // Filter by search query and favorites
    let filtered = [...allCryptos]

    // Filter by favorites if enabled
    if (filterFavorites) {
      filtered = filtered.filter((crypto) => isFavorite(crypto.id))
    }

    // Filter by search query
    if (query) {
      filtered = filtered.filter(
        (crypto) =>
          crypto.name.toLowerCase().includes(query.toLowerCase()) ||
          crypto.symbol.toLowerCase().includes(query.toLowerCase()),
      )
    }

    // Sort data
    filtered.sort((a, b) => {
      let valueA, valueB

      switch (sortBy) {
        case "name":
          valueA = a.name.toLowerCase()
          valueB = b.name.toLowerCase()
          return sortDirection === "asc" ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA)
        case "price_change_percentage_24h":
          valueA = a.price_change_percentage_24h || 0
          valueB = b.price_change_percentage_24h || 0
          break
        case "current_price":
          valueA = a.current_price || 0
          valueB = b.current_price || 0
          break
        case "market_cap":
          valueA = a.market_cap || 0
          valueB = b.market_cap || 0
          break
        case "total_volume":
          valueA = a.total_volume || 0
          valueB = b.total_volume || 0
          break
        case "market_cap_rank":
        default:
          valueA = a.market_cap_rank || 999
          valueB = b.market_cap_rank || 999
          break
      }

      // For numerical values
      if (typeof valueA === "number" && typeof valueB === "number") {
        return sortDirection === "asc" ? valueA - valueB : valueB - valueA
      }

      // Default case (should not reach here)
      return 0
    })

    // Calculate pagination
    const total = Math.ceil(filtered.length / perPage)
    setTotalPages(total)

    // Get current page data
    const startIndex = (currentPage - 1) * perPage
    const endIndex = startIndex + perPage
    setCryptos(filtered.slice(startIndex, endIndex))
  }, [allCryptos, query, sortBy, sortDirection, currentPage, perPage, filterFavorites, favorites, isFavorite])

  // Initial data fetch
  useEffect(() => {
    fetchCryptos()
  }, [fetchCryptos])

  // Add window focus event listener to refresh data when tab becomes active
  useEffect(() => {
    const handleFocus = () => {
      const lastFetch = sessionStorage.getItem("last-fetch-time")
      if (lastFetch && Date.now() - Number.parseInt(lastFetch) > 5 * 60 * 1000) {
        refreshData()
      }
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [refreshData])

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortBy(column)
      // Set default direction based on column
      if (column === "name") {
        setSortDirection("asc")
      } else if (column === "market_cap_rank") {
        setSortDirection("asc")
      } else {
        setSortDirection("desc")
      }
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of table
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />
    return sortDirection === "asc" ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
              {isRefreshing && (
                <span className="ml-2 inline-flex items-center">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Refreshing...
                </span>
              )}
              <ApiSourceIndicator className="ml-2" />
            </p>
          )}
          {!loading && !error && (
            <p className="text-xs text-muted-foreground">
              Showing {cryptos.length} of {filterFavorites ? favorites.length : allCryptos.length} cryptocurrencies
              {query && ` matching "${query}"`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={perPage.toString()} onValueChange={(value) => setPerPage(Number(value))}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder="25" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <CurrencyToggle currency={currency} setCurrency={setCurrency} />
        </div>
      </div>

      {loadingProgress > 0 && loadingProgress < 100 && (
        <div className="w-full">
          <Progress value={loadingProgress} className="h-1" />
          <p className="text-xs text-muted-foreground text-center mt-1">Loading cryptocurrency data...</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="bg-destructive/10 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error loading data</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={refreshData} disabled={isRefreshing} className="self-start">
              {isRefreshing ? "Refreshing..." : "Try Again"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {dataSource === "mock" && !error && (
        <Alert className="bg-amber-100 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          <AlertTitle className="text-amber-800 dark:text-amber-500">Using Demo Data</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            We're currently displaying demo data because all cryptocurrency APIs are unavailable. This data is for
            demonstration purposes only and may not reflect current market values.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" ref={tableRef}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("market_cap_rank")}
                      className="flex items-center justify-start p-0 font-medium"
                    >
                      #{getSortIcon("market_cap_rank")}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("name")}
                      className="flex items-center justify-start p-0 font-medium"
                    >
                      Name
                      {getSortIcon("name")}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("current_price")}
                      className="flex items-center justify-end p-0 font-medium ml-auto"
                    >
                      Price
                      {getSortIcon("current_price")}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("price_change_percentage_24h")}
                      className="flex items-center justify-end p-0 font-medium ml-auto"
                    >
                      24h %{getSortIcon("price_change_percentage_24h")}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("market_cap")}
                      className="flex items-center justify-end p-0 font-medium ml-auto"
                    >
                      Market Cap
                      {getSortIcon("market_cap")}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("total_volume")}
                      className="flex items-center justify-end p-0 font-medium ml-auto"
                    >
                      Volume (24h)
                      {getSortIcon("total_volume")}
                    </Button>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: perPage }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Skeleton className="h-4 w-8" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-12" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-16" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : cryptos.length > 0 ? (
                  cryptos.map((crypto) => (
                    <TableRow key={crypto.id} className="group">
                      <TableCell>{crypto.market_cap_rank || "-"}</TableCell>
                      <TableCell>
                        <Link
                          href={`/crypto/${crypto.id}`}
                          className="flex items-center gap-2 hover:underline group-hover:text-primary"
                        >
                          <Image
                            src={crypto.image || "/placeholder.svg?height=24&width=24"}
                            alt={crypto.name}
                            width={24}
                            height={24}
                            className="rounded-full"
                          />
                          <div>
                            <div className="font-medium">{crypto.name}</div>
                            <div className="text-xs text-muted-foreground uppercase">{crypto.symbol}</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatters.currency(crypto.current_price, currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          crypto.price_change_percentage_24h > 0
                            ? "text-green-500"
                            : crypto.price_change_percentage_24h < 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        <div className="flex items-center justify-end">
                          {crypto.price_change_percentage_24h > 0 ? (
                            <ChevronUp className="mr-1 h-4 w-4" />
                          ) : crypto.price_change_percentage_24h < 0 ? (
                            <ChevronDown className="mr-1 h-4 w-4" />
                          ) : null}
                          {formatters.percentage(crypto.price_change_percentage_24h)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {crypto.market_cap !== undefined && crypto.market_cap !== null
                          ? formatters.currency(crypto.market_cap, currency, { maximumFractionDigits: 0 })
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        {crypto.total_volume !== undefined && crypto.total_volume !== null
                          ? formatters.currency(crypto.total_volume, currency, { maximumFractionDigits: 0 })
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-yellow-400"
                          onClick={() => handleToggleFavorite(crypto.id, crypto.name)}
                          title={isFavorite(crypto.id) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Star className={`h-4 w-4 ${isFavorite(crypto.id) ? "fill-yellow-400" : ""}`} />
                          <span className="sr-only">
                            {isFavorite(crypto.id) ? "Remove from favorites" : "Add to favorites"}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      {filterFavorites && favorites.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <p>You haven't added any cryptocurrencies to your favorites yet.</p>
                          <p className="text-sm text-muted-foreground">
                            Click the star icon next to any cryptocurrency to add it to your favorites.
                          </p>
                        </div>
                      ) : (
                        <p>No cryptocurrencies found matching &quot;{query}&quot;</p>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination className="mt-4">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Calculate which page numbers to show
              let pageNum
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }

              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink onClick={() => handlePageChange(pageNum)} isActive={currentPage === pageNum}>
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              )
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
