import { describe, expect, it } from 'vitest'
import { MARKETPLACE_DOMAINS, marketplaceFromHostname } from '../../src/shared/marketplaces'

describe('marketplaceFromHostname', () => {
  it('resolves every supported marketplace from its bare domain', () => {
    for (const domain of MARKETPLACE_DOMAINS) {
      expect(marketplaceFromHostname(domain)).toBe(domain)
    }
  })

  it('resolves subdomains', () => {
    expect(marketplaceFromHostname('www.amazon.co.uk')).toBe('amazon.co.uk')
    expect(marketplaceFromHostname('smile.amazon.com')).toBe('amazon.com')
  })

  it('is case- and trailing-dot-insensitive', () => {
    expect(marketplaceFromHostname('WWW.Amazon.DE.')).toBe('amazon.de')
  })

  it('rejects hostnames that merely contain a marketplace domain', () => {
    expect(marketplaceFromHostname('notamazon.com')).toBeNull()
    expect(marketplaceFromHostname('amazon.com.evil.test')).toBeNull()
    expect(marketplaceFromHostname('fakeamazon.co.jp')).toBeNull()
  })

  it('rejects unsupported Amazon marketplaces rather than guessing', () => {
    expect(marketplaceFromHostname('www.amazon.com.au')).toBeNull()
    expect(marketplaceFromHostname('www.amazon.com.br')).toBeNull()
    expect(marketplaceFromHostname('www.amazon.nl')).toBeNull()
  })

  it('rejects non-Amazon hostnames', () => {
    expect(marketplaceFromHostname('example.com')).toBeNull()
    expect(marketplaceFromHostname('')).toBeNull()
  })
})
