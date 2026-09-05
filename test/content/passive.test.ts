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
  // A details region that rendered and simply states no origin — as opposed to one that
  // had not loaded, which is covered in the regressions below and must not be cached.
  const bare =
    '<div id="prodDetails"><table class="prodDetTable"><tr><th>Brand</th><td>FURHAB</td></tr></table></div>'

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

describe('regressions from review of PR #13', () => {
  it('attributes manufacture to the country that was made in, not the first named', () => {
    // mentions[0] used to win, so this reported Japan with high confidence — the exact
    // class of confident wrong answer the project exists to eliminate.
    const evidence = fieldToEvidence(
      {
        label: 'Country of Origin',
        rawText: 'Designed in Japan, Made in China',
        sectionId: 'prodDetails',
        kind: 'manufactured',
        confidence: 'high',
      },
      URL,
      '2026-09-04T00:00:00.000Z'
    )
    expect(evidence.country?.code).toBe('CN')
  })

  it('takes an unqualified country only when it stands alone', () => {
    const one = fieldToEvidence(
      {
        label: 'Country of Origin',
        rawText: 'China',
        sectionId: null,
        kind: 'manufactured',
        confidence: 'high',
      },
      URL,
      '2026-09-04T00:00:00.000Z'
    )
    expect(one.country?.code).toBe('CN')
  })

  it('does not cache a miss when the details region never rendered', async () => {
    const bare = parse('<div id="dp-container"><h1>A product</h1></div>')
    const c = cache()
    const first = await runPassiveTier(bare, URL, HOST, c, at)
    expect(first!.verdict.claims).toEqual({})
    // Nothing stored, so a later visit re-reads rather than repeating "not stated".
    expect(await c.get(first!.productKey)).toBeNull()
  })

  it('still caches a miss when the details region did render', async () => {
    const rendered = parse(
      '<div id="prodDetails"><table><tr><th>Brand</th><td>Acme</td></tr></table></div>'
    )
    const c = cache()
    const first = await runPassiveTier(rendered, URL, HOST, c, at)
    expect(first!.verdict.claims).toEqual({})
    expect(await c.get(first!.productKey)).not.toBeNull()
  })
})
