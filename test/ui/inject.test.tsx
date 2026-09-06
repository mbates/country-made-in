// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BADGE_ID,
  PANEL_ID,
  closePanel,
  findTitleAnchor,
  mountBadge,
  openPanel,
} from '../../src/content/inject'
import { badgeState } from '../../src/content/badge-state'
import { countryByCode } from '../../src/shared/origin'
import type { Claim, OriginVerdict } from '../../src/shared/origin'

const CN = countryByCode('CN')!
const VN = countryByCode('VN')!

const claim = (over: Partial<Claim> = {}): Claim => ({
  country: CN,
  confidence: 'high',
  agreement: 'single-source',
  alternatives: [],
  ...over,
})

const verdict = (over: Partial<OriginVerdict> = {}): OriginVerdict => ({
  productKey: { marketplace: 'amazon.com', asin: 'B000000000' },
  claims: { manufactured: claim() },
  evidence: [
    {
      kind: 'manufactured',
      country: CN,
      sourceId: 'prodDetails',
      sourceLabel: 'Country of Origin',
      url: 'https://www.amazon.com/dp/B000000000',
      quote: 'China',
      confidence: 'high',
      retrievedAt: '2026-09-05T00:00:00.000Z',
    },
  ],
  searchedDeep: false,
  ...over,
})

const shadowText = (id: string): string =>
  document.getElementById(id)?.shadowRoot?.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = '<span id="productTitle">A product</span>'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  closePanel()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the badge is isolated from Amazon', () => {
  it('renders inside a shadow root, not the page', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))

    const host = document.getElementById(BADGE_ID)!
    expect(host.shadowRoot).not.toBeNull()
    // Nothing of ours in the light DOM: Amazon's CSS cannot reach it and ours cannot
    // reach Amazon's.
    expect(document.body.innerHTML).not.toContain('China')
    expect(shadowText(BADGE_ID)).toContain('China')
  })

  it('sits after the title rather than replacing anything', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))
    expect(anchor.nextElementSibling?.id).toBe(BADGE_ID)
    expect(anchor.textContent).toBe('A product')
  })

  it('stamps the theme on the host so the shadow tree inherits it', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))
    expect(document.getElementById(BADGE_ID)?.getAttribute('data-theme')).toMatch(/^(light|dark)$/)
  })
})

describe('injection tolerates Amazon changing', () => {
  const hostileAnchor = (): Element => {
    const el = document.createElement('span')
    // Stands in for the shapes Amazon actually breaks in: a node that rejects insertion.
    Object.defineProperty(el, 'after', {
      value: () => {
        throw new TypeError('cannot insert here')
      },
    })
    return el
  }

  it('returns null instead of throwing when insertion fails', () => {
    expect(mountBadge(hostileAnchor(), badgeState(verdict()), verdict())).toBeNull()
  })

  it('does not take down the caller when one insertion fails', () => {
    const anchor = document.getElementById('productTitle')!
    expect(() => {
      mountBadge(hostileAnchor(), badgeState(verdict()), verdict())
      act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))
    }).not.toThrow()
    expect(document.getElementById(BADGE_ID)).not.toBeNull()
  })

  it('finds the title through any of the known anchors', () => {
    document.body.innerHTML = '<div id="titleSection">A product</div>'
    expect(findTitleAnchor()?.id).toBe('titleSection')
  })

  it('returns null when no anchor matches, rather than guessing', () => {
    document.body.innerHTML = '<div id="somethingElse"></div>'
    expect(findTitleAnchor()).toBeNull()
  })
})

describe('the badge shows what it should', () => {
  it('shows a flag on a confident claim', () => {
    act(
      () =>
        void mountBadge(document.getElementById('productTitle')!, badgeState(verdict()), verdict())
    )
    expect(shadowText(BADGE_ID)).toContain(`${CN.flag} China`)
  })

  it('shows no flag on a low-confidence claim', () => {
    const weak = verdict({ claims: { manufactured: claim({ confidence: 'low' }) } })
    act(() => void mountBadge(document.getElementById('productTitle')!, badgeState(weak), weak))
    const text = shadowText(BADGE_ID)
    expect(text).toContain('Origin unknown')
    expect(text).not.toContain(CN.flag)
  })

  it('marks a dispute', () => {
    const split = verdict({
      claims: {
        manufactured: claim({ agreement: 'disputed', confidence: 'medium', alternatives: [VN] }),
      },
    })
    act(() => void mountBadge(document.getElementById('productTitle')!, badgeState(split), split))
    expect(shadowText(BADGE_ID)).toContain('disputed')
  })
})

describe('the panel', () => {
  it('opens with the claims labelled by kind, never collapsed', () => {
    const both = verdict({
      claims: {
        manufactured: claim({ country: CN }),
        'brand-origin': claim({ country: VN }),
      },
    })
    act(() => openPanel(document.getElementById('productTitle')!, both))
    const text = shadowText(PANEL_ID)
    expect(text).toContain('Made in')
    expect(text).toContain('Brand from')
    expect(text).toContain('China')
    expect(text).toContain('Vietnam')
  })

  it('quotes the evidence verbatim with a link to check it', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    const shadow = document.getElementById(PANEL_ID)!.shadowRoot!
    expect(shadow.textContent).toContain('“China”')
    expect(shadow.textContent).toContain('Country of Origin')
    expect(shadow.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.amazon.com/dp/B000000000'
    )
  })

  it('shows both sides of a dispute rather than settling it', () => {
    const split = verdict({
      claims: {
        manufactured: claim({ agreement: 'disputed', confidence: 'medium', alternatives: [VN] }),
      },
    })
    act(() => openPanel(document.getElementById('productTitle')!, split))
    const text = shadowText(PANEL_ID)
    expect(text).toContain('China')
    expect(text).toContain('also claimed')
    expect(text).toContain('Vietnam')
  })

  it('always carries the standing caveat about seller-supplied data', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    expect(shadowText(PANEL_ID)).toContain('supplied by the seller')
  })

  it('explains the silence when nothing was found', () => {
    const nothing = verdict({ claims: {}, evidence: [] })
    act(() => openPanel(document.getElementById('productTitle')!, nothing))
    expect(shadowText(PANEL_ID)).toContain('does not state an origin')
  })

  it('closes and leaves nothing behind', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    expect(document.getElementById(PANEL_ID)).not.toBeNull()
    act(() => closePanel())
    expect(document.getElementById(PANEL_ID)).toBeNull()
  })

  it('replaces an open panel rather than stacking them', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => openPanel(anchor, verdict()))
    act(() => openPanel(anchor, verdict()))
    expect(document.querySelectorAll(`#${PANEL_ID}`)).toHaveLength(1)
  })
})
