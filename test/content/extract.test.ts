// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractOriginFields } from '../../src/content/adapters/extract'
import { matchOriginLabel } from '../../src/content/adapters/labels'
import { aggregate, resolveOrigin } from '../../src/shared/origin'
import type { Evidence } from '../../src/shared/origin'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

const fixtures = import.meta.glob('../fixtures/**/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const expectations = import.meta.glob('../fixtures/**/*.expected.json', {
  import: 'default',
  eager: true,
}) as Record<string, ExpectedFile>

interface ExpectedFile {
  url: string
  read: { label: string; rawText: string }
  expect: {
    fields: { label: string; rawText: string; kind: string; confidence: string }[]
    claims: Record<string, { country: string; confidence: string; agreement: string }>
  }
  note?: string
}

describe('the fixture corpus', () => {
  // Every fixture is a page a human looked at. The expected value is what they read off
  // the screen, not what a selector produced — that is what stops the corpus becoming a
  // tautology that passes while the extractor is wrong.
  for (const [path, html] of Object.entries(fixtures)) {
    const expected = expectations[path.replace(/\.html$/, '.expected.json')]

    it(`${path} has an expected-value file`, () => {
      expect(expected, `missing ${path.replace(/\.html$/, '.expected.json')}`).toBeDefined()
    })

    if (!expected) continue

    it(`${path} extracts the fields a human read`, () => {
      const fields = extractOriginFields(parse(html))
      expect(
        fields.map((f) => ({
          label: f.label,
          rawText: f.rawText,
          kind: f.kind,
          confidence: f.confidence,
        }))
      ).toEqual(expected.expect.fields)
    })

    it(`${path} produces the expected verdict`, () => {
      const fields = extractOriginFields(parse(html))
      const evidence: Evidence[] = fields.flatMap((field) => {
        const resolution = resolveOrigin(field.rawText)
        const country = resolution.status === 'resolved' ? resolution.mentions[0].country : null
        return [
          {
            kind: field.kind,
            country,
            sourceId: field.sectionId ?? 'page',
            sourceLabel: field.label,
            url: expected.url,
            quote: field.rawText,
            confidence: field.confidence,
            retrievedAt: '2026-09-04T00:00:00.000Z',
          },
        ]
      })

      const verdict = aggregate({
        productKey: { marketplace: 'amazon.ca', asin: 'B09ZP3WS5G' },
        evidence,
        searchedDeep: false,
      })

      for (const [kind, want] of Object.entries(expected.expect.claims)) {
        const claim = verdict.claims[kind as keyof typeof verdict.claims]
        expect(claim, `no ${kind} claim`).toBeDefined()
        expect(claim?.country.code).toBe(want.country)
        expect(claim?.confidence).toBe(want.confidence)
        expect(claim?.agreement).toBe(want.agreement)
      }
    })
  }
})

describe('label matching', () => {
  it('matches the form that breaks the prior art', () => {
    expect(matchOriginLabel('Country/Region of Origin')?.kind).toBe('manufactured')
    expect(matchOriginLabel('Country/Region of Origin:')?.confidence).toBe('high')
  })

  it('is insensitive to case, colons and whitespace', () => {
    for (const label of ['Country of Origin', 'country of origin:', '  COUNTRY  OF  ORIGIN : ']) {
      expect(matchOriginLabel(label)?.kind).toBe('manufactured')
    }
  })

  it('matches the non-English labels, accented or not', () => {
    expect(matchOriginLabel('Ursprungsland')?.kind).toBe('manufactured')
    expect(matchOriginLabel("Pays d'origine")?.kind).toBe('manufactured')
    expect(matchOriginLabel('País de origen')?.kind).toBe('manufactured')
    expect(matchOriginLabel('Pais de origen')?.kind).toBe('manufactured')
    expect(matchOriginLabel('原産国')?.kind).toBe('manufactured')
  })

  it('rates a misapplied media label as weak', () => {
    expect(matchOriginLabel('Country of Publication')).toEqual({
      kind: 'manufactured',
      confidence: 'low',
    })
  })

  it('does not match unrelated labels', () => {
    for (const label of ['Manufacturer', 'Brand Name', 'UPC', 'Item Type Name', 'Colour']) {
      expect(matchOriginLabel(label)).toBeNull()
    }
  })
})

describe('extraction shapes', () => {
  it('reads a table row by DOM relationship', () => {
    const doc = parse('<table><tr><th>Country of Origin</th><td>Viet Nam</td></tr></table>')
    expect(extractOriginFields(doc)).toEqual([
      {
        label: 'Country of Origin',
        rawText: 'Viet Nam',
        sectionId: null,
        kind: 'manufactured',
        confidence: 'high',
      },
    ])
  })

  it('reads a detail bullet with the value in a sibling span', () => {
    const doc = parse(
      '<ul><li><span class="a-text-bold">Country of Origin :</span><span>China</span></li></ul>'
    )
    expect(extractOriginFields(doc)[0]?.rawText).toBe('China')
  })

  it('reads a detail bullet with label and value in one node', () => {
    const doc = parse('<ul><li>Country of Origin: Türkiye</li></ul>')
    expect(extractOriginFields(doc)[0]?.rawText).toBe('Türkiye')
  })

  it('reads a definition list', () => {
    const doc = parse('<dl><dt>Country of Origin</dt><dd>Italy</dd></dl>')
    expect(extractOriginFields(doc)[0]?.rawText).toBe('Italy')
  })

  it('returns nothing for a page that states no origin', () => {
    const doc = parse('<table><tr><th>Brand</th><td>FURHAB</td></tr></table>')
    expect(extractOriginFields(doc)).toEqual([])
  })

  it('deduplicates a field repeated in two sections', () => {
    const doc = parse(
      '<div id="a"><table><tr><th>Country of Origin</th><td>China</td></tr></table></div>' +
        '<div id="b"><table><tr><th>Country of Origin</th><td>China</td></tr></table></div>'
    )
    expect(extractOriginFields(doc)).toHaveLength(1)
  })

  it('never returns an empty value', () => {
    const doc = parse('<table><tr><th>Country of Origin</th><td></td></tr></table>')
    expect(extractOriginFields(doc).every((f) => f.rawText.length > 0)).toBe(true)
  })
})
