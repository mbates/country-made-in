/**
 * Scrub a captured page and install it as a fixture.
 *
 *   node scripts/scrub-fixture.mjs <captured.html>
 *
 * Writes `test/fixtures/<marketplace>/<asin>.html` and refuses to write anything that
 * still looks like it carries account data.
 *
 * This is an independent check, not a subset of `scripts/capture-fixture.js`: the
 * captures that most need scrubbing are the ones taken with an older version of that
 * script, or by hand, which still carry event handlers, hrefs and data attributes. So it
 * strips attributes down to an allowlist rather than trusting the capture to have done
 * it, and it scans the result before writing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { ALLOWED_ATTRIBUTES, findSensitive, scrubClassValue } from '../src/shared/fixture-safety.ts'

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/scrub-fixture.mjs <captured.html>')
  process.exit(1)
}

const raw = readFileSync(resolve(source), 'utf8')
const dom = new JSDOM(raw)
const { document } = dom.window

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

// Identity is read before scrubbing: the attribute pass removes href, canonical included.
for (const el of document.querySelectorAll(
  'script, style, noscript, img, svg, iframe, form, input, select, textarea, button, option'
)) {
  el.remove()
}

const allowed = new Set(ALLOWED_ATTRIBUTES)
for (const el of document.querySelectorAll('*')) {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase()
    if (!allowed.has(name)) {
      el.removeAttribute(attr.name)
    } else if (name === 'class') {
      const cleaned = scrubClassValue(attr.value)
      if (cleaned) el.setAttribute('class', cleaned)
      else el.removeAttribute('class')
    }
  }
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

const found = findSensitive(html)
if (found.length > 0) {
  console.error('Refusing to write — still matches:', found.map((f) => f.name).join(', '))
  process.exit(1)
}

const dir = resolve(`test/fixtures/${marketplace}`)
mkdirSync(dir, { recursive: true })
const out = resolve(dir, `${asin}.html`)
writeFileSync(out, html)

console.log(`${basename(source)} → test/fixtures/${marketplace}/${asin}.html`)
console.log(`  ${(raw.length / 1024).toFixed(0)} KB → ${(html.length / 1024).toFixed(0)} KB, clean`)
