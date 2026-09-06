import type { Marketplace } from './marketplaces'
import type { OriginVerdict, ProductKey } from './origin'

/**
 * Cache envelope version.
 *
 * Bump this whenever a parser change makes previously stored verdicts wrong. Entries
 * written under a different version are discarded on read: a parser fix that cannot
 * invalidate its own bad cached output has only shipped half a fix.
 */
export const CACHE_VERSION = 1

/** 30 days for a hit. */
export const TTL_HIT_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 7 days for a miss. Pages get edited and sellers fill in fields late, so a "not
 * stated" should come back and look again long before a real answer expires.
 */
export const TTL_MISS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Bounded on purpose. The prior art declared `unlimitedStorage`; this needs no such
 * permission, and every permission is a question at review time.
 */
export const MAX_ENTRIES = 2000

/**
 * How stale an entry's `usedAt` may get before a read bothers to rewrite it.
 *
 * The whole cache map is one storage value, so any update rewrites all of it. Recency is
 * only used to order eviction, and an hour's precision orders it just as well.
 */
export const TOUCH_GRANULARITY_MS = 60 * 60 * 1000

export interface CacheEntry {
  v: number
  verdict: OriginVerdict
  /** Epoch ms. */
  storedAt: number
  /** Epoch ms, last read — the recency half of the LRU. */
  usedAt: number
}

export type CacheMap = Record<string, CacheEntry>

export interface CacheStats {
  entries: number
  fresh: number
  stale: number
  /** Fresh entries that established at least one claim. */
  answered: number
  gtinsIndexed: number
  capacity: number
}

const STORE_KEY = 'origin-cache'
const GTIN_KEY = 'gtin-index'

export const productCacheKey = (key: Pick<ProductKey, 'marketplace' | 'asin'>): string =>
  `${key.marketplace}|${key.asin}`

/** Whether a verdict actually established anything. Drives which TTL applies. */
export const isHit = (verdict: OriginVerdict): boolean => Object.keys(verdict.claims).length > 0

export function isFresh(entry: CacheEntry, now: number): boolean {
  if (entry.v !== CACHE_VERSION) return false
  const ttl = isHit(entry.verdict) ? TTL_HIT_MS : TTL_MISS_MS
  return now - entry.storedAt < ttl
}

/** The `chrome.storage.local` surface this module needs, so it can be tested without one. */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

const area = (): StorageArea => chrome.storage.local as unknown as StorageArea

export class OriginCache {
  constructor(
    private readonly storage: StorageArea = area(),
    private readonly now: () => number = Date.now
  ) {}

  private async load(): Promise<{ entries: CacheMap; gtins: Record<string, string> }> {
    const raw = await this.storage.get([STORE_KEY, GTIN_KEY])
    return {
      entries: (raw[STORE_KEY] as CacheMap | undefined) ?? {},
      gtins: (raw[GTIN_KEY] as Record<string, string> | undefined) ?? {},
    }
  }

  /**
   * A verdict for this product, or `null`.
   *
   * Falls back to the GTIN index, so a result found for a barcode on one marketplace is
   * reused everywhere that barcode appears — which is the whole reason to prefer a GTIN
   * over an ASIN as a key.
   */
  async get(key: ProductKey): Promise<OriginVerdict | null> {
    const { entries, gtins } = await this.load()
    const now = this.now()

    const direct = entries[productCacheKey(key)]
    if (direct && isFresh(direct, now)) {
      await this.touch(productCacheKey(key), entries)
      return direct.verdict
    }

    if (key.gtin) {
      const mapped = gtins[key.gtin]
      const viaGtin = mapped ? entries[mapped] : undefined
      if (viaGtin && isFresh(viaGtin, now)) {
        await this.touch(mapped, entries)
        // Re-key on the way out. The verdict was read off a different listing, and
        // returning its productKey verbatim would have the panel attribute the evidence
        // to a marketplace the user is not on — with a "check it yourself" link pointing
        // at another listing. Reusing the answer is right; claiming it came from this
        // page is not.
        return { ...viaGtin.verdict, productKey: key }
      }
    }

    return null
  }

  async put(key: ProductKey, verdict: OriginVerdict): Promise<void> {
    const { entries, gtins } = await this.load()
    const now = this.now()
    const id = productCacheKey(key)

    entries[id] = { v: CACHE_VERSION, verdict, storedAt: now, usedAt: now }
    if (key.gtin) gtins[key.gtin] = id

    const kept = evict(entries)
    await this.storage.set({
      [STORE_KEY]: kept,
      [GTIN_KEY]: prune(gtins, kept),
    })
  }

  private async touch(id: string, entries: CacheMap): Promise<void> {
    const entry = entries[id]
    if (!entry) return
    const now = this.now()
    // Recency only has to be good enough to order LRU eviction. Writing the whole map
    // back to storage on every cache hit costs a serialisation of every entry to update
    // one number, so a read within the granularity window stays free.
    if (now - entry.usedAt < TOUCH_GRANULARITY_MS) return
    entry.usedAt = now
    await this.storage.set({ [STORE_KEY]: entries })
  }

  /**
   * What the cache is holding, for the popup.
   *
   * Counts a "hit" as an entry that established something, which is the number a user
   * actually cares about — how many products this has answered.
   */
  async stats(): Promise<CacheStats> {
    const { entries, gtins } = await this.load()
    const now = this.now()
    const all = Object.values(entries)
    const fresh = all.filter((entry) => isFresh(entry, now))
    return {
      entries: all.length,
      fresh: fresh.length,
      stale: all.length - fresh.length,
      answered: fresh.filter((entry) => isHit(entry.verdict)).length,
      gtinsIndexed: Object.keys(gtins).length,
      capacity: MAX_ENTRIES,
    }
  }

  /** Drop everything. Used when a parser change invalidates stored output. */
  async clear(): Promise<void> {
    await this.storage.set({ [STORE_KEY]: {}, [GTIN_KEY]: {} })
  }
}

/** Least-recently-used eviction down to MAX_ENTRIES. */
export function evict(entries: CacheMap): CacheMap {
  const ids = Object.keys(entries)
  if (ids.length <= MAX_ENTRIES) return entries

  const byRecency = ids.sort((a, b) => entries[b].usedAt - entries[a].usedAt).slice(0, MAX_ENTRIES)
  const kept: CacheMap = {}
  for (const id of byRecency) kept[id] = entries[id]
  return kept
}

/** Drop GTIN pointers whose target was evicted, so the index cannot outgrow the cache. */
export function prune(gtins: Record<string, string>, entries: CacheMap): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [gtin, id] of Object.entries(gtins)) if (entries[id]) kept[gtin] = id
  return kept
}

export type { Marketplace }
