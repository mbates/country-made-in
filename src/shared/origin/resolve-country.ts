import { ALIAS_INDEX, countryByCode } from './countries'
import { fold, foldToText, isWordBoundedMatch } from './fold'
import type { ClaimKind, Country } from './types'

/**
 * Text that answers the question with a non-answer. Matched against the whole field,
 * never as a substring — "Imported" alone says nothing, but "Imported from China"
 * says a great deal.
 *
 * A confident wrong flag is worse than no flag, so this list is allowed to grow from
 * real fixtures rather than being guessed at up front.
 */
const NON_ANSWERS: readonly string[] = [
  '',
  '-',
  '--',
  'n/a',
  'na',
  'none',
  'null',
  'unknown',
  'various',
  'multiple',
  'imported',
  'assorted',
  'mixed',
  'see description',
  'see packaging',
  'see label',
  'not specified',
  'not stated',
  'not applicable',
  'no',
  'other',
  'worldwide',
  'international',
  'global',
]

const NON_ANSWER_SET = new Set(NON_ANSWERS.map(foldToText))

/**
 * Lead-in phrases, mapped to the question they answer. Applied before the bare-country
 * fallback so "Designed in Japan, Made in China" attributes manufacture to China and
 * only brand origin to Japan, rather than picking whichever appears first.
 */
const LEAD_INS: readonly { pattern: RegExp; kind: ClaimKind }[] = [
  {
    pattern: /\b(?:made|manufactured|assembled|produced|fabricated)\s+in\b[\s:,.-]*$/,
    kind: 'manufactured',
  },
  { pattern: /\b(?:product|produce)\s+of\b[\s:,.-]*$/, kind: 'manufactured' },
  { pattern: /\bmade\s+in\s+the\b[\s:,.-]*$/, kind: 'manufactured' },
  { pattern: /\b(?:designed|engineered|invented)\s+in\b[\s:,.-]*$/, kind: 'brand-origin' },
  { pattern: /\bbrand\s+(?:origin|from)\b[\s:,.-]*$/, kind: 'brand-origin' },
  {
    pattern: /\b(?:imported|ships?|shipped|shipping|dispatched|sent)\s+from\b[\s:,.-]*$/,
    kind: 'shipped-from',
  },
]

/** Only a separator and perhaps a conjunction — "China / Vietnam", "China and Vietnam". */
const CONJUNCTION_ONLY = /^[\s,/|+&-]*(?:and|or|&)?[\s,/|+&-]*$/

export interface CountryMention {
  country: Country
  /** The question this mention answers, or `null` if the country stood alone. */
  kind: ClaimKind | null
  /** The matched text, verbatim from the input. */
  quote: string
}

export type OriginResolution =
  /** Nothing found, or the field was an explicit non-answer. */
  | { status: 'none' }
  /** One country per question asked. */
  | { status: 'resolved'; mentions: CountryMention[] }
  /** Two or more countries answering the same question. Surfaced, never picked between. */
  | { status: 'ambiguous'; kind: ClaimKind | null; countries: Country[] }

interface RawMatch {
  code: string
  start: number
  end: number
}

function findMatches(folded: string, source: string, srcStart: number[], srcEnd: number[]) {
  const matches: RawMatch[] = []
  const consumed = new Array<boolean>(folded.length).fill(false)

  for (const entry of ALIAS_INDEX) {
    let from = 0
    for (;;) {
      const at = folded.indexOf(entry.folded, from)
      if (at === -1) break
      from = at + 1
      const end = at + entry.folded.length

      if (!isWordBoundedMatch(folded, at, end)) continue

      // A longer alias already claimed this span — "guinea" inside "papua new guinea".
      let overlaps = false
      for (let i = at; i < end && !overlaps; i++) overlaps = consumed[i]
      if (overlaps) continue

      if (entry.requiresCaps) {
        const raw = source.slice(srcStart[at], srcEnd[end - 1])
        if (/\p{Ll}/u.test(raw)) continue
      }

      for (let i = at; i < end; i++) consumed[i] = true
      matches.push({ code: entry.code, start: at, end })
    }
  }

  return matches.sort((a, b) => a.start - b.start)
}

function leadInKind(folded: string, upTo: number): ClaimKind | null {
  const before = folded.slice(0, upTo)
  for (const { pattern, kind } of LEAD_INS) if (pattern.test(before)) return kind
  return null
}

/**
 * Everything the text says about origin.
 *
 * Pure: no DOM, no `chrome.*`, no network. Give it the value of a field, not a whole
 * page — a page contains too many incidental country names to be meaningful.
 */
export function resolveOrigin(text: string): OriginResolution {
  const { text: folded, srcStart, srcEnd } = fold(text)

  const bare = folded.replace(/^[\s:.,-]+|[\s:.,-]+$/g, '')
  if (NON_ANSWER_SET.has(bare)) return { status: 'none' }

  const matches = findMatches(folded, text, srcStart, srcEnd)
  if (matches.length === 0) return { status: 'none' }

  const mentions: CountryMention[] = []
  let previousKind: ClaimKind | null = null
  let previousEnd = 0

  for (const match of matches) {
    const country = countryByCode(match.code)
    if (!country) continue

    let kind = leadInKind(folded, match.start)

    // "Made in China and Vietnam" — the second country answers the first one's
    // question. Only a conjunction may separate them; anything else breaks the chain.
    if (kind === null && previousKind !== null) {
      const between = folded.slice(previousEnd, match.start)
      if (CONJUNCTION_ONLY.test(between)) kind = previousKind
    }

    mentions.push({
      country,
      kind,
      quote: text.slice(srcStart[match.start], srcEnd[match.end - 1]),
    })
    previousKind = kind
    previousEnd = match.end
  }

  if (mentions.length === 0) return { status: 'none' }

  const byKind = new Map<ClaimKind | null, Country[]>()
  for (const mention of mentions) {
    const seen = byKind.get(mention.kind) ?? []
    if (!seen.some((c) => c.code === mention.country.code)) seen.push(mention.country)
    byKind.set(mention.kind, seen)
  }

  for (const [kind, countries] of byKind) {
    if (countries.length > 1) return { status: 'ambiguous', kind, countries }
  }

  // Deduplicated: one mention per question.
  const deduped: CountryMention[] = []
  for (const mention of mentions) {
    if (!deduped.some((m) => m.kind === mention.kind && m.country.code === mention.country.code)) {
      deduped.push(mention)
    }
  }

  return { status: 'resolved', mentions: deduped }
}

/**
 * The single country a field names, or `null`.
 *
 * `null` covers three different situations — nothing found, an explicit non-answer,
 * and genuine ambiguity — which callers building `Evidence` need to tell apart. Use
 * `resolveOrigin` for those; this is the convenience form.
 */
export function resolveCountry(text: string): Country | null {
  const result = resolveOrigin(text)
  if (result.status !== 'resolved') return null

  const manufactured = result.mentions.find((m) => m.kind === 'manufactured')
  if (manufactured) return manufactured.country

  return result.mentions.length === 1 ? result.mentions[0].country : null
}
