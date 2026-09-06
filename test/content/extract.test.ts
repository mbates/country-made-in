// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractOriginFields } from '../../src/content/adapters/extract'
import { matchOriginLabel } from '../../src/content/adapters/labels'
import { OriginCache } from '../../src/shared/cache'
import { runPassiveTier } from '../../src/content/passive'
import type { StorageArea } from '../../src/shared/cache'
import type { ClaimKind } from '../../src/shared/origin'

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

    it(`${path} produces the expected verdict`, async () => {
      // Driven through runPassiveTier, not a local copy of its logic. A corpus that
      // reimplements the pipeline reproduces its bugs on both sides and passes anyway.
      const storage: StorageArea = {
        data: {} as Record<string, unknown>,
        async get(keys: string[]) {
          return Object.fromEntries(
            keys.filter((k) => k in this.data).map((k) => [k, this.data[k]])
          )
        },
        async set(items: Record<string, unknown>) {
          Object.assign(this.data, items)
        },
      } as StorageArea & { data: Record<string, unknown> }

      const result = await runPassiveTier(
        parse(html),
        expected.url,
        new URL(expected.url).hostname,
        new OriginCache(storage, () => 1_000_000_000_000),
        () => new Date('2026-09-04T00:00:00.000Z')
      )

      expect(result, 'passive tier returned nothing').not.toBeNull()
      for (const [kind, want] of Object.entries(expected.expect.claims)) {
        const claim = result!.verdict.claims[kind as ClaimKind]
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
        sourceId: 'amazon-detail-table',
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

describe('regressions from review of PR #13', () => {
  it('reads a label carrying bidi marks, as Amazon writes detail bullets', () => {
    // U+200F/U+200E around the colon. These are not whitespace, so a trailing-colon
    // strip never reached them and the dominant amazon.com layout matched nothing.
    const doc = parse(
      '<div id="detailBullets_feature_div"><ul><li>' +
        '<span class="a-text-bold">Country of Origin \u200f : \u200e</span>' +
        '<span>China</span></li></ul></div>'
    )
    expect(extractOriginFields(doc)[0]).toMatchObject({ rawText: 'China', kind: 'manufactured' })
  })

  it('matches a bidi-marked label directly', () => {
    expect(matchOriginLabel('Country of Origin \u200f : \u200e')?.kind).toBe('manufactured')
  })

  it('does not invent a second field from a nested table', () => {
    // The outer row used to match the inner table's label against its own cell, turning
    // one stated fact into two sources and reporting it as corroboration.
    const doc = parse(
      '<table><tr><td><table>' +
        '<tr><th>Country of Origin</th><td>China</td></tr>' +
        '<tr><th>Brand</th><td>Acme</td></tr>' +
        '</table></td></tr></table>'
    )
    expect(extractOriginFields(doc)).toHaveLength(1)
    expect(extractOriginFields(doc)[0].rawText).toBe('China')
  })

  it('takes the cell after the label, not the first cell in the row', () => {
    const doc = parse(
      '<table><tr><td>ignore me</td><th>Country of Origin</th><td>China</td></tr></table>'
    )
    expect(extractOriginFields(doc)[0]?.rawText).toBe('China')
  })

  it('skips an empty spacer cell to find the value', () => {
    const doc = parse('<table><tr><th>Country of Origin</th><td></td><td>China</td></tr></table>')
    expect(extractOriginFields(doc)[0]?.rawText).toBe('China')
  })

  it('cuts a bullet at the label, not at its length', () => {
    const doc = parse(
      '<ul><li><span>\u203a </span><span class="a-text-bold">Country of Origin</span> India</li></ul>'
    )
    expect(extractOriginFields(doc)[0]?.rawText).toBe('India')
  })

  it('does not truncate the country when the prefix is longer', () => {
    const doc = parse(
      '<ul><li><span>\u203a\u203a\u203a </span><span class="a-text-bold">Country of Origin</span> India</li></ul>'
    )
    expect(extractOriginFields(doc)[0]?.rawText).toBe('India')
  })
})
