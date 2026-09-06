import { OriginCache } from '../shared/cache'
import { SOURCES } from '../shared/deep/registry'
import { badgeState } from './badge-state'
import { extractIdentity } from './adapters/identity'
import { describeOrigins } from '../shared/deep/permissions'
import { findTitleAnchor, mountBadge, updatePanel } from './inject'
import { isActiveOn, loadSettings } from '../shared/settings'
import { marketplaceFromHostname } from '../shared/marketplaces'
import { observeListing } from './adapters/listing'
import { productAsin, runPassiveTier } from './passive'
import { requiredOrigins } from '../shared/deep/orchestrator'
import { seedFrom, startDeepSearch } from './deep-search'
import type { DeepSearchHandle } from './deep-search'
import type { ProductSeed } from '../shared/deep/source'
import type { Settings } from '../shared/settings'

const TAG = '[country-made-in]'

/**
 * Wire the wider search to the panel.
 *
 * Returns `null` when no source is registered — there is nothing to search, and a button
 * offering a search that cannot happen is worse than no button. It would promise a
 * permission prompt that never appears and answer "checked 0 sources", which reads as a
 * search that found nothing rather than one that never ran.
 */
function deepSearchHandler(
  seed: ProductSeed
): { onSearchWider: () => void; cancel: () => void } | null {
  if (SOURCES.length === 0) return null

  let handle: DeepSearchHandle | null = null
  let checked = 0
  let total = 0

  const cancel = () => {
    handle?.cancel()
    handle = null
  }

  return {
    cancel,
    onSearchWider: () => {
      cancel()
      checked = 0
      total = 0
      updatePanel({ phase: 'searching', total: 0, done: 0 })

      handle = startDeepSearch(seed, (event) => {
        switch (event.type) {
          case 'needs-permission':
            updatePanel({ phase: 'needs-permission', hosts: describeOrigins(event.origins) })
            break
          case 'started':
            total = event.sourceIds.length
            updatePanel({ phase: 'searching', total, done: 0 })
            break
          case 'outcome':
            checked += 1
            updatePanel({ phase: 'searching', total, done: checked })
            break
          case 'done':
            // Counted from what this search found, not from the merged verdict — the
            // page may already have supplied a claim, and that is not a deep-tier hit.
            updatePanel({ phase: 'finished', checked, found: event.foundCount }, event.verdict)
            break
          case 'error':
            updatePanel({ phase: 'error', reason: event.reason })
            break
        }
      })
    },
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
  const deep = deepSearchHandler(seed)

  mountBadge(anchor, badgeState(result.verdict), result.verdict, {
    ...(deep ? { onSearchWider: deep.onSearchWider } : {}),
    searchHosts: describeOrigins(requiredOrigins(SOURCES, seed)),
    // Closing the panel must stop the search, or it runs on with nothing to report to.
    ...(deep ? { onPanelClose: deep.cancel } : {}),
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
