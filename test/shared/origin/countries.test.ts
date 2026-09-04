import { describe, expect, it } from 'vitest'
import { COUNTRIES, countryByCode } from '../../../src/shared/origin'

describe('the bundled country table', () => {
  it('holds the officially assigned ISO 3166-1 alpha-2 set', () => {
    expect(COUNTRIES).toHaveLength(249)
  })

  it('has no duplicate codes or names', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length)
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(COUNTRIES.length)
  })

  it('uses two uppercase letters for every code', () => {
    for (const country of COUNTRIES) expect(country.code).toMatch(/^[A-Z]{2}$/)
  })

  it('derives every flag from its code, with no external image host', () => {
    for (const country of COUNTRIES) {
      const expected = String.fromCodePoint(
        ...[...country.code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
      )
      expect(country.flag).toBe(expected)
    }
  })

  it('looks up by code, case-insensitively', () => {
    expect(countryByCode('GB')?.name).toBe('United Kingdom')
    expect(countryByCode('gb')?.code).toBe('GB')
    expect(countryByCode('ZZ')).toBeNull()
  })
})
