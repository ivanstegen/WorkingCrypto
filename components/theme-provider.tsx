"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

type Theme = "light" | "dark" | "system"

interface ExtendedThemeProviderProps extends Omit<ThemeProviderProps, "attribute" | "defaultTheme" | "themes"> {
  children: React.ReactNode
}

export function ThemeProvider({ children, ...props }: ExtendedThemeProviderProps) {
  const [mounted, setMounted] = React.useState(false)

  // useEffect only runs on the client, so now we can safely show the UI
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent theme flash on initial load
  if (!mounted) {
    return (
      <div style={{ visibility: "hidden" }} aria-hidden="true">
        {children}
      </div>
    )
  }

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={["light", "dark", "system"]}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

interface ThemeState {
  theme: Theme | undefined
  setTheme: (theme: Theme) => void
  mounted: boolean
}

// Hook to safely access theme
export function useTheme(): ThemeState {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme } = useNextTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return {
    theme: mounted ? (theme as Theme) : undefined,
    setTheme: (newTheme: Theme) => {
      if (mounted) {
        setTheme(newTheme)
      }
    },
    mounted,
  }
}
