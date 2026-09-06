/**
 * Stable identities for the places a claim can be read from.
 *
 * The bug this replaced was a source id that no setting could ever match — Amazon's
 * enclosing element id, which changes without notice. Naming them in one place, shared by
 * the extractor and the settings UI, is what stops a typo reintroducing that silently.
 *
 * `Evidence.sourceId` stays a plain string: plan 05 adds sources this module knows
 * nothing about, and a closed union there would have to be edited from two directions.
 */
export const ORIGIN_SOURCES = [
  'amazon-detail-table',
  'amazon-detail-bullets',
  'amazon-definition-list',
] as const

export type OriginSourceId = (typeof ORIGIN_SOURCES)[number]
