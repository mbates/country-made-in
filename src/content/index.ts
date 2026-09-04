import { marketplaceFromHostname } from '../shared/marketplaces'

/**
 * Content script. Page extraction and badge injection land in plans 03 and 04.
 * For now it only resolves which marketplace it was injected into, which is the
 * first thing every later step depends on.
 */
const marketplace = marketplaceFromHostname(location.hostname)

if (marketplace) {
  console.info(`[country-made-in] active on ${marketplace}`)
}
