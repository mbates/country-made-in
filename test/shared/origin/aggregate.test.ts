import { describe, expect, it } from 'vitest'
import { aggregate, countryByCode } from '../../../src/shared/origin'
import type { ClaimKind, Confidence, Evidence, ProductKey } from '../../../src/shared/origin'

const KEY: ProductKey = { marketplace: 'amazon.com', asin: 'B000000000' }

let counter = 0
function evidence(
  kind: ClaimKind,
  code: string | null,
  confidence: Confidence = 'medium'
): Evidence {
  counter += 1
  return {
    kind,
    country: code ? countryByCode(code) : null,
    sourceId: `source-${counter}`,
    sourceLabel: `Source ${counter}`,
    url: null,
    quote: null,
    confidence,
    retrievedAt: '2026-09-04T00:00:00.000Z',
  }
}

const verdict = (evidence: Evidence[]) =>
  aggregate({ productKey: KEY, evidence, searchedDeep: false })

describe('aggregate', () => {
  it('passes the product key and evidence through untouched', () => {
    const items = [evidence('manufactured', 'CN')]
    const result = aggregate({ productKey: KEY, evidence: items, searchedDeep: true })
    expect(result.productKey).toBe(KEY)
    expect(result.evidence).toBe(items)
    expect(result.searchedDeep).toBe(true)
  })

  it('makes no claim for a kind with no evidence', () => {
    expect(verdict([]).claims).toEqual({})
    expect(verdict([evidence('manufactured', 'CN')]).claims['brand-origin']).toBeUndefined()
  })

  it('ignores evidence that found no country, without discarding it', () => {
    const items = [evidence('manufactured', null)]
    const result = verdict(items)
    expect(result.claims.manufactured).toBeUndefined()
    // The source was consulted and said nothing — the UI still needs to show that.
    expect(result.evidence).toHaveLength(1)
  })
})

describe('kinds are never merged', () => {
  // A brand's home country is not a contradiction of a factory location. Treating
  // them as competing manufactures a conflict that does not exist.
  it('keeps a brand origin from disputing a manufacturing claim', () => {
    const result = verdict([
      evidence('manufactured', 'CN'),
      evidence('brand-origin', 'JP'),
      evidence('shipped-from', 'DE'),
    ])
    expect(result.claims.manufactured?.country.code).toBe('CN')
    expect(result.claims.manufactured?.agreement).toBe('single-source')
    expect(result.claims['brand-origin']?.country.code).toBe('JP')
    expect(result.claims['shipped-from']?.country.code).toBe('DE')
  })
})

describe('agreement is set honestly', () => {
  it('calls one source single-source, never unanimous', () => {
    const result = verdict([evidence('manufactured', 'CN', 'high')])
    expect(result.claims.manufactured?.agreement).toBe('single-source')
  })

  it('calls two agreeing sources unanimous', () => {
    const result = verdict([evidence('manufactured', 'CN'), evidence('manufactured', 'CN')])
    expect(result.claims.manufactured?.agreement).toBe('unanimous')
  })

  it('calls a clear lead a majority and keeps the loser visible', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'high'),
      evidence('manufactured', 'CN', 'high'),
      evidence('manufactured', 'VN', 'low'),
    ])
    expect(result.claims.manufactured?.agreement).toBe('majority')
    expect(result.claims.manufactured?.country.code).toBe('CN')
    expect(result.claims.manufactured?.alternatives.map((c) => c.code)).toEqual(['VN'])
  })

  it('calls an even split disputed', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'medium'),
      evidence('manufactured', 'VN', 'medium'),
    ])
    expect(result.claims.manufactured?.agreement).toBe('disputed')
    expect(result.claims.manufactured?.alternatives).toHaveLength(1)
  })

  it('never hides a competing country', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'high'),
      evidence('manufactured', 'VN', 'medium'),
      evidence('manufactured', 'TH', 'low'),
    ])
    expect(result.claims.manufactured?.alternatives.map((c) => c.code)).toEqual(['VN', 'TH'])
  })

  it('leaves alternatives empty when nothing disagrees', () => {
    const result = verdict([evidence('manufactured', 'CN'), evidence('manufactured', 'CN')])
    expect(result.claims.manufactured?.alternatives).toEqual([])
  })
})

describe('confidence is capped', () => {
  it('never turns weak sources into a high-confidence answer', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'low'),
      evidence('manufactured', 'CN', 'low'),
      evidence('manufactured', 'CN', 'low'),
    ])
    expect(result.claims.manufactured?.confidence).toBe('medium')
  })

  it('does not reach high without a high-confidence source', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'medium'),
      evidence('manufactured', 'CN', 'medium'),
    ])
    expect(result.claims.manufactured?.confidence).toBe('medium')
  })

  it('keeps a single low source low', () => {
    expect(verdict([evidence('manufactured', 'CN', 'low')]).claims.manufactured?.confidence).toBe(
      'low'
    )
  })

  it('reports high when a high-confidence source is corroborated', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'high'),
      evidence('manufactured', 'CN', 'medium'),
    ])
    expect(result.claims.manufactured?.confidence).toBe('high')
  })

  it('costs a step when the answer is contested', () => {
    const result = verdict([
      evidence('manufactured', 'CN', 'high'),
      evidence('manufactured', 'VN', 'high'),
    ])
    expect(result.claims.manufactured?.agreement).toBe('disputed')
    expect(result.claims.manufactured?.confidence).toBe('medium')
  })
})

describe('determinism', () => {
  // A tie must not reorder between runs, or the badge flickers between two countries.
  it('breaks a tie the same way every time', () => {
    const items = [
      evidence('manufactured', 'VN', 'medium'),
      evidence('manufactured', 'CN', 'medium'),
    ]
    const first = verdict(items).claims.manufactured?.country.code
    const second = verdict([...items].reverse()).claims.manufactured?.country.code
    expect(first).toBe(second)
  })
})
