import { OriginCache } from '../shared/cache'
import { observeListing } from './adapters/listing'
import { marketplaceFromHostname } from '../shared/marketplaces'
import { productAsin, runPassiveTier } from './passive'

/**
 * Content script entry point.
 *
 * The badge and panel arrive in plan 04. Until then the passive tier runs and reports to
 * the console, so its behaviour on real pages can be checked against what the page
 * actually says.
 */
const marketplace = marketplaceFromHostname(location.hostname)

if (marketplace) {
  const tag = '[country-made-in]'

  if (productAsin(location.href)) {
    void runPassiveTier(document, location.href, location.hostname, new OriginCache())
      .then((result) => {
        if (!result) return
        const { verdict, fromCache } = result
        const claims = Object.entries(verdict.claims)
        if (claims.length === 0) {
          console.info(`${tag} ${result.productKey.asin}: no origin stated on this page`)
          return
        }
        for (const [kind, claim] of claims) {
          console.info(
            `${tag} ${kind}: ${claim.country.flag} ${claim.country.name} ` +
              `(${claim.confidence} confidence, ${claim.agreement}${fromCache ? ', cached' : ''})`
          )
        }
        console.info(`${tag} evidence`, verdict.evidence)
      })
      .catch((error: unknown) => console.warn(`${tag} passive tier failed`, error))
  } else {
    const stop = observeListing(document, (tiles) => {
      console.info(`${tag} ${tiles.length} product tiles seen; origin needs a wider search`)
    })
    addEventListener('pagehide', stop, { once: true })
  }
}
