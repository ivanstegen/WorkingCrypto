import type React from "react"
import "@/app/globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { FavoritesProvider } from "@/components/favorites-provider"
import { Toaster } from "@/components/ui/toaster"
import { initializeApiServices } from "@/lib/api-init"
import { Metadata, Viewport } from 'next'

const inter = Inter({ subsets: ["latin"] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL('https://cryptotracker.com'),
  title: {
    default: "CryptoTracker - Real-time Cryptocurrency Prices",
    template: "%s | CryptoTracker"
  },
  description: "Track real-time prices, market cap, and trading volume for top cryptocurrencies",
  keywords: ["cryptocurrency", "bitcoin", "ethereum", "crypto prices", "market cap", "trading volume"],
  authors: [{ name: "CryptoTracker" }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'CryptoTracker - Real-time Cryptocurrency Prices',
    description: 'Track real-time prices, market cap, and trading volume for top cryptocurrencies',
    siteName: 'CryptoTracker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CryptoTracker - Real-time Cryptocurrency Prices',
    description: 'Track real-time prices, market cap, and trading volume for top cryptocurrencies',
  },
  robots: {
    index: true,
    follow: true,
  },
}

// Initialize API services on the client side
if (typeof window !== "undefined") {
  initializeApiServices()
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <FavoritesProvider>
            {children}
            <Toaster />
          </FavoritesProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
