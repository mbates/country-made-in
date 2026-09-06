// @vitest-environment jsdom
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App as OptionsApp, SOURCES } from '../../src/options/App'
import { App as PopupApp } from '../../src/popup/App'
import { ALL_MARKETPLACES, loadSettings } from '../../src/shared/settings'
import { LINKS, PUBLISHER } from '../../src/shared/links'
import { ORIGIN_SOURCES } from '../../src/shared/sources'

let store: Record<string, unknown>
let openedOptions: number

async function render(node: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => {
    createRoot(container).render(<StrictMode>{node}</StrictMode>)
  })
  return container
}

const click = async (el: Element | null | undefined) => {
  expect(el, 'element to click was not found').toBeTruthy()
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

const byText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

beforeEach(() => {
  document.body.innerHTML = ''
  store = {}
  openedOptions = 0
  const area = {
    get: async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
    set: async (items: Record<string, unknown>) => void Object.assign(store, items),
  }
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ name: 'Country Made In', version: '0.1.0' }),
      openOptionsPage: () => {
        openedOptions += 1
      },
    },
    storage: { sync: area, local: area },
  })
})

describe('popup', () => {
  it('shows the extension as on by default', async () => {
    const el = await render(<PopupApp />)
    expect(byText(el, 'On')).toBeTruthy()
  })

  it('turns the extension off, and says what that means', async () => {
    const el = await render(<PopupApp />)
    await click(byText(el, 'On'))
    expect((await loadSettings(chrome.storage.sync as never)).enabled).toBe(false)
    expect(el.textContent).toContain('already open keep')
  })

  it('reports what is cached', async () => {
    const el = await render(<PopupApp />)
    expect(el.textContent).toContain('Products remembered')
    expect(el.textContent).toContain('With an origin found')
  })

  it('says plainly that nothing leaves the browser', async () => {
    const el = await render(<PopupApp />)
    expect(el.textContent).toContain('Nothing is sent anywhere')
  })

  it('clears the cache', async () => {
    store['origin-cache'] = { 'amazon.com|B1': {} }
    const el = await render(<PopupApp />)
    await click(byText(el, 'Clear cache'))
    expect(store['origin-cache']).toEqual({})
  })

  it('opens the options page', async () => {
    const el = await render(<PopupApp />)
    await click(byText(el, 'Settings'))
    expect(openedOptions).toBe(1)
  })

  it('carries the Bates attribution, version and links', async () => {
    const el = await render(<PopupApp />)
    expect(el.textContent).toContain(PUBLISHER)
    expect(el.textContent).toContain('v0.1.0')
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(LINKS.homepage)
    expect(hrefs).toContain(LINKS.repo)
    expect(hrefs).toContain(LINKS.issues)
  })
})

describe('options', () => {
  it('lists all nine marketplaces, enabled', async () => {
    const el = await render(<OptionsApp />)
    for (const marketplace of ALL_MARKETPLACES) {
      expect(el.textContent).toContain(marketplace)
    }
    const boxes = [...el.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]
    expect(boxes.filter((b) => b.checked).length).toBeGreaterThanOrEqual(ALL_MARKETPLACES.length)
  })

  it('turns a marketplace off and persists it', async () => {
    const el = await render(<OptionsApp />)
    const labels = [...el.querySelectorAll('label')]
    const target = labels.find((l) => l.textContent?.trim() === 'amazon.de')!
    await click(target.querySelector('input'))
    const settings = await loadSettings(chrome.storage.sync as never)
    expect(settings.marketplaces['amazon.de']).toBe(false)
  })

  it('explains that a tile badge is never an answer', async () => {
    const el = await render(<OptionsApp />)
    expect(el.textContent).toContain('never an answer')
  })

  it('offers the three listing-badge densities, defaulting to none', async () => {
    const el = await render(<OptionsApp />)
    const radios = [...el.querySelectorAll('input[type=radio]')] as HTMLInputElement[]
    expect(radios).toHaveLength(3)
    expect(radios.filter((r) => r.checked)).toHaveLength(1)
  })

  it('lists the sources that actually exist', async () => {
    // A toggle for a source that cannot run yet would be a lie.
    const el = await render(<OptionsApp />)
    expect(el.textContent).toContain('Product details table')
    expect(el.textContent).toContain('Detail bullets')
    expect(el.textContent).not.toMatch(/API key/i)
  })

  it('persists a source opt-out under its stable id', async () => {
    const el = await render(<OptionsApp />)
    const label = [...el.querySelectorAll('label')].find((l) =>
      l.textContent?.includes('Product details table')
    )!
    await click(label.querySelector('input'))
    const settings = await loadSettings(chrome.storage.sync as never)
    // Keyed on the stable source id, not an Amazon DOM id that changes.
    expect(settings.sources['amazon-detail-table']).toBe(false)
  })

  it('carries the Bates attribution', async () => {
    const el = await render(<OptionsApp />)
    expect(el.textContent).toContain(PUBLISHER)
    expect(el.textContent).toContain('v0.1.0')
  })
})

describe('regressions from review of PR #14', () => {
  it('offers a toggle for every source that exists', () => {
    // The bug this replaced was a source id no setting could match. A source added to
    // ORIGIN_SOURCES without a toggle here is the same failure from the other direction,
    // and this is the assertion that would catch it.
    expect(SOURCES.map((s) => s.id).sort()).toEqual([...ORIGIN_SOURCES].sort())
  })

  it('keeps two quick toggles from dropping one another', async () => {
    // Patches used to be built from a stale React snapshot, so the second write replaced
    // the whole nested object with one taken before the first landed.
    const el = await render(<OptionsApp />)
    const labels = [...el.querySelectorAll('label')]
    const de = labels.find((l) => l.textContent?.trim() === 'amazon.de')!
    const fr = labels.find((l) => l.textContent?.trim() === 'amazon.fr')!

    await click(de.querySelector('input'))
    await click(fr.querySelector('input'))

    const settings = await loadSettings(chrome.storage.sync as never)
    expect(settings.marketplaces['amazon.de']).toBe(false)
    expect(settings.marketplaces['amazon.fr']).toBe(false)
  })

  it('says so when a save fails, rather than looking saved', async () => {
    const el = await render(<OptionsApp />)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(chrome.storage.sync as unknown as { set: () => Promise<void> }).set = () =>
      Promise.reject(new Error('quota'))

    const label = [...el.querySelectorAll('label')].find(
      (l) => l.textContent?.trim() === 'amazon.de'
    )!
    await click(label.querySelector('input'))
    expect(el.textContent).toContain('Could not save')
  })
})
