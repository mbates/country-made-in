export interface ListingTile {
  asin: string
  element: Element
}

/** Where Amazon puts search and category results, most specific first. */
const RESULT_CONTAINERS = [
  '[data-component-type="s-search-results"]',
  '.s-main-slot',
  '#search',
  '#gridItemRoot',
]

const ASIN = /^[A-Z0-9]{10}$/

function tilesIn(root: ParentNode): ListingTile[] {
  const found: ListingTile[] = []
  for (const element of root.querySelectorAll('[data-asin]')) {
    const asin = element.getAttribute('data-asin')?.trim() ?? ''
    if (ASIN.test(asin)) found.push({ asin, element })
  }
  return found
}

export interface ObserveOptions {
  /** Batching window. Amazon mutates results in bursts; one callback per burst. */
  debounceMs?: number
  /** Injected for tests. */
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

/**
 * Watch a listing page for product tiles, and call back with each newly seen one.
 *
 * Tiles carry no origin data, so the passive tier has nothing to read here — this exists
 * so plan 04 can mark them "unknown — check" and let the deep tier answer on demand.
 *
 * Observed, not polled. The prior art runs a two-second interval for the life of the
 * session on every Amazon tab, which costs CPU forever whether or not anything changed.
 * A MutationObserver costs nothing while the page is still.
 *
 * Returns a teardown function. Call it on unload: an observer left connected keeps the
 * whole subtree alive.
 */
export function observeListing(
  root: ParentNode & Node,
  onTiles: (tiles: ListingTile[]) => void,
  {
    debounceMs = 150,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  }: ObserveOptions = {}
): () => void {
  const container =
    RESULT_CONTAINERS.map((selector) => root.querySelector(selector)).find(Boolean) ?? root

  const seen = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    const fresh = tilesIn(container).filter((tile) => !seen.has(tile.asin))
    if (fresh.length === 0) return
    for (const tile of fresh) seen.add(tile.asin)
    onTiles(fresh)
  }

  const schedule = () => {
    if (timer !== null) clearTimeoutFn(timer)
    timer = setTimeoutFn(flush, debounceMs)
  }

  // Whatever is already on the page, without waiting for a mutation.
  flush()

  const observer = new MutationObserver(schedule)
  observer.observe(container as Node, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    if (timer !== null) clearTimeoutFn(timer)
    timer = null
  }
}

export const __testing = { tilesIn }
