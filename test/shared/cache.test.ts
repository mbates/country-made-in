import { beforeEach, describe, expect, it } from 'vitest'
import {
  CACHE_VERSION,
  MAX_ENTRIES,
  OriginCache,
  TTL_HIT_MS,
  TTL_MISS_MS,
  evict,
  isFresh,
  productCacheKey,
} from '../../src/shared/cache'
import { countryByCode } from '../../src/shared/origin'
import type { CacheEntry, StorageArea } from '../../src/shared/cache'
import type { OriginVerdict, ProductKey } from '../../src/shared/origin'

const KEY: ProductKey = { marketplace: 'amazon.com', asin: 'B000000000' }

const hit = (): OriginVerdict => ({
  productKey: KEY,
  claims: {
    manufactured: {
      country: countryByCode('CN')!,
      confidence: 'high',
      agreement: 'single-source',
      alternatives: [],
    },
  },
  evidence: [],
  searchedDeep: false,
})

const miss = (): OriginVerdict => ({
  productKey: KEY,
  claims: {},
  evidence: [],
  searchedDeep: false,
})

class FakeStorage implements StorageArea {
  data: Record<string, unknown> = {}
  async get(keys: string[]) {
    return Object.fromEntries(keys.filter((k) => k in this.data).map((k) => [k, this.data[k]]))
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, items)
  }
}

let storage: FakeStorage
let clock: number
const cache = () => new OriginCache(storage, () => clock)

beforeEach(() => {
  storage = new FakeStorage()
  clock = 1_000_000_000_000
})

describe('keys', () => {
  it('includes the marketplace, because an ASIN alone is not a product', () => {
    expect(productCacheKey({ marketplace: 'amazon.com', asin: 'B1' })).not.toBe(
      productCacheKey({ marketplace: 'amazon.de', asin: 'B1' })
    )
  })
})

describe('round trip', () => {
  it('stores and returns a verdict', async () => {
    await cache().put(KEY, hit())
    expect((await cache().get(KEY))?.claims.manufactured?.country.code).toBe('CN')
  })

  it('returns null for an unknown product', async () => {
    expect(await cache().get(KEY)).toBeNull()
  })

  it('does not answer for the same ASIN on another marketplace', async () => {
    await cache().put(KEY, hit())
    expect(await cache().get({ marketplace: 'amazon.de', asin: 'B000000000' })).toBeNull()
  })
})

describe('the GTIN index', () => {
  it('reuses a result across marketplaces that share a barcode', async () => {
    await cache().put({ ...KEY, gtin: '00689323639762' }, hit())
    const other = { marketplace: 'amazon.de', asin: 'B999999999', gtin: '00689323639762' } as const
    expect((await cache().get(other))?.claims.manufactured?.country.code).toBe('CN')
  })

  it('does not match on a different barcode', async () => {
    await cache().put({ ...KEY, gtin: '00689323639762' }, hit())
    const other = { marketplace: 'amazon.de', asin: 'B999999999', gtin: '00000000000017' } as const
    expect(await cache().get(other)).toBeNull()
  })
})

describe('expiry', () => {
  it('keeps a hit for 30 days', async () => {
    await cache().put(KEY, hit())
    clock += TTL_HIT_MS - 1
    expect(await cache().get(KEY)).not.toBeNull()
    clock += 2
    expect(await cache().get(KEY)).toBeNull()
  })

  it('retries a miss after 7 days, long before a hit would expire', async () => {
    await cache().put(KEY, miss())
    clock += TTL_MISS_MS - 1
    expect(await cache().get(KEY)).not.toBeNull()
    clock += 2
    expect(await cache().get(KEY)).toBeNull()
  })

  it('expires a miss sooner than a hit', () => {
    expect(TTL_MISS_MS).toBeLessThan(TTL_HIT_MS)
  })
})

describe('envelope versioning', () => {
  it('discards entries written by another version', () => {
    const entry: CacheEntry = {
      v: CACHE_VERSION + 1,
      verdict: hit(),
      storedAt: clock,
      usedAt: clock,
    }
    expect(isFresh(entry, clock)).toBe(false)
  })

  it('means a parser fix can invalidate its own bad output', async () => {
    await cache().put(KEY, hit())
    const stored = storage.data['origin-cache'] as Record<string, CacheEntry>
    stored[productCacheKey(KEY)].v = CACHE_VERSION + 1
    expect(await cache().get(KEY)).toBeNull()
  })
})

describe('bounded size', () => {
  it('evicts the least recently used past the cap', () => {
    const entries: Record<string, CacheEntry> = {}
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      entries[`amazon.com|B${i}`] = { v: CACHE_VERSION, verdict: hit(), storedAt: 0, usedAt: i }
    }
    const kept = evict(entries)
    expect(Object.keys(kept)).toHaveLength(MAX_ENTRIES)
    // usedAt 0..9 are the oldest and should be the ones gone.
    expect(kept['amazon.com|B0']).toBeUndefined()
    expect(kept[`amazon.com|B${MAX_ENTRIES + 9}`]).toBeDefined()
  })

  it('leaves a cache under the cap alone', () => {
    const entries = { a: { v: CACHE_VERSION, verdict: hit(), storedAt: 0, usedAt: 0 } }
    expect(evict(entries)).toBe(entries)
  })

  it('drops GTIN pointers to evicted entries', async () => {
    const c = cache()
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      clock += 1
      await c.put({ marketplace: 'amazon.com', asin: `B${i}`, gtin: `G${i}` }, hit())
    }
    const gtins = storage.data['gtin-index'] as Record<string, string>
    const entries = storage.data['origin-cache'] as Record<string, CacheEntry>
    expect(Object.keys(entries)).toHaveLength(MAX_ENTRIES)
    for (const id of Object.values(gtins)) expect(entries[id]).toBeDefined()
  })
})

describe('recency', () => {
  it('a read protects an entry from eviction', async () => {
    const c = cache()
    await c.put(KEY, hit())
    clock += 1000
    await c.get(KEY)
    const entries = storage.data['origin-cache'] as Record<string, CacheEntry>
    expect(entries[productCacheKey(KEY)].usedAt).toBe(clock)
  })
})

describe('clear', () => {
  it('drops everything', async () => {
    const c = cache()
    await c.put({ ...KEY, gtin: 'G1' }, hit())
    await c.clear()
    expect(await c.get(KEY)).toBeNull()
    expect(storage.data['gtin-index']).toEqual({})
  })
})
