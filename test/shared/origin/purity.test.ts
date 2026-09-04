import { describe, expect, it } from 'vitest'

/**
 * Plan 02's closing condition: this module is pure. Every later plan consumes it, and
 * it stays testable without a browser only for as long as that holds — so the rule is
 * enforced here rather than left to review.
 *
 * The sources are read through Vite's raw glob rather than `node:fs`, because `src/`
 * is deliberately compiled without Node types — an extension that can reach for
 * `node:fs` is already wrong, and the tests should not be the thing that unlocks it.
 */
const modules = import.meta.glob('../../../src/shared/origin/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const sources = Object.entries(modules).map(([path, code]) => ({
  file: path.split('/').pop() as string,
  code,
}))

describe('src/shared/origin is pure', () => {
  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  for (const { file, code } of sources)
    it(`${file} does not touch chrome, the DOM or the network`, () => {
      // Strip comments so prose about the DOM does not trip the check.
      const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      for (const forbidden of [
        /\bchrome\./,
        /\bdocument\b/,
        /\bwindow\b/,
        /\bfetch\s*\(/,
        /\bXMLHttpRequest\b/,
        /\blocalStorage\b/,
        /\bnavigator\b/,
      ]) {
        expect(body).not.toMatch(forbidden)
      }
    })

  for (const { file, code } of sources)
    it(`${file} imports nothing outside the module`, () => {
      const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
      for (const specifier of imports) {
        // Relative to this module, or a type-only reach into shared/. No packages.
        expect(specifier.startsWith('./') || specifier.startsWith('../')).toBe(true)
      }
    })
})
