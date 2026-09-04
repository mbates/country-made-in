import type { Marketplace } from '../marketplaces'

type Letter =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'

/** ISO 3166-1 alpha-2 code, e.g. `GB`. */
export type Alpha2 = `${Letter}${Letter}`

export interface Country {
  code: Alpha2
  name: string
  /** Emoji derived from the alpha-2 code — no flag assets, and no third-party image host. */
  flag: string
}

/**
 * "Country of origin" is three questions, not one. Collapsing them into a single
 * answer is the central failure of the prior art: a brand's home country is not a
 * contradiction of a factory location, and presenting either as "made in" is wrong.
 */
export type ClaimKind =
  | 'manufactured' // made or assembled there — what users usually mean
  | 'brand-origin' // the brand or company's home country
  | 'shipped-from' // the export country on a shipment record

export type Confidence = 'high' | 'medium' | 'low'

export type Agreement = 'unanimous' | 'majority' | 'disputed' | 'single-source'

/**
 * Identifies a product. **The marketplace is part of the key.** The same ASIN is a
 * different product on different Amazon domains; the prior art cached on the bare
 * ASIN, which is why an answer derived on one domain followed the user to another.
 */
export interface ProductKey {
  marketplace: Marketplace
  asin: string
  gtin?: string
}

/** One thing one source said. The user must be able to check every one of these. */
export interface Evidence {
  kind: ClaimKind
  /** `null` means the source was consulted and stated nothing — not that it was skipped. */
  country: Country | null
  sourceId: string
  sourceLabel: string
  url: string | null
  /** The raw text we read, verbatim. */
  quote: string | null
  confidence: Confidence
  /** ISO 8601. */
  retrievedAt: string
}

export interface Claim {
  country: Country
  confidence: Confidence
  agreement: Agreement
  /**
   * Other countries claimed for this kind, strongest first. Non-empty only when
   * `agreement` is `majority` or `disputed`. The UI must show these rather than
   * present `country` as settled.
   */
  alternatives: Country[]
}

export interface OriginVerdict {
  productKey: ProductKey
  claims: Partial<Record<ClaimKind, Claim>>
  evidence: Evidence[]
  searchedDeep: boolean
}
