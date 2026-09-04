import { describe, expect, it } from 'vitest'
import { DELIBERATELY_UNMAPPED, resolveCountry, resolveOrigin } from '../../../src/shared/origin'

const codeOf = (text: string) => resolveCountry(text)?.code ?? null

describe('the prior art regression table', () => {
  // Every row is a measured failure of the "Made in Where" extension. This table is
  // the reason the project exists; a gap here is a defect, not a missing nicety.
  const table: [input: string, expected: string | null, priorArt: string][] = [
    ['Product of Nigeria', 'NG', 'Niger'],
    ['Made in Papua New Guinea', 'PG', 'Guinea'],
    ['Made in American Samoa', 'AS', 'Samoa'],
    ['Taiwan, Province of China', 'TW', 'China'],
    ['Viet Nam', 'VN', 'nothing'],
    ['Republic of Korea', 'KR', 'nothing'],
    ['Czechia', 'CZ', 'nothing'],
    ['UK', 'GB', 'nothing'],
    ['Great Britain', 'GB', 'nothing'],
    ["Côte d'Ivoire", 'CI', 'unreachable'],
    ['Türkiye', 'TR', 'unreachable'],
    ['China / Vietnam', null, 'Vietnam'],
    ['Designed in California, Made in China', 'CN', 'China'],
    ['Imported', null, 'null'],
    ['Various', null, 'null'],
    ['', null, 'null'],
  ]

  it.each(table)('%j resolves to %s (prior art: %s)', (input, expected) => {
    expect(codeOf(input)).toBe(expected)
  })
})

describe('word-boundary anchoring', () => {
  // The single fix for the prior art's worst class of error: an unanchored substring
  // scan finds the shorter country inside the longer one.
  it.each([
    ['Nigeria', 'NG'],
    ['Niger', 'NE'],
    ['Papua New Guinea', 'PG'],
    ['Guinea', 'GN'],
    ['Equatorial Guinea', 'GQ'],
    ['Guinea-Bissau', 'GW'],
    ['American Samoa', 'AS'],
    ['Samoa', 'WS'],
    ['South Africa', 'ZA'],
    ['Dominican Republic', 'DO'],
    ['Dominica', 'DM'],
    ['North Macedonia', 'MK'],
    ['South Korea', 'KR'],
    ['North Korea', 'KP'],
  ])('%j resolves to %s and not a substring of it', (input, expected) => {
    expect(codeOf(input)).toBe(expected)
  })

  it('does not match a country inside an unrelated word', () => {
    expect(codeOf('Chinaware set')).toBeNull()
    expect(codeOf('Nigerian-style fabric')).toBeNull()
  })
})

describe('longest match wins, independent of table order', () => {
  it.each([
    ['Made in Papua New Guinea', 'PG'],
    ['Made in Guinea', 'GN'],
    ['Taiwan, Province of China', 'TW'],
    ['Made in Bosnia & Herzegovina', 'BA'],
    ['Made in Trinidad and Tobago', 'TT'],
  ])('%j resolves to %s', (input, expected) => {
    expect(codeOf(input)).toBe(expected)
  })
})

describe('accent folding', () => {
  // The prior art deleted every codepoint above U+007F, making these unmatchable.
  it.each([
    ["Côte d'Ivoire", 'CI'],
    ["Cote d'Ivoire", 'CI'],
    ['Côte d’Ivoire', 'CI'],
    ['Ivory Coast', 'CI'],
    ['Türkiye', 'TR'],
    ['Turkiye', 'TR'],
    ['Turkey', 'TR'],
    ['Curaçao', 'CW'],
    ['Curacao', 'CW'],
    ['Åland Islands', 'AX'],
    ['Aland Islands', 'AX'],
    ['São Tomé & Príncipe', 'ST'],
    ['Sao Tome and Principe', 'ST'],
  ])('%j resolves to %s', (input, expected) => {
    expect(codeOf(input)).toBe(expected)
  })
})

