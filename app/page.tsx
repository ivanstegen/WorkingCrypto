"use client"

import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { CryptoList } from "@/components/crypto-list"
import { SearchBar } from "@/components/search-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useFavorites } from "@/components/favorites-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { ApiSourceIndicator } from "@/components/api-source-indicator"
import { setupApiStatusReset } from "@/lib/api-client"
import { useDataRefresh } from "@/hooks/useDataRefresh"

type ActiveTab = "all" | "favorites"

const STORAGE_KEYS = {
  ACTIVE_TAB: "active-tab",
} as const

const DEFAULT_TAB: ActiveTab = "all"

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) as ActiveTab) || DEFAULT_TAB
    }
    return DEFAULT_TAB
  })

  const { favorites } = useFavorites()
  const { refreshData } = useDataRefresh()

  // Initialize API status reset
  useEffect(() => {
    setupApiStatusReset(15) // Reset every 15 minutes
  }, [])

  // Save active tab to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, activeTab)
  }, [activeTab])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-primary"
              aria-hidden="true"
            >
              <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727" />
            </svg>
            <span className="font-bold">CryptoTracker</span>
          </Link>
          <div className="flex items-center gap-4">
            <ApiSourceIndicator showControls={true} />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <section className="container py-6 md:py-10">
          <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Cryptocurrency Tracker</h1>
              <p className="text-muted-foreground">
                Track real-time prices, market cap, and trading volume for top cryptocurrencies
              </p>
            </div>
            <div className="flex w-full items-center gap-2 md:w-auto">
              <SearchBar />
              <Button
                variant="outline"
                size="icon"
                onClick={() => refreshData()}
                title="Refresh data"
                aria-label="Refresh cryptocurrency data"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Tabs defaultValue={DEFAULT_TAB} value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="mt-6">
            <TabsList>
              <TabsTrigger value="all">All Cryptocurrencies</TabsTrigger>
              <TabsTrigger value="favorites" disabled={favorites.length === 0}>
                Favorites {favorites.length > 0 && `(${favorites.length})`}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <ErrorBoundary>
                <CryptoList />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="favorites">
              <ErrorBoundary>
                <CryptoList filterFavorites={true} />
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </section>
      </main>
      <footer className="border-t py-6 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} CryptoTracker. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Powered by multiple cryptocurrency APIs with automatic fallback
          </p>
        </div>
      </footer>
    </div>
  )
}
