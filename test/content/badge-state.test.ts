import { describe, expect, it } from 'vitest'
import { badgeDetail, badgeLabel, badgeState } from '../../src/content/badge-state'
import { countryByCode } from '../../src/shared/origin'
import type { Claim, ClaimKind, Confidence, Evidence, OriginVerdict } from '../../src/shared/origin'

const CN = countryByCode('CN')!
const VN = countryByCode('VN')!

const claim = (over: Partial<Claim> = {}): Claim => ({
  country: CN,
  confidence: 'high',
  agreement: 'single-source',
  alternatives: [],
  ...over,
})

const verdict = (
  claims: Partial<Record<ClaimKind, Claim>>,
  evidence: Evidence[] = []
): OriginVerdict => ({
  productKey: { marketplace: 'amazon.com', asin: 'B000000000' },
  claims,
  evidence,
  searchedDeep: false,
})

const someEvidence = (confidence: Confidence = 'high'): Evidence => ({
  kind: 'manufactured',
  country: null,
  sourceId: 'prodDetails',
  sourceLabel: 'Country of Origin',
  url: null,
  quote: 'China / Vietnam',
  confidence,
  retrievedAt: '2026-09-05T00:00:00.000Z',
})

describe('a flag is never shown on weak evidence', () => {
  // The prior art shows one flag with total confidence whatever it found. The rule here
  // is not "a flag with a caveat in a tooltip" — it is no flag.
  it('renders low confidence as unknown, not as a hedged flag', () => {
    const state = badgeState(verdict({ manufactured: claim({ confidence: 'low' }) }))
    expect(state.kind).toBe('unknown')
    expect(state).toMatchObject({ reason: 'low-confidence' })
    expect(badgeLabel(state)).not.toContain(CN.flag)
  })

  it('shows a flag on medium confidence', () => {
    expect(badgeState(verdict({ manufactured: claim({ confidence: 'medium' }) })).kind).toBe(
      'known'
    )
  })

  it('shows a flag on high confidence', () => {
    expect(badgeState(verdict({ manufactured: claim() })).kind).toBe('known')
  })
})

describe('the four ways of not knowing are distinguished', () => {
  it('says nothing was stated when no field was found', () => {
    expect(badgeState(verdict({}))).toEqual({ kind: 'unknown', reason: 'not-stated' })
  })

  it('owns the failure when a field was found but could not be read', () => {
    // Ambiguous or unrecognised text. The listing did its part; we did not.
    expect(badgeState(verdict({}, [someEvidence()]))).toEqual({
      kind: 'unknown',
      reason: 'unparsed',
    })
  })

  it('distinguishes a weak answer from no answer', () => {
    expect(badgeState(verdict({ manufactured: claim({ confidence: 'low' }) }))).toEqual({
      kind: 'unknown',
      reason: 'low-confidence',
    })
  })

  it('says so when only brand or shipping origin is known', () => {
    expect(badgeState(verdict({ 'brand-origin': claim() }))).toEqual({
      kind: 'unknown',
      reason: 'other-claims-only',
    })
    expect(badgeState(verdict({ 'shipped-from': claim() }))).toEqual({
      kind: 'unknown',
      reason: 'other-claims-only',
    })
  })

  it('gives each reason its own wording', () => {
    const reasons = ['not-stated', 'unparsed', 'low-confidence', 'other-claims-only'] as const
    const lines = reasons.map((reason) => badgeDetail({ kind: 'unknown', reason }))
    expect(new Set(lines).size).toBe(reasons.length)
  })
})

describe('the badge answers "where was this made"', () => {
  it('never puts a brand origin on the badge', () => {
    // Collapsing brand origin into "made in" is the prior art's central mistake.
    const state = badgeState(verdict({ 'brand-origin': claim({ country: VN }) }))
    expect(badgeLabel(state)).not.toContain(VN.flag)
    expect(badgeLabel(state)).toBe('Origin unknown')
  })

  it('shows the manufactured claim when both are present', () => {
    const state = badgeState(
      verdict({ manufactured: claim({ country: CN }), 'brand-origin': claim({ country: VN }) })
    )
    expect(state).toMatchObject({ kind: 'known', country: CN })
  })
})

describe('disputes are visible on the badge', () => {
  it('marks a disputed claim rather than presenting it as settled', () => {
    const state = badgeState(
      verdict({
        manufactured: claim({ agreement: 'disputed', confidence: 'medium', alternatives: [VN] }),
      })
    )
    expect(state.kind).toBe('disputed')
    expect(badgeLabel(state)).toContain('disputed')
    expect(badgeDetail(state)).toContain('Vietnam')
  })

  it('marks a majority claim as disputed too, since something disagreed', () => {
    const state = badgeState(
      verdict({ manufactured: claim({ agreement: 'majority', alternatives: [VN] }) })
    )
    expect(state.kind).toBe('disputed')
  })

  it('does not mark an uncontested claim', () => {
    expect(badgeState(verdict({ manufactured: claim({ agreement: 'unanimous' }) })).kind).toBe(
      'known'
    )
  })
})

describe('no verdict at all', () => {
  it('is treated as nothing stated', () => {
    expect(badgeState(null)).toEqual({ kind: 'unknown', reason: 'not-stated' })
  })
})

describe('labels', () => {
  it('carries the flag and country when known', () => {
    const state = badgeState(verdict({ manufactured: claim() }))
    expect(badgeLabel(state)).toBe(`${CN.flag} China`)
    expect(badgeDetail(state)).toBe('Made in — high confidence')
  })

  it('has wording for a search in progress', () => {
    expect(badgeLabel({ kind: 'searching' })).toBe('Searching…')
  })
})
