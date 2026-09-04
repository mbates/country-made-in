// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractIdentity, isValidGtin, normaliseGtin } from '../../src/content/adapters/identity'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

const FIXTURE = Object.values(
  import.meta.glob('../fixtures/amazon.ca/B09ZP3WS5G.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
)[0]

const URL = 'https://www.amazon.ca/FURHAB-Dispenser-Carabiner-Bone-Shaped-Portable/dp/B09ZP3WS5G'

describe('GTIN check digits', () => {
  it('accepts the real UPC from the fixture page', () => {
    expect(isValidGtin('689323639762')).toBe(true)
  })

  it('rejects a single mistyped digit', () => {
    // A wrong GTIN is worse than none: it attaches this product's origin to a
    // different product on every marketplace that shares the key.
    expect(isValidGtin('689323639763')).toBe(false)
    expect(isValidGtin('689323639862')).toBe(false)
  })

  it('rejects wrong lengths and non-digits', () => {
    for (const bad of ['', '1234', '68932363976', 'ABCDEFGHIJKL', '6893236397621234']) {
      expect(isValidGtin(bad)).toBe(false)
    }
  })

  it('normalises a valid UPC-12 to GTIN-14', () => {
    expect(normaliseGtin('689323639762')).toBe('00689323639762')
  })

  it('strips separators before validating', () => {
    expect(normaliseGtin('6 89323 63976 2')).toBe('00689323639762')
  })

  it('returns null rather than a bad key', () => {
    expect(normaliseGtin('689323639763')).toBeNull()
  })
})

describe('identity from the real fixture', () => {
  const identity = extractIdentity(parse(FIXTURE), URL)

  it('reads the ASIN from the URL', () => {
    expect(identity.asin).toBe('B09ZP3WS5G')
  })

  it('reads and normalises the UPC', () => {
    expect(identity.gtinRaw).toBe('689323639762')
    expect(identity.gtin).toBe('00689323639762')
  })

  it('reads brand and manufacturer', () => {
    expect(identity.brand).toBe('FURHAB')
    expect(identity.manufacturer).toBe('FURHAB')
  })

  it('reads the product title', () => {
    expect(identity.title).toContain('FURHAB')
  })

  it('collects the manufacturer contact block as an address hint', () => {
    expect(identity.addressHints).toHaveLength(1)
    expect(identity.addressHints[0]).toContain('FURHAB')
  })

  it('reports a missing model number as null rather than guessing', () => {
    expect(identity.model).toBeNull()
  })
})

describe('ASIN sources', () => {
  it('falls back to data-asin when the URL has none', () => {
    const doc = parse('<div data-asin="B000000000"></div>')
    expect(extractIdentity(doc, 'https://www.amazon.com/').asin).toBe('B000000000')
  })

  it('accepts the /gp/product/ URL form', () => {
    const doc = parse('<div></div>')
    expect(extractIdentity(doc, 'https://www.amazon.com/gp/product/B111111111').asin).toBe(
      'B111111111'
    )
  })

  it('is null when there is no ASIN anywhere', () => {
    expect(extractIdentity(parse('<div></div>'), 'https://www.amazon.com/').asin).toBeNull()
  })

  it('ignores a malformed data-asin', () => {
    const doc = parse('<div data-asin="nope"></div>')
    expect(extractIdentity(doc, 'https://www.amazon.com/').asin).toBeNull()
  })
})

describe('localised identity labels', () => {
  it('reads the German labels', () => {
    const doc = parse(
      '<table><tr><th>Marke</th><td>Acme</td></tr><tr><th>Hersteller</th><td>Acme GmbH</td></tr></table>'
    )
    const identity = extractIdentity(doc, 'https://www.amazon.de/dp/B09ZP3WS5G')
    expect(identity.brand).toBe('Acme')
    expect(identity.manufacturer).toBe('Acme GmbH')
  })

  it('collects an India-style importer block', () => {
    const doc = parse(
      '<table><tr><th>Imported By</th><td>Acme India, Mumbai, India</td></tr></table>'
    )
    expect(extractIdentity(doc, '').addressHints).toEqual(['Acme India, Mumbai, India'])
  })
})
