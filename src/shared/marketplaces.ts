/**
 * The nine Amazon marketplaces the extension supports.
 *
 * The marketplace is part of a product's identity, not a display detail: the
 * same ASIN is a different product on different marketplaces, so anything
 * cached or compared has to carry the marketplace alongside the ASIN.
 */
export const MARKETPLACE_DOMAINS = [
  'amazon.com',
  'amazon.co.uk',
  'amazon.ca',
  'amazon.in',
  'amazon.de',
  'amazon.fr',
  'amazon.it',
  'amazon.es',
  'amazon.co.jp',
] as const

export type Marketplace = (typeof MARKETPLACE_DOMAINS)[number]

/**
 * Resolve a hostname to its marketplace, or `null` if it is not one of ours.
 *
 * Matching is anchored to a label boundary. A substring scan would accept
 * `notamazon.com` and `amazon.com.evil.test`, and `amazon.co.uk` would collide
 * with the `amazon.co` prefix of nothing useful — the whole class of bug this
 * project exists to avoid.
 */
export function marketplaceFromHostname(hostname: string): Marketplace | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  return MARKETPLACE_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`)) ?? null
}
