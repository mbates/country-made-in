import { describe, expect, it } from 'vitest'

/**
 * Fixtures are captured from a logged-in browser and committed to a **public** repo.
 *
 * Amazon parks session state in hidden form inputs inside the product-details region —
 * `customerId`, `isCustomerLoggedIn` and a live `aapiCsrfToken` all sit a few nodes away
 * from the origin field. The first capture taken for this project carried all three.
 * The capture script and the scrubber both strip form controls now; this is the check
 * that fails the build if either is ever bypassed.
 */
const fixtures = import.meta.glob('./fixtures/**/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const entries = Object.entries(fixtures)

const FORBIDDEN: [name: string, pattern: RegExp][] = [
  ['customer id', /customerId/i],
  ['login state', /isCustomerLoggedIn/i],
  ['CSRF token', /csrf/i],
  ['session id', /session[-_]?id/i],
  ['ubid cookie', /\bubid\b/i],
  ['amz access token', /x-amz-(?:access-token|security-token)/i],
  ['session token', /sessionToken/i],
]

describe('committed fixtures carry no account data', () => {
  for (const [path, html] of entries) {
    for (const [name, pattern] of FORBIDDEN) {
      it(`${path} has no ${name}`, () => {
        expect(html).not.toMatch(pattern)
      })
    }

    it(`${path} has no form controls, which is where that data hides`, () => {
      expect(html).not.toMatch(/<(?:form|input|select|textarea|button)\b/i)
    })

    it(`${path} has no scripts or styles`, () => {
      expect(html).not.toMatch(/<(?:script|style)\b/i)
    })
  }
})

describe('the fixture corpus', () => {
  it('is laid out as test/fixtures/<marketplace>/<asin>.html', () => {
    for (const path of Object.keys(fixtures)) {
      expect(path).toMatch(/^\.\/fixtures\/amazon\.[a-z.]+\/[A-Z0-9]{10}\.html$/)
    }
  })
})
