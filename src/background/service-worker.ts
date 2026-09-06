import { DEEP_SEARCH_PORT } from '../shared/messages'
import { OriginCache } from '../shared/cache'
import { SOURCES } from '../shared/deep/registry'
import { aggregate } from '../shared/origin'
import { evidenceFrom, requiredOrigins, runDeepSearch } from '../shared/deep/orchestrator'
import { hasOrigins } from '../shared/deep/permissions'
import type { DeepSearchEvent, DeepSearchRequest } from '../shared/messages'
import type { Evidence } from '../shared/origin'
import type { ProductSeed } from '../shared/deep/source'

/**
 * Service worker.
 *
 * The wider search runs **here**, not in the content script, because a fetch from a
 * content script is subject to the page's CORS rules while one from the extension's own
 * context is governed by its host permissions. That is the entire reason for the
 * message-passing hop.
 */

/**
 * A message from a content script is not trusted input.
 *
 * A content script shares a process with the page it runs in, so a compromised page can
 * reach this port. Everything it sends is validated before it can reach the cache — the
 * seed becomes a cache key and a GTIN index entry, and a malformed one would poison both.
 */
function parseRequest(message: unknown): DeepSearchRequest | null {
  if (typeof message !== 'object' || message === null) return null
  const { type } = message as { type?: unknown }
  if (type === 'cancel') return { type: 'cancel' }
  if (type !== 'start') return null

  const { seed } = message as { seed?: unknown }
  if (typeof seed !== 'object' || seed === null) return null

  const s = seed as Record<string, unknown>
  if (typeof s.marketplace !== 'string' || typeof s.asin !== 'string') return null
  if (!/^[A-Z0-9]{10}$/.test(s.asin)) return null
  if (s.gtin !== undefined && (typeof s.gtin !== 'string' || !/^\d{14}$/.test(s.gtin))) return null

  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value.slice(0, 200) : undefined

  return {
    type: 'start',
    seed: {
      marketplace: s.marketplace as ProductSeed['marketplace'],
      asin: s.asin,
      ...(s.gtin ? { gtin: s.gtin as string } : {}),
      ...(text(s.brand) ? { brand: text(s.brand) } : {}),
      ...(text(s.manufacturer) ? { manufacturer: text(s.manufacturer) } : {}),
      ...(text(s.model) ? { model: text(s.model) } : {}),
      ...(text(s.title) ? { title: text(s.title) } : {}),
    },
  }
}

/**
 * Identity of one piece of evidence, for deduplication.
 *
 * Re-running a search must not make an answer look better corroborated than it is.
 * `aggregate` weights by how many sources agree, so merging a stored verdict's evidence
 * with a fresh copy of the same evidence turns one source into two and promotes
 * `single-source` to `unanimous` — manufacturing exactly the confidence this project
 * exists to withhold.
 */
const evidenceKey = (item: Evidence): string =>
  [item.sourceId, item.kind, item.country?.code ?? '-', item.quote ?? '-', item.url ?? '-'].join(
    '|'
  )

function dedupe(evidence: readonly Evidence[]): Evidence[] {
  const seen = new Set<string>()
  const kept: Evidence[] = []
  for (const item of evidence) {
    const key = evidenceKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(item)
  }
  return kept
}

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

  // Permission is checked here rather than requested: the service worker has the API but
  // no user gesture, so the grant is made from the options page.
  const origins = requiredOrigins(applicable, seed)
  if (!(await hasOrigins(origins))) {
    send({ type: 'needs-permission', origins })
    return
  }

  send({ type: 'started', sourceIds: applicable.map((s) => s.id) })

  const outcomes = await runDeepSearch(applicable, seed, {
    signal,
    onOutcome: (outcome) => send({ type: 'outcome', outcome }),
  })

  if (signal.aborted) return

  const found = evidenceFrom(outcomes)
  const cache = new OriginCache()
  const productKey = {
    marketplace: seed.marketplace,
    asin: seed.asin,
    ...(seed.gtin ? { gtin: seed.gtin } : {}),
  }

  // Merged with what the page already told us, deduplicated so a repeated search cannot
  // inflate agreement.
  const existing = (await cache.get(productKey))?.evidence ?? []
  const verdict = aggregate({
    productKey,
    evidence: dedupe([...existing, ...found]),
    searchedDeep: true,
  })

  // Persisted under the GTIN where there is one, so the result is reused on every
  // marketplace sharing that barcode rather than being searched for again.
  await cache.put(productKey, verdict)

  send({ type: 'done', verdict, foundCount: found.length })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== DEEP_SEARCH_PORT) return

  const controller = new AbortController()
  let closed = false
  let running = false

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

  port.onMessage.addListener((raw: unknown) => {
    const message = parseRequest(raw)
    if (!message) {
      send({ type: 'error', reason: 'malformed request' })
      return
    }

    if (message.type === 'cancel') {
      controller.abort()
      return
    }

    // One search per port. A second start would share this port's single
    // AbortController, so cancelling either would stop both and their outcomes would
    // interleave into one progress count.
    if (running) {
      send({ type: 'error', reason: 'a search is already running' })
      return
    }
    running = true

    void search(message.seed, send, controller.signal)
      .catch((error: unknown) => {
        send({ type: 'error', reason: error instanceof Error ? error.message : String(error) })
      })
      .finally(() => {
        running = false
      })
  })
})

console.info('[country-made-in] service worker started')

export {}
