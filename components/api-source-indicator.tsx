"use client"

import { useState, useEffect } from "react"
import { Database, Server, CloudOff, RefreshCw, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { apiStatus, getCurrentApiSource } from "@/lib/api-utils"

interface ApiSourceIndicatorProps {
  className?: string
  showControls?: boolean
}

export function ApiSourceIndicator({ className = "", showControls = false }: ApiSourceIndicatorProps) {
  const [currentSource, setCurrentSource] = useState<string>(getCurrentApiSource())
  const [isResetting, setIsResetting] = useState(false)

  // Update current source when it changes
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const newSource = getCurrentApiSource()
      if (currentSource !== newSource) {
        setCurrentSource(newSource)
      }
    }, 1000)

    return () => clearInterval(checkInterval)
  }, [currentSource])

  // Get data source icon and color
  const getDataSourceInfo = () => {
    switch (currentSource) {
      case "primary":
        return {
          icon: <Database className="h-4 w-4" />,
          label: "CoinGecko",
          color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        }
      case "secondary":
        return {
          icon: <Server className="h-4 w-4" />,
          label: "CoinCap",
          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        }
      case "tertiary":
        return {
          icon: <Server className="h-4 w-4" />,
          label: "CryptoCompare",
          color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        }
      case "quaternary":
        return {
          icon: <Server className="h-4 w-4" />,
          label: "Binance",
          color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
        }
      case "mock":
        return {
          icon: <CloudOff className="h-4 w-4" />,
          label: "Mock Data",
          color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        }
      default:
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          label: "Unknown",
          color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
        }
    }
  }

  const handleReset = () => {
    setIsResetting(true)
    apiStatus.resetStatuses()
    setTimeout(() => {
      setCurrentSource(getCurrentApiSource())
      setIsResetting(false)
    }, 1000)
  }

  const handleSelectSource = (source: string) => {
    // Only allow selecting operational APIs
    if (
      (source === "primary" && apiStatus.primary.operational) ||
      (source === "secondary" && apiStatus.secondary.operational) ||
      (source === "tertiary" && apiStatus.tertiary.operational) ||
      (source === "quaternary" && apiStatus.quaternary.operational) ||
      source === "mock"
    ) {
      apiStatus.currentSource = source as any
      setCurrentSource(source)
    }
  }

  const sourceInfo = getDataSourceInfo()

  if (!showControls) {
    return (
      <Badge variant="outline" className={`${sourceInfo.color} ${className}`}>
        <span className="flex items-center gap-1">
          {sourceInfo.icon}
          {sourceInfo.label}
        </span>
      </Badge>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={sourceInfo.color}>
                  <span className="flex items-center gap-1">
                    {sourceInfo.icon}
                    <span className="hidden sm:inline">Data Source:</span> {sourceInfo.label}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Select Data Source</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleSelectSource("primary")}
                  disabled={!apiStatus.primary.operational}
                  className={currentSource === "primary" ? "bg-accent" : ""}
                >
                  <Database className="mr-2 h-4 w-4" />
                  CoinGecko
                  {!apiStatus.primary.operational && <span className="ml-2 text-xs text-red-500">(Unavailable)</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSelectSource("secondary")}
                  disabled={!apiStatus.secondary.operational}
                  className={currentSource === "secondary" ? "bg-accent" : ""}
                >
                  <Server className="mr-2 h-4 w-4" />
                  CoinCap
                  {!apiStatus.secondary.operational && <span className="ml-2 text-xs text-red-500">(Unavailable)</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSelectSource("tertiary")}
                  disabled={!apiStatus.tertiary.operational}
                  className={currentSource === "tertiary" ? "bg-accent" : ""}
                >
                  <Server className="mr-2 h-4 w-4" />
                  CryptoCompare
                  {!apiStatus.tertiary.operational && <span className="ml-2 text-xs text-red-500">(Unavailable)</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSelectSource("quaternary")}
                  disabled={!apiStatus.quaternary.operational}
                  className={currentSource === "quaternary" ? "bg-accent" : ""}
                >
                  <Server className="mr-2 h-4 w-4" />
                  Binance
                  {!apiStatus.quaternary.operational && (
                    <span className="ml-2 text-xs text-red-500">(Unavailable)</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSelectSource("mock")}
                  className={currentSource === "mock" ? "bg-accent" : ""}
                >
                  <CloudOff className="mr-2 h-4 w-4" />
                  Mock Data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipTrigger>
          <TooltipContent>
            <p>Current data source</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleReset} disabled={isResetting}>
              <RefreshCw className={`h-4 w-4 ${isResetting ? "animate-spin" : ""}`} />
              <span className="sr-only">Reset API status</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reset API status and check availability</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
