import { describe, expect, it } from 'vitest'
import { fold, foldToText, isWordBoundedMatch } from '../../../src/shared/origin/fold'

describe('fold', () => {
  it('lowercases and strips accents rather than deleting the characters', () => {
    // The prior art removed every codepoint above U+007F, so accented names lost their
    // letters entirely and could never match.
    expect(foldToText('Côte d’Ivoire')).toBe("cote d'ivoire")
    expect(foldToText('Türkiye')).toBe('turkiye')
    expect(foldToText('SÃO TOMÉ')).toBe('sao tome')
  })

  it('normalises typographic variants to one form', () => {
    expect(foldToText('Côte d’Ivoire')).toBe(foldToText("Cote d'Ivoire"))
    expect(foldToText('Antigua & Barbuda')).toBe(foldToText('Antigua and Barbuda'))
    expect(foldToText('Timor–Leste')).toBe(foldToText('Timor-Leste'))
  })

  it('collapses whitespace and trims', () => {
    expect(foldToText('  Made   in\n\tChina  ')).toBe('made in china')
  })

  it('maps every folded character back to the text that produced it', () => {
    const input = 'Made in Côte d’Ivoire'
    const { text, srcStart, srcEnd } = fold(input)
    const at = text.indexOf("cote d'ivoire")
    expect(input.slice(srcStart[at], srcEnd[text.length - 1])).toBe('Côte d’Ivoire')
  })

  it('keeps the map aligned when folding changes length', () => {
    const input = 'Antigua & Barbuda'
    const { text, srcStart, srcEnd } = fold(input)
    expect(text).toBe('antigua and barbuda')
    // The map must stay in step even though "&" became three characters.
    expect(input.slice(srcStart[0], srcEnd[text.length - 1])).toBe(input)
  })

  it('produces an empty result for whitespace only', () => {
    expect(foldToText('   \n ')).toBe('')
  })
})

describe('isWordBoundedMatch', () => {
  const text = 'made in nigeria today'

  it('accepts a match on word boundaries', () => {
    const at = text.indexOf('nigeria')
    expect(isWordBoundedMatch(text, at, at + 'nigeria'.length)).toBe(true)
  })

  it('rejects a match that runs into a following letter', () => {
    const at = text.indexOf('niger')
    expect(isWordBoundedMatch(text, at, at + 'niger'.length)).toBe(false)
  })

  it('accepts a match at either end of the string', () => {
    expect(isWordBoundedMatch('china', 0, 5)).toBe(true)
  })

  it('treats punctuation as a boundary but not digits', () => {
    expect(isWordBoundedMatch('made in china.', 8, 13)).toBe(true)
    expect(isWordBoundedMatch('china2', 0, 5)).toBe(false)
  })
})
