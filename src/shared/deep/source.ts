import type { Evidence } from '../origin'
import type { Marketplace } from '../marketplaces'

/**
 * What a source is given to search on.
 *
 * Product identifiers only. Never the user's email, their Amazon session, a cookie, or
 * anything about what else they have looked at — a source is a third party, and the
 * extension's whole privacy claim is that nothing identifying leaves the browser.
 */
export interface ProductSeed {
  marketplace: Marketplace
  asin: string
  /** GTIN-14. The only identifier that means the same thing to a third party. */
  gtin?: string
  brand?: string
  manufacturer?: string
  model?: string
  title?: string
}

export interface OriginSource {
  id: string
  label: string
  /** Origins this source needs permission to fetch, for the permission prompt. */
  origins: readonly string[]
  /** Cheap precondition. Skip sources that cannot apply to this product at all. */
  applies(seed: ProductSeed): boolean
  /**
   * Evidence this source found. `[]` is a valid, useful answer: "we asked and it said
   * nothing" is information.
   *
   * Must not throw — the orchestrator treats a rejection as a failed source rather than
   * letting it end the search, but a source that resolves cleanly reports better.
   */
  search(seed: ProductSeed, signal: AbortSignal): Promise<Evidence[]>
}

/** How one source finished. Every source reports one of these, including the failures. */
export type SourceOutcome =
  | { sourceId: string; status: 'found'; evidence: Evidence[] }
  /** Asked, answered, stated no origin. Not a failure. */
  | { sourceId: string; status: 'nothing' }
  | { sourceId: string; status: 'skipped'; reason: string }
  | { sourceId: string; status: 'failed'; reason: string }
  | { sourceId: string; status: 'timeout' }
