/**
 * Scrub a captured page and install it as a fixture.
 *
 *   node scripts/scrub-fixture.mjs <captured.html>
 *
 * Writes `test/fixtures/<marketplace>/<asin>.html` and refuses to write anything that
 * still looks like it carries account data.
 *
 * This is a safety net, not the primary defence — `scripts/capture-fixture.js` already
 * drops form controls. It exists because fixtures captured with an older version of that
 * script would otherwise carry a live `customerId` and `aapiCsrfToken` into a public
 * repo, and because a second, independent check is cheap.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { JSDOM } from 'jsdom'

/** Anything matching these must not survive into a committed fixture. */
export const SENSITIVE = [
  /customerId/i,
  /isCustomerLoggedIn/i,
  /csrf/i,
  /session[-_]?id/i,
  /\bubid\b/i,
  /x-amz-(?:access-token|security-token)/i,
  /sessionToken/i,
]

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/scrub-fixture.mjs <captured.html>')
  process.exit(1)
}

const raw = readFileSync(resolve(source), 'utf8')
const dom = new JSDOM(raw)
const { document } = dom.window

for (const el of document.querySelectorAll(
  'script, style, noscript, img, svg, iframe, form, input, select, textarea, button, option'
)) {
  el.remove()
}

const canonical =
  document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href')
    ?.replace(/\/ref=.*$/, '') ?? ''
const marketplace = canonical.match(/https?:\/\/(?:www\.)?(amazon\.[a-z.]+)\//)?.[1] ?? null
const asin = canonical.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null

if (!marketplace || !asin) {
  console.error(`Could not read marketplace/ASIN from the canonical URL: ${canonical || '(none)'}`)
  process.exit(1)
}

const html = `<!doctype html>
<html lang="${document.documentElement.lang}">
<head>
<meta charset="utf-8">
<title>${marketplace} ${asin}</title>
<link rel="canonical" href="${canonical}">
</head>
<body>
${document.body.innerHTML}
</body>
</html>
`

const found = SENSITIVE.filter((p) => p.test(html))
if (found.length > 0) {
  console.error('Refusing to write — still matches:', found.map(String).join(', '))
  process.exit(1)
}

const dir = resolve(`test/fixtures/${marketplace}`)
mkdirSync(dir, { recursive: true })
const out = resolve(dir, `${asin}.html`)
writeFileSync(out, html)

console.log(`${basename(source)} → test/fixtures/${marketplace}/${asin}.html`)
console.log(`  ${(raw.length / 1024).toFixed(0)} KB → ${(html.length / 1024).toFixed(0)} KB, clean`)
