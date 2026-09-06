import uiStyles from '../styles/ui.css?inline'

/**
 * One stylesheet object, adopted by every shadow root.
 *
 * A listing page can carry fifty badges. Giving each its own `<style>` would parse the
 * same CSS fifty times; a constructable stylesheet is parsed once and shared.
 */
let sheet: CSSStyleSheet | null = null

function styleSheet(): CSSStyleSheet | null {
  if (sheet) return sheet
  try {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(uiStyles)
    return sheet
  } catch {
    // Older engines without constructable stylesheets fall back to a <style> node.
    return null
  }
}

/**
 * Keep the host's theme in step with the browser's.
 *
 * Stamped on the **host**, not the wrapper inside it, so `:host([data-theme])` matches
 * and the whole shadow tree reskins by inheritance — including anything portaled to the
 * shadow root, which is a sibling of the wrapper and would otherwise miss it.
 */
function applyTheme(host: HTMLElement): () => void {
  // Theming is a nicety; rendering the badge is not. Where matchMedia is unavailable the
  // host still gets a theme, it just never changes.
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  if (!media) {
    host.setAttribute('data-theme', 'light')
    return () => {}
  }

  const set = () => host.setAttribute('data-theme', media.matches ? 'dark' : 'light')
  set()
  media.addEventListener('change', set)
  return () => media.removeEventListener('change', set)
}

export interface UiHost {
  host: HTMLElement
  /** Where React mounts. */
  root: HTMLElement
  remove: () => void
}

/**
 * A shadow-DOM host, isolated in both directions.
 *
 * Amazon's CSS is heavy and changes without notice, so nothing of theirs may reach our
 * markup — and nothing of ours may reach theirs. A shadow root is the only boundary that
 * holds both ways without a specificity war.
 */
export function createUiHost(tag: 'span' | 'div', id: string): UiHost {
  const host = document.createElement(tag)
  host.id = id
  // The host participates in Amazon's layout, so it must claim no space of its own.
  host.style.all = 'initial'
  if (tag === 'span') host.style.display = 'inline-block'

  const shadow = host.attachShadow({ mode: 'open' })

  const shared = styleSheet()
  if (shared) {
    shadow.adoptedStyleSheets = [shared]
  } else {
    const style = document.createElement('style')
    style.textContent = uiStyles
    shadow.append(style)
  }

  const root = document.createElement('div')
  shadow.append(root)

  const stopTheme = applyTheme(host)

  return {
    host,
    root,
    remove: () => {
      stopTheme()
      host.remove()
    },
  }
}
