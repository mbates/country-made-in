import { extractOriginFields } from './adapters/extract'
import { extractIdentity } from './adapters/identity'
import { aggregate, resolveOrigin } from '../shared/origin'
import { marketplaceFromHostname } from '../shared/marketplaces'
import type { OriginCache } from '../shared/cache'
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
  return {
    kind: field.kind,
    country: resolution.status === 'resolved' ? resolution.mentions[0].country : null,
    sourceId: field.sectionId ?? 'amazon-page',
    sourceLabel: field.label,
    url,
    quote: field.rawText,
    confidence: field.confidence,
    retrievedAt: at,
  }
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
  now: () => Date = () => new Date()
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
  const evidence = extractOriginFields(doc).map((field) => fieldToEvidence(field, url, at))
  const verdict = aggregate({ productKey, evidence, searchedDeep: false })

  // A page with no origin field is cached too, on the shorter miss TTL — otherwise the
  // most common case is also the one that is re-parsed on every visit.
  await cache.put(productKey, verdict)

  return { productKey, verdict, fromCache: false }
}
