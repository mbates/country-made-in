import { describe, expect, it } from 'vitest'
import { aggregate, countryByCode } from '../../../src/shared/origin'
import type { Evidence } from '../../../src/shared/origin'

/**
 * The service worker merges a stored verdict's evidence with what a fresh search found.
 * Without deduplication, running the search twice turns one source into two and
 * `aggregate` reads that as corroboration — promoting `single-source`/`low` to
 * `unanimous`/`medium`. This is the identity function it deduplicates on.
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

const item = (over: Partial<Evidence> = {}): Evidence => ({
  kind: 'manufactured',
  country: countryByCode('CN'),
  sourceId: 'amazon-detail-table',
  sourceLabel: 'Country of Origin',
  url: 'https://example.test/a',
  quote: 'China',
  confidence: 'low',
  retrievedAt: '2026-09-06T00:00:00.000Z',
  ...over,
})

const KEY = { marketplace: 'amazon.com', asin: 'B000000000' } as const

describe('repeating a search must not manufacture agreement', () => {
  it('collapses an identical re-merge back to one source', () => {
    const once = aggregate({ productKey: KEY, evidence: [item()], searchedDeep: true })
    const thrice = aggregate({
      productKey: KEY,
      evidence: dedupe([item(), item(), item()]),
      searchedDeep: true,
    })
    expect(thrice.evidence).toHaveLength(1)
    expect(thrice.claims.manufactured).toEqual(once.claims.manufactured)
    expect(thrice.claims.manufactured?.agreement).toBe('single-source')
    expect(thrice.claims.manufactured?.confidence).toBe('low')
  })

  it('shows what it would have done without deduplication', () => {
    // Recorded so the reason for the dedupe is not lost: this is the bug, not a feature.
    const inflated = aggregate({
      productKey: KEY,
      evidence: [item(), item(), item()],
      searchedDeep: true,
    })
    expect(inflated.claims.manufactured?.agreement).toBe('unanimous')
    expect(inflated.claims.manufactured?.confidence).toBe('medium')
  })

  it('keeps genuinely different evidence from different sources', () => {
    const kept = dedupe([item(), item({ sourceId: 'fcc-id', url: 'https://fcc.test/x' })])
    expect(kept).toHaveLength(2)
    expect(
      aggregate({ productKey: KEY, evidence: kept, searchedDeep: true }).claims.manufactured
        ?.agreement
    ).toBe('unanimous')
  })

  it('keeps two quotes from one source that say different things', () => {
    const kept = dedupe([item(), item({ quote: 'Made in China', country: countryByCode('CN') })])
    expect(kept).toHaveLength(2)
  })

  it('treats a differing country as different evidence', () => {
    const kept = dedupe([item(), item({ country: countryByCode('VN') })])
    expect(kept).toHaveLength(2)
  })
})
