import type { Claim, ClaimKind, Country, OriginVerdict } from '../shared/origin'

/**
 * Why the badge is not showing a country. These are different failures and the user is
 * owed the difference: only one of them is ours.
 */
export type UnknownReason =
  /** The listing states no origin. The commonest case, and not a fault. */
  | 'not-stated'
  /** A field was found but no country could be read from it — that one is on us. */
  | 'unparsed'
  /** A country was found, but not on evidence strong enough to fly a flag. */
  | 'low-confidence'
  /** Brand or shipping origin is known, but not where it was made. */
  | 'other-claims-only'

export type BadgeState =
  | { kind: 'known'; claim: Claim; country: Country }
  | { kind: 'disputed'; claim: Claim; country: Country; alternatives: Country[] }
  | { kind: 'unknown'; reason: UnknownReason }
  | { kind: 'searching' }

/**
 * What the badge should show for a verdict.
 *
 * The badge answers one question — *where was this made* — so `manufactured` is the
 * headline and the other kinds live in the panel. A brand's home country on the badge
 * would be the prior art's central mistake wearing a different hat.
 *
 * **A flag is never shown on low confidence.** Not a flag with a caveat in a tooltip
 * nobody opens: no flag. The evidence is still one click away in the panel, which is
 * where a weak signal belongs.
 */
export function badgeState(verdict: OriginVerdict | null): BadgeState {
  if (!verdict) return { kind: 'unknown', reason: 'not-stated' }

  const claim = verdict.claims.manufactured
  if (!claim) {
    const others: ClaimKind[] = ['brand-origin', 'shipped-from']
    if (others.some((kind) => verdict.claims[kind])) {
      return { kind: 'unknown', reason: 'other-claims-only' }
    }
    // Evidence exists but named no country: the field was there and we could not read
    // it, or it named several. That is our failure, not the listing's silence.
    const consulted = verdict.evidence.length > 0
    return { kind: 'unknown', reason: consulted ? 'unparsed' : 'not-stated' }
  }

  if (claim.confidence === 'low') return { kind: 'unknown', reason: 'low-confidence' }

  if (claim.agreement === 'disputed' || claim.alternatives.length > 0) {
    return { kind: 'disputed', claim, country: claim.country, alternatives: claim.alternatives }
  }

  return { kind: 'known', claim, country: claim.country }
}

/** Short label for the badge itself. */
export function badgeLabel(state: BadgeState): string {
  switch (state.kind) {
    case 'known':
      return `${state.country.flag} ${state.country.name}`
    case 'disputed':
      return `${state.country.flag} ${state.country.name} — disputed`
    case 'searching':
      return 'Searching…'
    case 'unknown':
      return 'Origin unknown'
  }
}

/** One line saying what we do and do not know. Shown under the badge label. */
export function badgeDetail(state: BadgeState): string {
  switch (state.kind) {
    case 'known':
      return `Made in — ${state.claim.confidence} confidence`
    case 'disputed':
      return `Sources disagree: also ${state.alternatives.map((c) => c.name).join(', ')}`
    case 'searching':
      return 'Looking beyond this page'
    case 'unknown':
      switch (state.reason) {
        case 'not-stated':
          return 'This listing does not state an origin'
        case 'unparsed':
          return 'An origin field was found but could not be read'
        case 'low-confidence':
          return 'The only evidence is too weak to show a flag'
        case 'other-claims-only':
          return 'Brand or shipping origin known — but not where it was made'
      }
  }
}
