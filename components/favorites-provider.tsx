"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

type FavoritesContextType = {
  favorites: string[]
  addFavorite: (id: string) => void
  removeFavorite: (id: string) => void
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Load favorites from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storedFavorites = JSON.parse(localStorage.getItem("crypto-favorites") || "[]")
        setFavorites(Array.isArray(storedFavorites) ? storedFavorites : [])
      } catch (error) {
        console.error("Error loading favorites:", error)
        setFavorites([])
      }
      setIsInitialized(true)
    }
  }, [])

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    if (isInitialized && typeof window !== "undefined") {
      localStorage.setItem("crypto-favorites", JSON.stringify(favorites))
    }
  }, [favorites, isInitialized])

  const addFavorite = (id: string) => {
    if (!favorites.includes(id)) {
      setFavorites((prev) => [...prev, id])
    }
  }

  const removeFavorite = (id: string) => {
    setFavorites((prev) => prev.filter((favId) => favId !== id))
  }

  const toggleFavorite = (id: string) => {
    if (favorites.includes(id)) {
      removeFavorite(id)
    } else {
      addFavorite(id)
    }
  }

  const isFavorite = (id: string) => {
    return favorites.includes(id)
  }

  return (
    <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (context === undefined) {
    throw new Error("useFavorites must be used within a FavoritesProvider")
  }
  return context
}
