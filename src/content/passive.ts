import { extractOriginFields } from './adapters/extract'
import { extractIdentity } from './adapters/identity'
import { aggregate, resolveOrigin } from '../shared/origin'
import { marketplaceFromHostname } from '../shared/marketplaces'
import { isSourceEnabled } from '../shared/settings'
import type { OriginCache } from '../shared/cache'
import type { Settings } from '../shared/settings'
import type { Evidence, OriginVerdict, ProductKey } from '../shared/origin'
import type { OriginField } from './adapters/extract'

/** ASIN from a product-detail URL, or null if this is not one. */
export function productAsin(url: string): string | null {
  return url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null
}

/**
 * One field becomes one piece of evidence.
 *
 * An ambiguous value ("China / Vietnam") yields evidence with no country but with the
 * quote intact. That is deliberately not the same as finding nothing: the source was
 * consulted and said something, and the panel should show what it said rather than
 * pretend the field was absent.
 */
export function fieldToEvidence(field: OriginField, url: string, at: string): Evidence {
  const resolution = resolveOrigin(field.rawText)

  // Take the mention that answers *this* field's question, not simply the first country
  // in the text. "Designed in Japan, Made in China" under a Country of Origin label names
  // two countries, and only one of them was manufactured there; taking mentions[0] would
  // report Japan with high confidence — the exact class of confident wrong answer this
  // project exists to eliminate. An unqualified mention only counts when it stands alone.
  const country =
    resolution.status !== 'resolved'
      ? null
      : ((
          resolution.mentions.find((mention) => mention.kind === field.kind) ??
          (resolution.mentions.length === 1 ? resolution.mentions[0] : null)
        )?.country ?? null)

  return {
    kind: field.kind,
    country,
    sourceId: field.sourceId,
    sourceLabel: field.label,
    url,
    quote: field.rawText,
    confidence: field.confidence,
    retrievedAt: at,
  }
}

/**
 * Whether the page rendered somewhere an origin field could have been.
 *
 * Distinguishes "this product states no origin" from "the details had not loaded when we
 * looked". Only the first is worth remembering.
 */
export function hasDetailsRegion(doc: ParentNode): boolean {
  return (
    doc.querySelector(
      '#prodDetails, #detailBullets_feature_div, #detailBulletsWrapper_feature_div, ' +
        '#productDetails_feature_div, #productDetails_db_sections, ' +
        '#technicalSpecifications_section_1, table.prodDetTable, .detail-bullet-list'
    ) !== null
  )
}

export interface PassiveResult {
  productKey: ProductKey
  verdict: OriginVerdict
  fromCache: boolean
}

/**
 * The passive tier: read the page the user is already looking at.
 *
 * Makes no network request of any kind. It reads the DOM and the local cache, and
 * nothing else — which is what lets it run on every product page without asking for
 * anything at install time.
 */
export async function runPassiveTier(
  doc: Document,
  url: string,
  hostname: string,
  cache: OriginCache,
  now: () => Date = () => new Date(),
  settings?: Settings
): Promise<PassiveResult | null> {
  const marketplace = marketplaceFromHostname(hostname)
  const asin = productAsin(url)
  if (!marketplace || !asin) return null

  const identity = extractIdentity(doc, url)
  const productKey: ProductKey = {
    marketplace,
    asin,
    ...(identity.gtin ? { gtin: identity.gtin } : {}),
  }

  const cached = await cache.get(productKey)
  if (cached) return { productKey, verdict: cached, fromCache: true }

  const at = now().toISOString()
  const evidence = extractOriginFields(doc)
    .map((field) => fieldToEvidence(field, url, at))
    // A source the user has switched off contributes nothing — not weaker evidence, none.
    .filter((item) => !settings || isSourceEnabled(settings, item.sourceId))
  const verdict = aggregate({ productKey, evidence, searchedDeep: false })

  // A page with no origin field is cached on the shorter miss TTL — otherwise the most
  // common case is also the one re-parsed on every visit.
  //
  // But only when the details region actually rendered. The tier runs once, and storing
  // "not stated" from a page whose details had not arrived yet would answer that product
  // wrongly for a week, with nothing short of a CACHE_VERSION bump able to retract it.
  if (Object.keys(verdict.claims).length > 0 || hasDetailsRegion(doc)) {
    await cache.put(productKey, verdict)
  }

  return { productKey, verdict, fromCache: false }
}
