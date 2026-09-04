// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { OriginCache } from '../../src/shared/cache'
import { fieldToEvidence, productAsin, runPassiveTier } from '../../src/content/passive'
import type { StorageArea } from '../../src/shared/cache'

const FIXTURE = Object.values(
  import.meta.glob('../fixtures/amazon.ca/B09ZP3WS5G.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
)[0]

const URL = 'https://www.amazon.ca/FURHAB-Dispenser-Carabiner-Bone-Shaped-Portable/dp/B09ZP3WS5G'
const HOST = 'www.amazon.ca'

class FakeStorage implements StorageArea {
  data: Record<string, unknown> = {}
  reads = 0
  async get(keys: string[]) {
    this.reads += 1
    return Object.fromEntries(keys.filter((k) => k in this.data).map((k) => [k, this.data[k]]))
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, items)
  }
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

let storage: FakeStorage
const cache = () => new OriginCache(storage, () => 1_000_000_000_000)
const at = () => new Date('2026-09-04T00:00:00.000Z')

beforeEach(() => {
  storage = new FakeStorage()
})

describe('productAsin', () => {
  it.each([
    ['https://www.amazon.ca/Some-Product/dp/B09ZP3WS5G', 'B09ZP3WS5G'],
    ['https://www.amazon.com/gp/product/B000000001', 'B000000001'],
    ['https://www.amazon.co.uk/dp/B000000002/ref=sr_1_1', 'B000000002'],
  ])('%s → %s', (url, asin) => {
    expect(productAsin(url)).toBe(asin)
  })

  it('is null on a search page', () => {
    expect(productAsin('https://www.amazon.ca/s?k=dog+poop+bags')).toBeNull()
  })
})

describe('the passive tier on the real fixture', () => {
  it('produces the verdict a human would read off the page', async () => {
    const result = await runPassiveTier(parse(FIXTURE), URL, HOST, cache(), at)
    expect(result).not.toBeNull()
    expect(result!.productKey).toEqual({
      marketplace: 'amazon.ca',
      asin: 'B09ZP3WS5G',
      gtin: '00689323639762',
    })
    const claim = result!.verdict.claims.manufactured
    expect(claim?.country.code).toBe('CN')
    expect(claim?.country.flag).toBe('🇨🇳')
    expect(claim?.confidence).toBe('low')
    expect(claim?.agreement).toBe('single-source')
  })

  it('keeps the evidence checkable', async () => {
    const result = await runPassiveTier(parse(FIXTURE), URL, HOST, cache(), at)
    const [evidence] = result!.verdict.evidence
    expect(evidence.sourceLabel).toBe('Country of Publication')
    expect(evidence.quote).toBe('China')
    expect(evidence.url).toBe(URL)
    expect(evidence.retrievedAt).toBe('2026-09-04T00:00:00.000Z')
  })

  it('serves the second visit from cache', async () => {
    await runPassiveTier(parse(FIXTURE), URL, HOST, cache(), at)
    const again = await runPassiveTier(parse(FIXTURE), URL, HOST, cache(), at)
    expect(again!.fromCache).toBe(true)
    expect(again!.verdict.claims.manufactured?.country.code).toBe('CN')
  })
})

describe('pages with nothing to say', () => {
  const bare = '<table><tr><th>Brand</th><td>FURHAB</td></tr></table>'

  it('makes no claim rather than a guess', async () => {
    const result = await runPassiveTier(parse(bare), URL, HOST, cache(), at)
    expect(result!.verdict.claims).toEqual({})
  })

  it('caches the miss, so the commonest case is not re-parsed every visit', async () => {
    await runPassiveTier(parse(bare), URL, HOST, cache(), at)
    const again = await runPassiveTier(parse(bare), URL, HOST, cache(), at)
    expect(again!.fromCache).toBe(true)
  })
})

describe('pages the tier should not run on', () => {
  it('returns null on a search page', async () => {
    const url = 'https://www.amazon.ca/s?k=dog+poop+bags'
    expect(await runPassiveTier(parse(FIXTURE), url, HOST, cache(), at)).toBeNull()
  })

  it('returns null on an unsupported marketplace', async () => {
    expect(await runPassiveTier(parse(FIXTURE), URL, 'www.amazon.com.au', cache(), at)).toBeNull()
  })
})

describe('ambiguous values', () => {
  it('records the quote with no country, which is not the same as finding nothing', () => {
    const evidence = fieldToEvidence(
      {
        label: 'Country of Origin',
        rawText: 'China / Vietnam',
        sectionId: 'prodDetails',
        kind: 'manufactured',
        confidence: 'high',
      },
      URL,
      '2026-09-04T00:00:00.000Z'
    )
    expect(evidence.country).toBeNull()
    expect(evidence.quote).toBe('China / Vietnam')
  })
})
