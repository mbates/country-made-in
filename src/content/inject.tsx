import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { Badge } from '../panel/Badge'
import { Panel } from '../panel/Panel'
import { createUiHost } from './ui-host'
import type { BadgeState } from './badge-state'
import type { OriginVerdict } from '../shared/origin'
import type { UiHost } from './ui-host'

export const BADGE_ID = 'country-made-in-badge'
export const PANEL_ID = 'country-made-in-panel'

/** Where the badge goes on a product page, most preferred first. */
const TITLE_ANCHORS = ['#productTitle', '#title', '#titleSection']

/**
 * Run something that touches Amazon's DOM, and give up quietly if it fails.
 *
 * Amazon changes its markup without notice and a listing page renders dozens of tiles.
 * A selector miss or a detached node must skip that one insertion — never throw, and
 * never take the rest of the page's badges with it.
 */
function attempt<T>(what: string, run: () => T): T | null {
  try {
    return run()
  } catch (error) {
    console.warn(`[country-made-in] ${what} failed; skipping`, error)
    return null
  }
}

let panel: (UiHost & { react: Root }) | null = null

/** Close and unmount the detail panel, if it is open. */
export function closePanel(): void {
  if (!panel) return
  const current = panel
  panel = null
  attempt('panel teardown', () => {
    current.react.unmount()
    current.remove()
  })
}

/** Open the detail panel next to `anchor`. Replaces any panel already open. */
export function openPanel(anchor: Element, verdict: OriginVerdict | null): void {
  closePanel()
  attempt('panel mount', () => {
    const ui = createUiHost('div', PANEL_ID)
    ui.host.style.position = 'absolute'
    ui.host.style.zIndex = '2147483647'
    document.body.append(ui.host)

    const box = anchor.getBoundingClientRect()
    ui.host.style.top = `${box.bottom + scrollY + 6}px`
    ui.host.style.left = `${Math.max(8, box.left + scrollX)}px`

    const react = createRoot(ui.root)
    react.render(
      <StrictMode>
        <Panel verdict={verdict} onClose={closePanel} />
      </StrictMode>
    )
    panel = { ...ui, react }
  })
}

export interface MountedBadge {
  remove: () => void
}

/**
 * Put a badge after `anchor`.
 *
 * Returns `null` rather than throwing when the anchor is gone or the insertion fails, so
 * a caller looping over listing tiles can carry on with the rest.
 */
export function mountBadge(
  anchor: Element,
  state: BadgeState,
  verdict: OriginVerdict | null
): MountedBadge | null {
  return attempt('badge mount', () => {
    const ui = createUiHost('span', BADGE_ID)
    ui.host.style.marginLeft = '8px'
    ui.host.style.verticalAlign = 'middle'
    anchor.after(ui.host)

    const react = createRoot(ui.root)
    react.render(
      <StrictMode>
        <Badge state={state} onOpen={() => openPanel(ui.host, verdict)} />
      </StrictMode>
    )

    return {
      remove: () => {
        react.unmount()
        ui.remove()
      },
    }
  })
}

/** The product title element, or `null` if Amazon has moved it again. */
export function findTitleAnchor(root: ParentNode = document): Element | null {
  for (const selector of TITLE_ANCHORS) {
    const found = attempt(`anchor ${selector}`, () => root.querySelector(selector))
    if (found) return found
  }
  return null
}
