import { describe, expect, it } from 'vitest'
import { ALLOWED_ATTRIBUTES, findSensitive, scrubClassValue } from '../src/shared/fixture-safety'

/**
 * Fixtures are captured from a browser and committed to a **public** repo.
 *
 * A real capture for this project carried `customerId`, `aapiCsrfToken` and
 * `isCustomerLoggedIn`. This is the check that fails the build if a fixture ever carries
 * that again — including the spellings and hiding places the first version missed.
 */
const fixtures = import.meta.glob('./fixtures/**/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('committed fixtures carry no account data', () => {
  for (const [path, html] of Object.entries(fixtures)) {
    it(`${path} is clean`, () => {
      expect(findSensitive(html).map((f) => f.name)).toEqual([])
    })

    it(`${path} keeps only allowlisted attributes`, () => {
      // Body only. The head is written by the scrubber from values it has already
      // validated — the canonical URL is deliberately kept, and is the one href here.
      const body = html.slice(html.indexOf('<body>'))
      const attributes = [...body.matchAll(/\s([a-zA-Z-]+)=["']/g)].map((m) => m[1].toLowerCase())
      const unexpected = [...new Set(attributes)].filter((a) => !ALLOWED_ATTRIBUTES.includes(a))
      expect(unexpected).toEqual([])
    })
  }

  it('has fixtures to check', () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0)
  })
})

describe('the sensitive-pattern list', () => {
  // The leak that happened was one spelling of one identifier. These assert the list
  // covers the class it belongs to, not just the instance.
  it.each([
    ['camelCase', 'customerId=A1B2C3'],
    ['hyphenated attribute', '<div data-customer-id="A1B2C3">'],
    ['underscored', 'customer_id: A1B2C3'],
    ['in a query string', '<a href="/x?customer-id=A1B2C3">'],
  ])('catches a customer id, %s', (_, html) => {
    expect(findSensitive(html).map((f) => f.name)).toContain('customer id')
  })

  it.each([
    ['CSRF token', 'aapiCsrfToken=abc'],
    ['login state', 'isCustomerLoggedIn=true'],
    ['login state, hyphenated', 'is-customer-logged-in'],
    ['session id', 'session-id=123'],
    ['session token', 'sessionToken=abc'],
    ['ubid cookie', 'ubid=123'],
    ['inline event handler', '<div onclick="alert(1)">'],
    ['form control', '<input type="hidden">'],
    ['script', '<script>x</script>'],
    ['extension URL', 'chrome-extension://abc/x.png'],
    ['request id', 'pd_rd_r-2BSDB6WNYXF2P6BBT9WF'],
    ['click-stream id', 'data-csa-c-id="abc"'],
  ])('catches %s', (_, html) => {
    expect(findSensitive(html).length).toBeGreaterThan(0)
  })

  it('does not fire on ordinary page markup', () => {
    const clean =
      '<table class="prodDetTable"><tr><th class="a-color-secondary">Country of Origin</th>' +
      '<td class="a-size-base">China</td></tr></table>'
    expect(findSensitive(clean)).toEqual([])
  })
})

describe('class scrubbing', () => {
  it('keeps the styling hooks the extractors select on', () => {
    expect(scrubClassValue('a-text-bold prodDetTable detail-bullet-list')).toBe(
      'a-text-bold prodDetTable detail-bullet-list'
    )
  })

  it('drops per-request identifier tokens', () => {
    expect(scrubClassValue('celwidget pd_rd_w-WaeBv pd_rd_r-2BSDB6WNYXF2P6BBT9WF')).toBe(
      'celwidget'
    )
  })

  it('drops long opaque tokens wherever they appear', () => {
    expect(scrubClassValue('a-section A1B2C3D4E5F6G7H8')).toBe('a-section')
  })

  it('collapses to empty when every token was an identifier', () => {
    expect(scrubClassValue('pd_rd_w-WaeBv')).toBe('')
  })
})

describe('the fixture corpus', () => {
  it('is laid out as test/fixtures/<marketplace>/<asin>.html', () => {
    for (const path of Object.keys(fixtures)) {
      expect(path).toMatch(/^\.\/fixtures\/amazon\.[a-z.]+\/[A-Z0-9]{10}\.html$/)
    }
  })
})
