import { DEEP_SEARCH_PORT } from '../shared/messages'
import { requestOrigins } from '../shared/deep/permissions'
import { requiredOrigins } from '../shared/deep/orchestrator'
import { SOURCES } from '../shared/deep/registry'
import type { DeepSearchEvent, DeepSearchRequest } from '../shared/messages'
import type { ProductSeed } from '../shared/deep/source'

export interface DeepSearchHandle {
  cancel: () => void
}

export interface DeepSearchCallbacks {
  onEvent: (event: DeepSearchEvent) => void
  /** Called when the user declined the permission prompt. */
  onDenied: () => void
}

/**
 * Start a wider search.
 *
 * **Call this synchronously from the click handler.** `chrome.permissions.request()`
 * needs a user gesture, and awaiting anything first loses it — which is why the origins
 * are computed up front rather than fetched.
 *
 * Refusal is a normal outcome: nothing is torn down, the passive verdict stays on
 * screen, and the button remains available for next time.
 */
export function startDeepSearch(
  seed: ProductSeed,
  { onEvent, onDenied }: DeepSearchCallbacks
): DeepSearchHandle {
  const origins = requiredOrigins(SOURCES, seed)
  let port: chrome.runtime.Port | null = null
  let cancelled = false

  void requestOrigins(origins).then((granted) => {
    if (cancelled) return
    if (!granted) {
      onDenied()
      return
    }

    port = chrome.runtime.connect({ name: DEEP_SEARCH_PORT })
    port.onMessage.addListener((event: DeepSearchEvent) => onEvent(event))
    port.onDisconnect.addListener(() => {
      port = null
    })
    const start: DeepSearchRequest = { type: 'start', seed }
    port.postMessage(start)
  })

  return {
    cancel: () => {
      cancelled = true
      if (!port) return
      const cancel: DeepSearchRequest = { type: 'cancel' }
      try {
        port.postMessage(cancel)
        port.disconnect()
      } catch {
        // Already gone.
      }
      port = null
    },
  }
}

/** Seed built from what the page already told us. Identifiers only. */
export function seedFrom(
  productKey: { marketplace: ProductSeed['marketplace']; asin: string; gtin?: string },
  identity: {
    brand: string | null
    manufacturer: string | null
    model: string | null
    title: string | null
  }
): ProductSeed {
  return {
    marketplace: productKey.marketplace,
    asin: productKey.asin,
    ...(productKey.gtin ? { gtin: productKey.gtin } : {}),
    ...(identity.brand ? { brand: identity.brand } : {}),
    ...(identity.manufacturer ? { manufacturer: identity.manufacturer } : {}),
    ...(identity.model ? { model: identity.model } : {}),
    ...(identity.title ? { title: identity.title } : {}),
  }
}
