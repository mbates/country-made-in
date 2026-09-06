import { OriginCache } from '../shared/cache'
import { badgeState } from './badge-state'
import { findTitleAnchor, mountBadge } from './inject'
import { isActiveOn, loadSettings } from '../shared/settings'
import { marketplaceFromHostname } from '../shared/marketplaces'
import { observeListing } from './adapters/listing'
import { productAsin, runPassiveTier } from './passive'
import type { Settings } from '../shared/settings'

const TAG = '[country-made-in]'

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

  mountBadge(anchor, badgeState(result.verdict), result.verdict)
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

  // Tiles carry no origin data, so there is nothing to badge until the deep tier exists.
  // Observing now keeps the teardown path exercised; plan 05 fills in the callback.
  const stop = observeListing(document, () => {})
  addEventListener('pagehide', stop, { once: true })
}

void start().catch((error: unknown) => console.warn(`${TAG} failed to start`, error))
