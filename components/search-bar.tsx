"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Search, X, Loader2 } from "lucide-react"
import Image from "next/image"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useFavorites } from "@/components/favorites-provider"
import { getCachedSuggestions, cacheSuggestions, SearchSuggestion } from "@/lib/search-utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

interface Cryptocurrency {
  id: string
  symbol: string
  name: string
  image: string
  market_cap_rank?: number
}

export function SearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [recentSearches, setRecentSearches] = useState<Cryptocurrency[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { favorites, isFavorite } = useFavorites()

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Load recent searches from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("recent-searches")
        if (stored) {
          const parsed = JSON.parse(stored)
          setRecentSearches(Array.isArray(parsed) ? parsed.slice(0, 5) : [])
        }
      } catch (error) {
        console.error("Error loading recent searches:", error)
      }
    }
  }, [])

  // Save recent searches to localStorage
  const saveRecentSearch = useCallback(
    (crypto: Cryptocurrency) => {
      const updated = [crypto, ...recentSearches.filter((item) => item.id !== crypto.id)].slice(0, 5)
      setRecentSearches(updated)
      localStorage.setItem("recent-searches", JSON.stringify(updated))
    },
    [recentSearches],
  )

  // Update query when URL changes
  useEffect(() => {
    setSearchQuery(searchParams.get("q") || "")
  }, [searchParams])

  // Fetch search suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!searchQuery.trim()) {
        setSuggestions([])
        return
      }

      // Check cache first
      const cachedSuggestions = getCachedSuggestions(searchQuery)
      if (cachedSuggestions) {
        setSuggestions(cachedSuggestions)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(
            searchQuery,
          )}`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        )

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`)
        }

        const data = await response.json()
        const newSuggestions = data.coins.map((coin: any) => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          thumb: coin.thumb,
        }))

        // Cache the suggestions
        cacheSuggestions(searchQuery, newSuggestions)

        setSuggestions(newSuggestions)
      } catch (err) {
        console.error("Error fetching suggestions:", err)
        setError("Failed to fetch suggestions. Please try again.")
        setSuggestions([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchSuggestions()
  }, [searchQuery])

  // Update URL when search query changes
  useEffect(() => {
    if (pathname !== "/") return

    if (searchQuery) {
      router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`)
    } else if (searchParams.has("q")) {
      router.push("/")
    }
  }, [searchQuery, pathname, router, searchParams])

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`)
      setOpen(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setSuggestions([])
    setOpen(false)
    if (pathname === "/") {
      router.replace("/")
    }
    inputRef.current?.focus()
  }

  const handleSelect = (suggestion: SearchSuggestion) => {
    const crypto = {
      id: suggestion.id,
      name: suggestion.name,
      symbol: suggestion.symbol,
      image: suggestion.image || suggestion.thumb || "/placeholder.svg"
    }
    
    saveRecentSearch(crypto)
    router.push(`/crypto/${crypto.id}`)
  }

  return (
    <div ref={containerRef} className="relative w-full md:w-80">
      <div className="relative">
        <Input
          ref={inputRef}
          placeholder="Search cryptocurrencies..."
          className="pr-16"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            if (e.target.value.length >= 2) {
              setOpen(true)
            } else {
              setOpen(false)
            }
          }}
          onKeyDown={handleSearch}
          onFocus={() => {
            if ((searchQuery.length >= 2 && suggestions.length > 0) || recentSearches.length > 0) {
              setOpen(true)
            }
          }}
        />
        {isLoading && (
          <div className="absolute right-16 top-0 flex h-10 w-10 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="absolute right-0 top-0 flex h-10">
          {searchQuery && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
          <Button 
            type="button" 
            size="icon" 
            variant="ghost" 
            className="h-10 w-10"
            onClick={() => inputRef.current?.focus()}
          >
            <Search className="h-4 w-4" />
            <span className="sr-only">Search</span>
          </Button>
        </div>
      </div>
      {(open && (suggestions.length > 0 || recentSearches.length > 0 || favorites.length > 0)) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <ScrollArea className="h-[300px]">
            <Command>
              <CommandList>
                <CommandEmpty>No results found</CommandEmpty>
                {suggestions.length > 0 && (
                  <CommandGroup heading="Search Results">
                    {suggestions.map((crypto) => (
                      <CommandItem
                        key={crypto.id}
                        value={crypto.id}
                        onSelect={() => handleSelect(crypto)}
                        className="flex items-center gap-2 px-4 py-2"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Image
                            src={crypto.image || "/placeholder.svg"}
                            alt={crypto.name}
                            width={24}
                            height={24}
                            className="rounded-full"
                          />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{crypto.name}</span>
                              {isFavorite(crypto.id) && <span className="text-xs text-yellow-500">★ Favorite</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground uppercase">{crypto.symbol}</span>
                            </div>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {recentSearches.length > 0 && !searchQuery && (
                  <CommandGroup heading="Recent Searches">
                    {recentSearches.map((crypto) => (
                      <CommandItem
                        key={crypto.id}
                        value={`recent-${crypto.id}`}
                        onSelect={() => handleSelect(crypto)}
                        className="flex items-center gap-2 px-4 py-2"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Image
                            src={crypto.image || "/placeholder.svg"}
                            alt={crypto.name}
                            width={24}
                            height={24}
                            className="rounded-full"
                          />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{crypto.name}</span>
                              {isFavorite(crypto.id) && <span className="text-xs text-yellow-500">★ Favorite</span>}
                            </div>
                            <span className="text-xs text-muted-foreground uppercase">{crypto.symbol}</span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {favorites.length > 0 && !searchQuery && (
                  <CommandGroup heading="Your Favorites">
                    {favorites.slice(0, 5).map((id) => {
                      const crypto = recentSearches.find((c) => c.id === id)
                      if (!crypto) return null
                      return (
                        <CommandItem
                          key={`fav-${id}`}
                          value={`favorite-${id}`}
                          onSelect={() => handleSelect(crypto)}
                          className="flex items-center gap-2 px-4 py-2"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <Image
                              src={crypto.image || "/placeholder.svg"}
                              alt={crypto.name}
                              width={24}
                              height={24}
                              className="rounded-full"
                            />
                            <span className="font-medium">{crypto.name}</span>
                            <span className="text-xs text-muted-foreground uppercase">{crypto.symbol}</span>
                          </div>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
