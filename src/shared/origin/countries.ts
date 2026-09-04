import { COUNTRIES } from './countries.data'
import { COUNTRY_ALIASES } from './aliases'
import { foldToText } from './fold'
import type { Alpha2, Country } from './types'

export { COUNTRIES }

const BY_CODE = new Map<string, Country>(COUNTRIES.map((c) => [c.code, c]))

export function countryByCode(code: string): Country | null {
  return BY_CODE.get(code.toUpperCase()) ?? null
}

/**
 * An abbreviation must be capitalised in the source to count.
 *
 * Without this, `US` matches the pronoun in "made for us in China", and the listing
 * resolves to two countries instead of one. Requiring `US`, `UK`, `PRC` and friends to
 * appear in caps costs nothing — nobody writes a country abbreviation in lower case —
 * and removes a whole class of false positive.
 */
function isAbbreviation(alias: string): boolean {
  const letters = alias.replace(/[^\p{L}]/gu, '')
  return letters.length <= 4 && letters === letters.toUpperCase()
}

export interface AliasEntry {
  /** Folded form, which is what matching compares against. */
  folded: string
  code: Alpha2
  requiresCaps: boolean
}

/**
 * Variants derivable from an ICU name, so they need not be hand-listed.
 *
 * ICU writes `St. Lucia` and `Myanmar (Burma)`; listings write `Saint Lucia` and
 * `Burma`. Parenthesised alternatives become aliases in their own right, and the
 * bracketed part is also dropped from the base name.
 */
function derivedVariants(name: string): string[] {
  const out = [name]

  const parenthesised = name.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/)
  if (parenthesised) {
    const [, before, inside, after] = parenthesised
    out.push(`${before}${after ? ` ${after}` : ''}`.trim(), inside.trim())
  }

  // ICU writes the special administrative regions as "Hong Kong SAR China"; a listing
  // says "Hong Kong". Systematic, so derived rather than hand-listed.
  const sar = name.match(/^(.*) SAR China$/)
  if (sar) out.push(sar[1], `${sar[1]} SAR`)

  for (const variant of [...out]) {
    if (/\bSt\./.test(variant)) out.push(variant.replace(/\bSt\./g, 'Saint'))
    // "Congo - Kinshasa" is also written "Congo-Kinshasa".
    if (/ - /.test(variant)) out.push(variant.replace(/ - /g, '-'))
  }

  return out
}

function buildAliasIndex(): AliasEntry[] {
  const byFolded = new Map<string, AliasEntry>()

  const add = (raw: string, code: Alpha2) => {
    const folded = foldToText(raw)
    if (!folded) return
    const existing = byFolded.get(folded)
    if (existing) {
      if (existing.code === code) return
      throw new Error(`Alias "${raw}" is claimed by both ${existing.code} and ${code}`)
    }
    byFolded.set(folded, { folded, code, requiresCaps: isAbbreviation(raw) })
  }

  for (const country of COUNTRIES) {
    for (const variant of derivedVariants(country.name)) add(variant, country.code)
  }
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    for (const alias of aliases) add(alias, code as Alpha2)
  }

  // Longest first, so "papua new guinea" is consumed before "guinea" can be tried and
  // "american samoa" before "samoa". Length order is what makes the result independent
  // of table order; the prior art's results looked arbitrary because they were.
  return [...byFolded.values()].sort(
    (a, b) => b.folded.length - a.folded.length || a.folded.localeCompare(b.folded)
  )
}

/** Built once at module load; the table is static. */
export const ALIAS_INDEX: readonly AliasEntry[] = buildAliasIndex()
