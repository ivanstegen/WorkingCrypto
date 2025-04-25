import { setupApiStatusReset } from "./api-utils"
import { API_SOURCES, apiStatusTracker, setupApiStatusReset as setupNewApiStatusReset } from "./api-client"

/**
 * Initialize API services
 * This function should be called once when the application starts
 */
export function initializeApiServices() {
  // Set up periodic API status resets to recover from temporary outages
  setupApiStatusReset(15) // Check every 15 minutes
  setupNewApiStatusReset(15) // Also set up the new API client

  // Set up online/offline event listeners
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Check connection status immediately
    if (!navigator.onLine) {
      handleOffline()
    }
  }

  console.log("API services initialized")
}

/**
 * Handle browser coming online
 */
function handleOnline() {
  console.log("Browser is online. Resetting API statuses...")

  // Reset API statuses to try all APIs again
  apiStatusTracker.resetStatuses()

  // Clear API-related error messages
  const errorMessages = document.querySelectorAll('[data-error-type="api"]')
  errorMessages.forEach((el) => {
    el.classList.add("hidden")
  })

  // Show a notification that we're back online
  if (typeof window !== "undefined") {
    const event = new CustomEvent("app:online", { detail: { timestamp: Date.now() } })
    window.dispatchEvent(event)
  }
}

/**
 * Handle browser going offline
 */
function handleOffline() {
  console.log("Browser is offline. Switching to offline mode...")

  // Set all APIs as non-operational
  Object.keys(apiStatusTracker)
    .filter(
      (key) => key !== "currentSource" && typeof apiStatusTracker[key as keyof typeof apiStatusTracker] === "object",
    )
    .forEach((key) => {
      const apiKey = key as keyof typeof apiStatusTracker
      if (typeof apiStatusTracker[apiKey] === "object" && apiStatusTracker[apiKey] !== null) {
        // @ts-ignore - We know this is an object with an operational property
        apiStatusTracker[apiKey].operational = false
      }
    })

  // Set current source to mock
  apiStatusTracker.currentSource = API_SOURCES.MOCK

  // Show offline notification
  if (typeof window !== "undefined") {
    const event = new CustomEvent("app:offline", { detail: { timestamp: Date.now() } })
    window.dispatchEvent(event)
  }
}

// Initialize API services when this module is imported
if (typeof window !== "undefined") {
  // Only run in browser environment
  window.addEventListener("load", initializeApiServices)
}
