import { foldToText } from '../../shared/origin/fold'
import type { ClaimKind, Confidence } from '../../shared/origin'

export interface LabelSpec {
  /** Label text as a page might write it. Compared folded, so accents and case are free. */
  readonly aliases: readonly string[]
  readonly kind: ClaimKind
  /**
   * How much the label itself is worth, before anything looks at the value.
   *
   * A label that explicitly asserts manufacture is worth more than one that merely
   * mentions a country, and that difference has to survive into the verdict — plan 04
   * renders low confidence as "unknown" rather than a flag, so a weak label cannot
   * produce a confident wrong answer.
   */
  readonly confidence: Confidence
}

/**
 * The labels Amazon uses for origin, across the nine marketplaces.
 *
 * English labels are kept as a fallback for every locale, because Amazon's own
 * non-English pages are inconsistent about which they render.
 *
 * `Country/Region of Origin` is the one that matters most: it is the form the prior
 * art's extractor breaks on, and it is common.
 */
export const ORIGIN_LABELS: readonly LabelSpec[] = [
  {
    aliases: [
      'country of origin',
      'country/region of origin',
      'country / region of origin',
      'country or region of origin',
      'origin',
      // de, fr, it, es, ja
      'ursprungsland',
      'herkunftsland',
      'ursprungsland/-region',
      "pays d'origine",
      'pays dorigine',
      'paese di origine',
      "paese d'origine",
      'pais de origen',
      'pais o region de origen',
      '原産国',
      '原産国名',
    ],
    kind: 'manufactured',
    confidence: 'high',
  },
  {
    // A media attribute sellers routinely misapply to physical goods. The value is
    // usually the real origin, but the label does not assert manufacture, so it is
    // recorded as weak evidence rather than treated as a declaration.
    aliases: ['country of publication', 'publication country'],
    kind: 'manufactured',
    confidence: 'low',
  },
  {
    aliases: ['imported from', 'ships from', 'shipped from', 'dispatched from', 'sold from'],
    kind: 'shipped-from',
    confidence: 'medium',
  },
]

interface Resolved {
  readonly kind: ClaimKind
  readonly confidence: Confidence
}

const INDEX = new Map<string, Resolved>()
for (const spec of ORIGIN_LABELS) {
  for (const alias of spec.aliases) {
    INDEX.set(foldToText(alias), { kind: spec.kind, confidence: spec.confidence })
  }
}

/**
 * Match a label by normalised text rather than a literal substring.
 *
 * Trailing colons and full-width colons are stripped, whitespace collapses, and accents
 * fold — which is what makes `Country/Region of Origin:` and `País de origen` both
 * resolve without a separate entry for every punctuation variant.
 */
export function matchOriginLabel(label: string): Resolved | null {
  const normalised = foldToText(label.replace(/[:：]\s*$/, ''))
  return INDEX.get(normalised) ?? null
}
