import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { Badge } from '../panel/Badge'
import { ErrorBoundary } from '../panel/ErrorBoundary'
import { Panel } from '../panel/Panel'
import { createUiHost } from './ui-host'
import type { BadgeState } from './badge-state'
import type { DeepSearchStatus } from '../panel/Panel'
import type { OriginVerdict } from '../shared/origin'
import type { UiHost } from './ui-host'

export const PANEL_ID = 'country-made-in-panel'

/**
 * Marks a badge host. An attribute rather than an id: plan 05 mounts one badge per
 * listing tile, so duplicates are the normal case and duplicate ids would be invalid
 * markup that `getElementById` quietly hides.
 */
export const BADGE_ATTR = 'data-country-made-in-badge'

let badgeSeq = 0

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

interface OpenPanel extends UiHost {
  react: Root
  detach: () => void
  onClose?: () => void
  draw: (deep: DeepSearchStatus, verdict: OriginVerdict | null) => void
  verdict: OriginVerdict | null
}

let panel: OpenPanel | null = null

/** Update the open panel's search state. No-op if it has been closed. */
export function updatePanel(deep: DeepSearchStatus, verdict?: OriginVerdict | null): void {
  if (!panel) return
  if (verdict !== undefined) panel.verdict = verdict
  attempt('panel update', () => panel?.draw(deep, panel.verdict))
}

/** Close and unmount the detail panel, if it is open. */
export function closePanel(): void {
  if (!panel) return
  const current = panel
  panel = null
  attempt('panel teardown', () => {
    current.detach()
    current.onClose?.()
    current.react.unmount()
    current.remove()
  })
}

export interface PanelOptions {
  onSearchWider?: () => void
  searchHosts?: readonly string[]
  /** Called when the panel closes, so an in-flight search can be cancelled. */
  onPanelClose?: () => void
}

/** Open the detail panel next to `anchor`. Replaces any panel already open. */
export function openPanel(
  anchor: Element,
  verdict: OriginVerdict | null,
  options: PanelOptions = {}
): void {
  closePanel()
  attempt('panel mount', () => {
    const ui = createUiHost('div', PANEL_ID)
    ui.host.style.position = 'absolute'
    ui.host.style.zIndex = '2147483647'
    document.body.append(ui.host)

    // Recomputed rather than set once: a resize, a zoom, or one of Amazon's late blocks
    // reflowing the title would otherwise strand the panel away from its badge, on top
    // of someone else's page at the maximum z-index.
    const position = () => {
      const box = anchor.getBoundingClientRect()
      // Offset by the body's own box, so a positioned or transformed body — which is the
      // containing block when it has one — does not shift everything.
      const origin = document.body.getBoundingClientRect()
      ui.host.style.top = `${box.bottom - origin.top + 6}px`
      ui.host.style.left = `${Math.max(0, box.left - origin.left)}px`
    }
    position()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    const onOutside = (event: Event) => {
      // composedPath sees through the shadow boundary; event.target would just be the host.
      if (!event.composedPath().includes(ui.host)) closePanel()
    }

    addEventListener('resize', position)
    addEventListener('scroll', position, { passive: true })
    addEventListener('keydown', onKey)
    // Deferred, or the click that opened the panel immediately closes it.
    const armOutside = setTimeout(() => addEventListener('pointerdown', onOutside), 0)

    const detach = () => {
      clearTimeout(armOutside)
      removeEventListener('resize', position)
      removeEventListener('scroll', position)
      removeEventListener('keydown', onKey)
      removeEventListener('pointerdown', onOutside)
    }

    const react = createRoot(ui.root)

    // The panel re-renders in place as the search reports progress, rather than being
    // torn down and rebuilt — a remount would lose scroll position and drop the
    // pointerdown listener that dismisses it.
    const draw = (deep: DeepSearchStatus, current: OriginVerdict | null) =>
      react.render(
        <StrictMode>
          <ErrorBoundary onFail={() => queueMicrotask(closePanel)}>
            <Panel
              verdict={current}
              onClose={closePanel}
              onSearchWider={options.onSearchWider}
              searchHosts={options.searchHosts}
              deep={deep}
            />
          </ErrorBoundary>
        </StrictMode>
      )

    draw({ phase: 'idle' }, verdict)
    panel = { ...ui, react, detach, draw, verdict, onClose: options.onPanelClose }
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
  verdict: OriginVerdict | null,
  panelOptions: PanelOptions = {}
): MountedBadge | null {
  // Idempotent: a second injection of the content script, or a re-run over a tile that
  // already has one, must not stack badges.
  if (anchor.nextElementSibling?.hasAttribute(BADGE_ATTR)) return null

  return attempt('badge mount', () => {
    const ui = createUiHost('span', `country-made-in-badge-${++badgeSeq}`)
    ui.host.setAttribute(BADGE_ATTR, '')
    ui.host.style.marginLeft = '8px'
    ui.host.style.verticalAlign = 'middle'
    anchor.after(ui.host)

    const react = createRoot(ui.root)
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      // Deferred: React forbids unmounting from inside a lifecycle method.
      queueMicrotask(() => {
        attempt('badge teardown', () => {
          react.unmount()
          ui.remove()
        })
      })
    }

    react.render(
      <StrictMode>
        <ErrorBoundary onFail={remove}>
          <Badge state={state} onOpen={() => openPanel(ui.host, verdict, panelOptions)} />
        </ErrorBoundary>
      </StrictMode>
    )

    return { remove }
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