describe('alias table', () => {
  it.each([
    ['United States of America', 'US'],
    ['USA', 'US'],
    ['U.S.A.', 'US'],
    ['United Kingdom', 'GB'],
    ['England', 'GB'],
    ['Viet Nam', 'VN'],
    ['Vietnam', 'VN'],
    ['Republic of Korea', 'KR'],
    ["Democratic People's Republic of Korea", 'KP'],
    ['Czech Republic', 'CZ'],
    ['Hong Kong SAR China', 'HK'],
    ['Hong Kong', 'HK'],
    ['Macao', 'MO'],
    ['Macau', 'MO'],
    ['Russian Federation', 'RU'],
    ['Russia', 'RU'],
    ['Burma', 'MM'],
    ['Myanmar', 'MM'],
    ['Holland', 'NL'],
    ['The Netherlands', 'NL'],
    ['Swaziland', 'SZ'],
    ['Eswatini', 'SZ'],
    ['Cape Verde', 'CV'],
    ['Cabo Verde', 'CV'],
    ['East Timor', 'TL'],
    ['Timor-Leste', 'TL'],
    ['Saint Lucia', 'LC'],
    ['St. Lucia', 'LC'],
    ['UAE', 'AE'],
  ])('%j resolves to %s', (input, expected) => {
    expect(codeOf(input)).toBe(expected)
  })

  it('is case-insensitive for full names', () => {
    expect(codeOf('made in china')).toBe('CN')
    expect(codeOf('MADE IN CHINA')).toBe('CN')
  })
})

describe('abbreviations must be capitalised', () => {
  // Without this rule "us" is a pronoun that resolves to the United States, and a
  // listing reading "Made for us in China" comes back ambiguous instead of Chinese.
  it('resolves capitalised abbreviations', () => {
    expect(codeOf('Made in the US')).toBe('US')
    expect(codeOf('Made in the UK')).toBe('GB')
  })

  it('ignores the lowercase words that share their spelling', () => {
    expect(codeOf('Made for us in China')).toBe('CN')
    expect(codeOf('Sold by us')).toBeNull()
  })
})

describe('ambiguity is a result, not a coin toss', () => {
  it.each(['China / Vietnam', 'China and Vietnam', 'Made in China and Vietnam', 'China, Vietnam'])(
    '%j is ambiguous rather than resolved',
    (input) => {
      const result = resolveOrigin(input)
      expect(result.status).toBe('ambiguous')
      if (result.status !== 'ambiguous') return
      expect(result.countries.map((c) => c.code).sort()).toEqual(['CN', 'VN'])
      expect(resolveCountry(input)).toBeNull()
    }
  )

  it('does not treat a repeated country as ambiguous', () => {
    expect(codeOf('Made in China. Product of China.')).toBe('CN')
  })
})

describe('phrase awareness', () => {
  it('attributes manufacture and brand origin separately', () => {
    const result = resolveOrigin('Designed in Japan, Made in China')
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.mentions).toEqual([
      expect.objectContaining({ kind: 'brand-origin', quote: 'Japan' }),
      expect.objectContaining({ kind: 'manufactured', quote: 'China' }),
    ])
    // Two countries, but they answer different questions — not a conflict.
    expect(codeOf('Designed in Japan, Made in China')).toBe('CN')
  })

  it.each([
    ['Made in China', 'manufactured'],
    ['Manufactured in China', 'manufactured'],
    ['Assembled in China', 'manufactured'],
    ['Product of China', 'manufactured'],
    ['Designed in China', 'brand-origin'],
    ['Imported from China', 'shipped-from'],
    ['Ships from China', 'shipped-from'],
  ])('%j is a %s claim', (input, kind) => {
    const result = resolveOrigin(input)
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.mentions[0].kind).toBe(kind)
  })

  it('leaves a bare country unattributed', () => {
    const result = resolveOrigin('China')
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.mentions[0].kind).toBeNull()
  })
})

describe('non-answers', () => {
  it.each([
    'Imported',
    'Various',
    'Multiple',
    'See description',
    'See packaging',
    '-',
    'N/A',
    'Unknown',
    'Not specified',
    '   ',
    '',
  ])('%j resolves to nothing', (input) => {
    expect(resolveOrigin(input).status).toBe('none')
    expect(resolveCountry(input)).toBeNull()
  })

  it('does not mistake a non-answer word inside a real answer', () => {
    expect(codeOf('Imported from China')).toBe('CN')
  })
})

describe('deliberately unmapped names', () => {
  it.each(DELIBERATELY_UNMAPPED)('%j must not resolve', (input) => {
    expect(resolveCountry(input)).toBeNull()
    expect(resolveCountry(`Made in ${input}`)).toBeNull()
  })

  it('still resolves the qualified forms', () => {
    expect(codeOf('Congo - Kinshasa')).toBe('CD')
    expect(codeOf('DR Congo')).toBe('CD')
    expect(codeOf('Congo-Brazzaville')).toBe('CG')
  })
})

describe('quotes are verbatim', () => {
  it('returns the text exactly as the page wrote it', () => {
    const result = resolveOrigin('Country of Origin: Côte d’Ivoire')
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.mentions[0].quote).toBe('Côte d’Ivoire')
  })
})
