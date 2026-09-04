import type {
  Agreement,
  Claim,
  ClaimKind,
  Confidence,
  Country,
  Evidence,
  OriginVerdict,
  ProductKey,
} from './types'

const WEIGHT: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }
const LADDER: readonly Confidence[] = ['low', 'medium', 'high']

const step = (c: Confidence, by: number): Confidence =>
  LADDER[Math.min(LADDER.length - 1, Math.max(0, LADDER.indexOf(c) + by))]

const best = (a: Confidence, b: Confidence): Confidence => (WEIGHT[a] >= WEIGHT[b] ? a : b)

export interface AggregateInput {
  productKey: ProductKey
  evidence: Evidence[]
  searchedDeep: boolean
}

interface Tally {
  country: Country
  weight: number
  sources: number
  best: Confidence
}

function tally(evidence: Evidence[]): Tally[] {
  const byCountry = new Map<string, Tally>()

  for (const item of evidence) {
    if (!item.country) continue
    const existing = byCountry.get(item.country.code)
    if (existing) {
      existing.weight += WEIGHT[item.confidence]
      existing.sources += 1
      existing.best = best(existing.best, item.confidence)
    } else {
      byCountry.set(item.country.code, {
        country: item.country,
        weight: WEIGHT[item.confidence],
        sources: 1,
        best: item.confidence,
      })
    }
  }

  // Deterministic: strongest first, then most corroborated, then by code so a genuine
  // tie does not reorder between runs.
  return [...byCountry.values()].sort(
    (a, b) =>
      b.weight - a.weight || b.sources - a.sources || a.country.code.localeCompare(b.country.code)
  )
}

function agreementOf(tallies: Tally[]): Agreement {
  const [leader, runnerUp] = tallies
  if (!runnerUp) return leader.sources === 1 ? 'single-source' : 'unanimous'
  return leader.weight > runnerUp.weight ? 'majority' : 'disputed'
}

/**
 * Confidence for the leading country.
 *
 * Corroboration may raise confidence by one step but can never manufacture `high` out
 * of weak sources: three `low` sources agreeing is `medium`, never `high`. A dispute
 * costs a step, because a contested answer is by definition less certain than an
 * uncontested one.
 */
function confidenceOf(leader: Tally, agreement: Agreement): Confidence {
  // Corroboration lifts `low` to `medium` and stops there. `high` has to come from a
  // source that was itself high-confidence; agreement between weak sources is not a
  // substitute for a good one.
  let confidence = leader.best === 'low' && leader.sources > 1 ? 'medium' : leader.best
  if (agreement === 'disputed') confidence = step(confidence, -1)
  return confidence
}

/**
 * Fold evidence into a verdict. Pure.
 *
 * Claims are grouped by kind and **never merged across kinds**: a brand's home country
 * is not a contradiction of a factory location, and treating the two as competing
 * manufactures a conflict that does not exist.
 *
 * Disputes are never settled by source priority — the prior art preferred the current
 * host, then `.com`, which is how it turned a disagreement into a confident wrong
 * answer. Here the leading country is chosen by evidence weight, the losing countries
 * stay visible in `alternatives`, and `agreement` says plainly that it is contested.
 */
export function aggregate({ productKey, evidence, searchedDeep }: AggregateInput): OriginVerdict {
  const claims: Partial<Record<ClaimKind, Claim>> = {}
  const kinds: ClaimKind[] = ['manufactured', 'brand-origin', 'shipped-from']

  for (const kind of kinds) {
    const tallies = tally(evidence.filter((e) => e.kind === kind))
    if (tallies.length === 0) continue

    const agreement = agreementOf(tallies)
    claims[kind] = {
      country: tallies[0].country,
      confidence: confidenceOf(tallies[0], agreement),
      agreement,
      alternatives: tallies.slice(1).map((t) => t.country),
    }
  }

  return { productKey, claims, evidence, searchedDeep }
}
