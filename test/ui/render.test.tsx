// @vitest-environment jsdom
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App as PopupApp } from '../../src/popup/App'
import { App as OptionsApp } from '../../src/options/App'

/**
 * These mount the real React roots.
 *
 * They exist because a `react` bump that left `react-dom` behind shipped to `main` and
 * blanked the popup with "Minified React error #527", and every other check passed:
 * lint, formatting, typecheck, the 164 unit tests and the production build all go green
 * on a broken pair, because none of them render anything. A build that compiles is not
 * evidence that the extension runs.
 */
function render(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  act(() => {
    createRoot(container).render(<StrictMode>{node}</StrictMode>)
  })
  return container
}

beforeEach(() => {
  document.body.innerHTML = ''
  const store: Record<string, unknown> = {}
  const area = {
    get: async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
    set: async (items: Record<string, unknown>) => void Object.assign(store, items),
  }
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ name: 'Country Made In', version: '0.1.0' }),
      openOptionsPage: () => {},
    },
    storage: { sync: area, local: area },
  })
})

describe('react and react-dom agree', () => {
  it('mounts without the version-skew error', () => {
    // React throws #527 from the renderer when the two packages disagree.
    expect(() => render(<PopupApp />)).not.toThrow()
  })
})

describe('popup', () => {
  it('renders the extension name and version from the manifest', () => {
    const html = render(<PopupApp />).textContent ?? ''
    expect(html).toContain('Country Made In')
    expect(html).toContain('0.1.0')
  })

  it('renders visible text rather than an empty panel', () => {
    expect((render(<PopupApp />).textContent ?? '').trim().length).toBeGreaterThan(20)
  })
})

describe('options', () => {
  it('renders the settings page with the Bates attribution', () => {
    const container = render(<OptionsApp />)
    const text = container.textContent ?? ''
    expect(text).toContain('Country Made In')
    expect(text).toContain('Bates Solutions Inc')
    expect(container.querySelector('a')?.href).toBe('https://bates-solutions.com/')
  })
})
