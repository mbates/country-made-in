import { DEEP_SEARCH_PORT } from '../shared/messages'
import type { DeepSearchEvent, DeepSearchRequest } from '../shared/messages'
import type { ProductSeed } from '../shared/deep/source'

export interface DeepSearchHandle {
  cancel: () => void
}

/**
 * Start a wider search.
 *
 * No permission request happens here, and none can: a content script cannot reach
 * `chrome.permissions` at all. The service worker checks whether the origins are already
 * granted and replies `needs-permission` if not; the grant itself is made from the
 * options page, which is the only context with both the API and a user gesture.
 */
export function startDeepSearch(
  seed: ProductSeed,
  onEvent: (event: DeepSearchEvent) => void
): DeepSearchHandle {
  let port: chrome.runtime.Port | null = chrome.runtime.connect({ name: DEEP_SEARCH_PORT })

  port.onMessage.addListener((event: DeepSearchEvent) => {
    onEvent(event)
    // Nothing more will arrive after a terminal event, so let the port go.
    if (event.type === 'done' || event.type === 'error' || event.type === 'needs-permission') {
      port?.disconnect()
      port = null
    }
  })
  port.onDisconnect.addListener(() => {
    port = null
  })

  const start: DeepSearchRequest = { type: 'start', seed }
  port.postMessage(start)

  return {
    cancel: () => {
      if (!port) return
      try {
        const cancel: DeepSearchRequest = { type: 'cancel' }
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
