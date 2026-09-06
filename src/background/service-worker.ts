import { DEEP_SEARCH_PORT } from '../shared/messages'
import { OriginCache } from '../shared/cache'
import { SOURCES } from '../shared/deep/registry'
import { aggregate } from '../shared/origin'
import { evidenceFrom, runDeepSearch } from '../shared/deep/orchestrator'
import type { DeepSearchEvent, DeepSearchRequest } from '../shared/messages'
import type { ProductSeed } from '../shared/deep/source'

/**
 * Service worker.
 *
 * The wider search runs **here**, not in the content script, because a fetch from a
 * content script is subject to the page's CORS rules while one from the extension's own
 * context is governed by its host permissions. That is the entire reason for the
 * message-passing hop.
 */

async function search(
  seed: ProductSeed,
  send: (event: DeepSearchEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const applicable = SOURCES.filter((source) => {
    try {
      return source.applies(seed)
    } catch {
      return false
    }
  })

  send({ type: 'started', sourceIds: applicable.map((s) => s.id) })

  const outcomes = await runDeepSearch(applicable, seed, {
    signal,
    onOutcome: (outcome) => send({ type: 'outcome', outcome }),
  })

  const cache = new OriginCache()
  const productKey = {
    marketplace: seed.marketplace,
    asin: seed.asin,
    ...(seed.gtin ? { gtin: seed.gtin } : {}),
  }

  // Merged with what the page already told us, so the panel shows one verdict rather
  // than two competing ones.
  const existing = (await cache.get(productKey))?.evidence ?? []
  const verdict = aggregate({
    productKey,
    evidence: [...existing, ...evidenceFrom(outcomes)],
    searchedDeep: true,
  })

  // Persisted under the GTIN where there is one, so the result is reused on every
  // marketplace sharing that barcode rather than being searched for again.
  await cache.put(productKey, verdict)

  send({ type: 'done', verdict })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== DEEP_SEARCH_PORT) return

  const controller = new AbortController()
  let closed = false

  const send = (event: DeepSearchEvent) => {
    if (closed) return
    try {
      port.postMessage(event)
    } catch {
      // The panel closed mid-search. Nothing to report to.
      closed = true
      controller.abort()
    }
  }

  port.onDisconnect.addListener(() => {
    closed = true
    controller.abort()
  })

  port.onMessage.addListener((message: DeepSearchRequest) => {
    if (message.type === 'cancel') {
      controller.abort()
      return
    }
    if (message.type !== 'start') return

    void search(message.seed, send, controller.signal).catch((error: unknown) => {
      send({ type: 'error', reason: error instanceof Error ? error.message : String(error) })
    })
  })
})

console.info('[country-made-in] service worker started')

export {}
