import { OriginCache } from '../shared/cache'
import { SOURCES } from '../shared/deep/registry'
import { badgeState } from './badge-state'
import { describeOrigins } from '../shared/deep/permissions'
import { extractIdentity } from './adapters/identity'
import { findTitleAnchor, mountBadge, openPanel, updatePanel } from './inject'
import { isActiveOn, loadSettings } from '../shared/settings'
import { marketplaceFromHostname } from '../shared/marketplaces'
import { observeListing } from './adapters/listing'
import { productAsin, runPassiveTier } from './passive'
import { requiredOrigins } from '../shared/deep/orchestrator'
import { seedFrom, startDeepSearch } from './deep-search'
import type { DeepSearchHandle } from './deep-search'
import type { PassiveResult } from './passive'
import type { Settings } from '../shared/settings'

const TAG = '[country-made-in]'

/**
 * Wire the wider search to the panel.
 *
 * The permission request has to happen synchronously inside the click handler — awaiting
 * anything first loses the user gesture and Chrome refuses the request — so everything
 * the request needs is computed before the panel is even opened.
 */
function deepSearchHandler(result: PassiveResult, identity: ReturnType<typeof extractIdentity>) {
  const seed = seedFrom(result.productKey, identity)
  let handle: DeepSearchHandle | null = null
  let checked = 0
  let total = 0

  return () => {
    handle?.cancel()
    checked = 0
    total = 0
    updatePanel({ phase: 'searching', total: 0, done: 0 })

    handle = startDeepSearch(seed, {
      onDenied: () => updatePanel({ phase: 'denied' }),
      onEvent: (event) => {
        switch (event.type) {
          case 'started':
            total = event.sourceIds.length
            updatePanel({ phase: 'searching', total, done: 0 })
            break
          case 'outcome':
            checked += 1
            updatePanel({ phase: 'searching', total, done: checked })
            break
          case 'done': {
            const answered = Object.keys(event.verdict.claims).length
            updatePanel({ phase: 'finished', checked, answered }, event.verdict)
            break
          }
          case 'error':
            updatePanel({ phase: 'error', reason: event.reason })
            break
        }
      },
    })
  }
}

async function runOnProductPage(settings: Settings): Promise<void> {
  const result = await runPassiveTier(
    document,
    location.href,
    location.hostname,
    new OriginCache(),
    () => new Date(),
    settings
  )
  if (!result) return

  const anchor = findTitleAnchor()
  if (!anchor) {
    console.warn(`${TAG} product title not found; no badge shown`)
    return
  }

  const identity = extractIdentity(document, location.href)
  const seed = seedFrom(result.productKey, identity)
  const hosts = describeOrigins(requiredOrigins(SOURCES, seed))

  mountBadge(anchor, badgeState(result.verdict), result.verdict, {
    onSearchWider: deepSearchHandler(result, identity),
    searchHosts: hosts,
  })
}

async function start(): Promise<void> {
  const marketplace = marketplaceFromHostname(location.hostname)
  const settings = await loadSettings()

  // Checked before anything reads the page: "off" must mean nothing is read, not that
  // the reading happens and the badge is withheld.
  if (!isActiveOn(settings, marketplace)) return

  if (productAsin(location.href)) {
    await runOnProductPage(settings)
    return
  }

  if (settings.listingBadges === 'off') return

  // Tiles carry no origin data, so there is nothing to badge until a source passes the
  // 05-01 coverage gate. Observing now keeps the teardown path exercised.
  const stop = observeListing(document, () => {})
  addEventListener('pagehide', stop, { once: true })
}

void start().catch((error: unknown) => console.warn(`${TAG} failed to start`, error))

export { openPanel }
