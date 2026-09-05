/**
 * Case- and accent-insensitive folding, with a map back into the original string.
 *
 * The prior art deleted every codepoint above U+007F before matching, which makes
 * `Côte d'Ivoire` and `Türkiye` permanently unmatchable — the accented letters simply
 * vanished rather than folding to their base forms. Here the text is decomposed (NFD)
 * and the combining marks are dropped, so `Côte` and `Cote` both fold to `cote`.
 *
 * Folding changes lengths (`&` becomes ` and `, runs of whitespace collapse, one
 * source character can yield several folded ones). The index maps are what let a match
 * on the folded text be quoted back to the user verbatim, exactly as the page wrote it.
 */

const COMBINING_MARKS = /\p{M}/gu

/**
 * Invisible formatting characters. Amazon writes detail-bullet labels as
 * `Country of Origin <U+200F> : <U+200E>` — bidi marks around the colon — and `\s` does
 * not match them, so a label carrying them matches nothing at all. They have no bearing
 * on what a string says, so they are dropped before anything compares it.
 */
const FORMAT_CHARS = /\p{Cf}/gu

/**
 * Characters that differ only typographically. Curly quotes matter: ICU writes
 * `Côte d’Ivoire` with U+2019, while a product page will usually have an ASCII
 * apostrophe, and the two must match each other.
 */
const EQUIVALENTS: Record<string, string> = {
  '\u2019': "'", // right single quotation mark
  '\u2018': "'", // left single quotation mark
  '\u02bc': "'", // modifier letter apostrophe
  '\u00b4': "'", // acute accent used as an apostrophe
  '`': "'", // grave accent used as an apostrophe
  '\u2013': '-', // en dash
  '\u2014': '-', // em dash
  '\u2010': '-', // hyphen
  '\u2011': '-', // non-breaking hyphen
  '\u2212': '-', // minus sign
  '&': ' and ', // "Antigua & Barbuda" must match "Antigua and Barbuda"
}

export interface Folded {
  /** Lowercase, accent-free, whitespace-collapsed, trimmed. */
  text: string
  /** For each character of `text`, the offset in the input where it began. */
  srcStart: number[]
  /** For each character of `text`, the offset in the input just past where it ended. */
  srcEnd: number[]
}

export function fold(input: string): Folded {
  const text: string[] = []
  const srcStart: number[] = []
  const srcEnd: number[] = []

  let offset = 0
  let pendingSpace = false

  for (const ch of input) {
    const start = offset
    const end = offset + ch.length
    offset = end

    const piece = (EQUIVALENTS[ch] ?? ch)
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .replace(FORMAT_CHARS, '')
      .toLowerCase()

    for (const c of piece) {
      if (/\s/.test(c)) {
        // Collapse runs, and never emit a leading space.
        pendingSpace = text.length > 0
        continue
      }
      if (pendingSpace) {
        text.push(' ')
        srcStart.push(start)
        srcEnd.push(start)
        pendingSpace = false
      }
      text.push(c)
      srcStart.push(start)
      srcEnd.push(end)
    }
  }

  return { text: text.join(''), srcStart, srcEnd }
}

/** Folds without needing the maps — for alias tables and comparisons. */
export function foldToText(input: string): string {
  return fold(input).text
}

/**
 * True when `[start, end)` in folded text sits on word boundaries.
 *
 * This is the single fix for the prior art's worst class of error. An unanchored
 * substring scan finds `niger` inside `nigeria`, `guinea` inside `papua new guinea`
 * and `samoa` inside `american samoa`, and answers with the wrong country.
 */
export function isWordBoundedMatch(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''
  const isWordChar = (c: string) => c !== '' && /[\p{L}\p{N}]/u.test(c)
  return !isWordChar(before) && !isWordChar(after)
}
