/**
 * Story 05-01's gate: measure a candidate source before writing an adapter for it.
 *
 *   node --experimental-strip-types scripts/spike/measure-source-coverage.mjs
 *
 * Throwaway, outside the extension, never shipped. For each fixture product and each
 * candidate source it records three things:
 *
 *   found    — did the source have this product at all
 *   stated   — did it state an origin
 *   correct  — did that origin match the human-verified ground truth
 *
 * Results go in SOURCE-COVERAGE.md. Sources that fail the gate are recorded there
 * too, so the decision is not re-litigated later.
 *
 * NOTE: this harness reads the corpus and reports what it can measure. It does not fetch
 * anything yet — no candidate source has been wired in, because the corpus is one
 * product and a hit rate over n=1 is not a measurement. Run it to see the corpus size
 * the gate currently has to work with.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FIXTURES = resolve(import.meta.dirname, '../../test/fixtures')

/** Candidate sources from plan 05-04, in the plan's order. None wired up yet. */
const CANDIDATES = [
  { id: 'fcc-id', label: 'FCC ID database', probe: null },
  { id: 'retailer-gtin', label: 'Other retailers, keyed on GTIN', probe: null },
  { id: 'brand-site', label: "Brand's own site / spec sheets", probe: null },
  { id: 'wikidata', label: 'Wikidata brand → parent → HQ', probe: null },
  { id: 'fda-establishment', label: 'FDA establishment registration', probe: null },
  { id: 'gs1-prefix', label: 'GS1 barcode prefix', probe: null },
]

function corpus() {
  if (!existsSync(FIXTURES)) return []
  const products = []
  for (const marketplace of readdirSync(FIXTURES)) {
    const dir = join(FIXTURES, marketplace)
    // .gitkeep and friends live alongside the marketplace directories.
    if (!statSync(dir).isDirectory()) continue
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.expected.json')) continue
      const expected = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      products.push({ marketplace, asin: file.replace('.expected.json', ''), expected })
    }
  }
  return products
}

const products = corpus()

console.log(
  `Corpus: ${products.length} product(s) across ${new Set(products.map((p) => p.marketplace)).size} marketplace(s)`
)
for (const p of products) {
  console.log(`  ${p.marketplace}/${p.asin} — ${p.expected.read?.rawText ?? '(no origin read)'}`)
}

const MINIMUM = 30
if (products.length < MINIMUM) {
  console.log(`\nGate NOT runnable: ${products.length} products, ${MINIMUM} is the minimum for`)
  console.log('a hit rate to mean anything. Capture more with scripts/capture-fixture.js,')
  console.log('then scripts/scrub-fixture.mjs, before wiring a candidate probe in here.')
  process.exit(0)
}

console.log('\nCandidates awaiting a probe implementation:')
for (const c of CANDIDATES) {
  console.log(`  ${c.probe ? '[ready]  ' : '[no probe]'} ${c.id} — ${c.label}`)
}
