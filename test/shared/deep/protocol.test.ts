import { describe, expect, it } from 'vitest'

/**
 * The service worker's port is reachable from a content script, and a content script
 * shares a process with the page it runs in. Everything arriving on that port is treated
 * as untrusted: the seed becomes a cache key and a GTIN index entry, and a malformed one
 * would poison both.
 *
 * The validator is duplicated here rather than exported, because importing the service
 * worker registers its `chrome.runtime.onConnect` listener as a side effect.
 */
function parseRequest(message: unknown): { type: string; seed?: Record<string, unknown> } | null {
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
      marketplace: s.marketplace,
      asin: s.asin,
      ...(s.gtin ? { gtin: s.gtin } : {}),
      ...(text(s.brand) ? { brand: text(s.brand) } : {}),
      ...(text(s.manufacturer) ? { manufacturer: text(s.manufacturer) } : {}),
      ...(text(s.model) ? { model: text(s.model) } : {}),
      ...(text(s.title) ? { title: text(s.title) } : {}),
    },
  }
}

const VALID = { type: 'start', seed: { marketplace: 'amazon.com', asin: 'B09ZP3WS5G' } }

describe('the port rejects malformed input', () => {
  it.each([
    ['null', null],
    ['a string', 'start'],
    ['an unknown type', { type: 'evil' }],
    ['start with no seed', { type: 'start' }],
    ['start with a null seed', { type: 'start', seed: null }],
    ['a seed missing the asin', { type: 'start', seed: { marketplace: 'amazon.com' } }],
    ['a non-string asin', { type: 'start', seed: { marketplace: 'amazon.com', asin: 12345 } }],
  ])('rejects %s', (_, message) => {
    expect(parseRequest(message)).toBeNull()
  })

  it('rejects an ASIN that is not an ASIN', () => {
    // The ASIN becomes half a cache key; a path-shaped one would poison the store.
    for (const asin of ['', 'short', '../../etc/passwd', 'B09ZP3WS5G-extra', 'b09zp3ws5g']) {
      expect(parseRequest({ type: 'start', seed: { marketplace: 'amazon.com', asin } })).toBeNull()
    }
  })

  it('rejects a GTIN that is not 14 digits', () => {
    // The GTIN is the secondary index key, shared across marketplaces — a bad one would
    // attach this product's verdict to everything else claiming that key.
    for (const gtin of ['123', 'not-a-number', '0068932363976212345']) {
      expect(parseRequest({ ...VALID, seed: { ...VALID.seed, gtin } })).toBeNull()
    }
  })
})

describe('the port accepts what it should', () => {
  it('accepts a minimal valid start', () => {
    expect(parseRequest(VALID)).toEqual({ type: 'start', seed: VALID.seed })
  })

  it('accepts cancel with nothing else', () => {
    expect(parseRequest({ type: 'cancel' })).toEqual({ type: 'cancel' })
  })

  it('accepts a valid GTIN', () => {
    const parsed = parseRequest({ ...VALID, seed: { ...VALID.seed, gtin: '00689323639762' } })
    expect(parsed?.seed?.gtin).toBe('00689323639762')
  })

  it('drops fields it does not know about', () => {
    const parsed = parseRequest({
      ...VALID,
      seed: { ...VALID.seed, evil: 'payload', __proto__: { polluted: true } },
    })
    expect(parsed?.seed).not.toHaveProperty('evil')
  })

  it('caps free text, so a page cannot send an unbounded string onward', () => {
    const parsed = parseRequest({ ...VALID, seed: { ...VALID.seed, title: 'x'.repeat(5000) } })
    expect((parsed?.seed?.title as string).length).toBe(200)
  })
})
