// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BADGE_ATTR,
  PANEL_ID,
  closePanel,
  findTitleAnchor,
  mountBadge,
  openPanel,
} from '../../src/content/inject'
import { badgeState } from '../../src/content/badge-state'
import { mountBadge as mount } from '../../src/content/inject'
import { createRoot } from 'react-dom/client'
import { Panel } from '../../src/panel/Panel'
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
      sourceId: 'amazon-detail-table',
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

const badgeHost = (): HTMLElement | null => document.querySelector(`[${BADGE_ATTR}]`)

const shadowText = (id: string): string =>
  document.getElementById(id)?.shadowRoot?.textContent ?? ''

const badgeText = (): string => badgeHost()?.shadowRoot?.textContent ?? ''

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

    const host = badgeHost()!
    expect(host.shadowRoot).not.toBeNull()
    // Nothing of ours in the light DOM: Amazon's CSS cannot reach it and ours cannot
    // reach Amazon's.
    expect(document.body.innerHTML).not.toContain('China')
    expect(badgeText()).toContain('China')
  })

  it('sits after the title rather than replacing anything', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))
    expect(anchor.nextElementSibling?.hasAttribute(BADGE_ATTR)).toBe(true)
    expect(anchor.textContent).toBe('A product')
  })

  it('stamps the theme on the host so the shadow tree inherits it', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))
    expect(badgeHost()?.getAttribute('data-theme')).toMatch(/^(light|dark)$/)
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
    expect(badgeHost()).not.toBeNull()
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
    expect(badgeText()).toContain(`${CN.flag} China`)
  })

  it('shows no flag on a low-confidence claim', () => {
    const weak = verdict({ claims: { manufactured: claim({ confidence: 'low' }) } })
    act(() => void mountBadge(document.getElementById('productTitle')!, badgeState(weak), weak))
    const text = badgeText()
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
    expect(badgeText()).toContain('disputed')
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

describe('regressions from review of PR #14', () => {
  it('gives every badge a unique id and marks it by attribute', () => {
    // Plan 05 mounts one badge per tile, so duplicates are the normal case; duplicate
    // ids would be invalid markup that getElementById quietly hides.
    document.body.innerHTML = '<span id="a">A</span><span id="b">B</span>'
    act(() => void mountBadge(document.getElementById('a')!, badgeState(verdict()), verdict()))
    act(() => void mountBadge(document.getElementById('b')!, badgeState(verdict()), verdict()))

    const hosts = [...document.querySelectorAll(`[${BADGE_ATTR}]`)]
    expect(hosts).toHaveLength(2)
    expect(new Set(hosts.map((h) => h.id)).size).toBe(2)
  })

  it('does not stack a second badge on the same anchor', () => {
    const anchor = document.getElementById('productTitle')!
    act(() => void mountBadge(anchor, badgeState(verdict()), verdict()))
    const again = mount(anchor, badgeState(verdict()), verdict())
    expect(again).toBeNull()
    expect(document.querySelectorAll(`[${BADGE_ATTR}]`)).toHaveLength(1)
  })

  it('removes the badge when its tree throws, instead of leaving an empty host', async () => {
    // A try/catch around render() cannot catch this: React surfaces it out of band.
    const broken = verdict({
      claims: {
        manufactured: {
          ...claim(),
          // Country is read during render; a null name blows up badgeLabel.
          country: null as unknown as ReturnType<typeof countryByCode> & object,
        } as never,
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => void mountBadge(document.getElementById('productTitle')!, badgeState(broken), broken))
    // Teardown is deferred a microtask — React forbids unmounting inside a lifecycle.
    await act(async () => {})
    expect(document.querySelectorAll(`[${BADGE_ATTR}]`)).toHaveLength(0)
  })

  it('dismisses the panel on Escape', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    expect(document.getElementById(PANEL_ID)).not.toBeNull()
    act(() => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(document.getElementById(PANEL_ID)).toBeNull()
  })

  it('dismisses the panel on a click outside it', async () => {
    vi.useFakeTimers()
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    })
    expect(document.getElementById(PANEL_ID)).toBeNull()
    vi.useRealTimers()
  })

  it('detaches its listeners when closed, so a later scroll does nothing', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    act(() => closePanel())
    expect(() => dispatchEvent(new Event('resize'))).not.toThrow()
    expect(document.getElementById(PANEL_ID)).toBeNull()
  })

  it('opens the panel from the badge, which is the whole interaction', () => {
    act(
      () =>
        void mountBadge(document.getElementById('productTitle')!, badgeState(verdict()), verdict())
    )
    const button = badgeHost()!.shadowRoot!.querySelector('button')!
    act(() => button.click())
    expect(document.getElementById(PANEL_ID)).not.toBeNull()
    expect(shadowText(PANEL_ID)).toContain('Where is this made?')
  })

  it('closes the panel from its own close button', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    const close = document
      .getElementById(PANEL_ID)!
      .shadowRoot!.querySelector('button[aria-label="Close"]') as HTMLButtonElement
    act(() => close.click())
    expect(document.getElementById(PANEL_ID)).toBeNull()
  })

  it('renders the wider-search button with its permission warning before the prompt', () => {
    // The copy has to appear before Chrome's prompt, so it must render with the button.
    const container = document.createElement('div')
    document.body.append(container)
    act(() => {
      createRoot(container).render(
        <Panel verdict={verdict()} onClose={() => {}} onSearchWider={() => {}} />
      )
    })
    expect(container.textContent).toContain('Search wider')
    expect(container.textContent).toContain('Chrome will ask permission')
  })

  it('refuses a javascript: url rather than linking to it', () => {
    const hostile = verdict({
      evidence: [{ ...verdict().evidence[0], url: 'javascript:alert(document.cookie)' }],
    })
    act(() => openPanel(document.getElementById('productTitle')!, hostile))
    const links = [...document.getElementById(PANEL_ID)!.shadowRoot!.querySelectorAll('a')]
    expect(links).toHaveLength(0)
  })

  it('still links an ordinary https url', () => {
    act(() => openPanel(document.getElementById('productTitle')!, verdict()))
    const link = document.getElementById(PANEL_ID)!.shadowRoot!.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://www.amazon.com/dp/B000000000')
  })

  it('stamps dark when the browser asks for it', () => {
    // jsdom has no matchMedia, so without a stub this path never runs and the theme test
    // passes for the wrong reason.
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    act(
      () =>
        void mountBadge(document.getElementById('productTitle')!, badgeState(verdict()), verdict())
    )
    expect(badgeHost()?.getAttribute('data-theme')).toBe('dark')
    vi.unstubAllGlobals()
  })
})
