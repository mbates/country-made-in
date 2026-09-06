import type { ProductSeed } from './deep/source'
import type { SourceOutcome } from './deep/source'
import type { OriginVerdict } from './origin'

/** The long-lived port name the content script opens for a wider search. */
export const DEEP_SEARCH_PORT = 'country-made-in:deep-search'

/** Content script → service worker. */
export type DeepSearchRequest = { type: 'start'; seed: ProductSeed } | { type: 'cancel' }

/**
 * Service worker → content script, streamed.
 *
 * Outcomes arrive one at a time so the panel fills in as sources answer, rather than
 * showing a spinner until everything has finished.
 */
export type DeepSearchEvent =
  | { type: 'started'; sourceIds: string[] }
  | { type: 'outcome'; outcome: SourceOutcome }
  /** `foundCount` is what *this* search turned up, not the merged total. */
  | { type: 'done'; verdict: OriginVerdict; foundCount: number }
  /** The origins have not been granted. The grant is made from the options page. */
  | { type: 'needs-permission'; origins: string[] }
  | { type: 'error'; reason: string }
