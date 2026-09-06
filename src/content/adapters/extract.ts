import { matchOriginLabel } from './labels'
import { rowCells, sectionOf, text } from './dom'
import type { ClaimKind, Confidence } from '../../shared/origin'

/**
 * Which shape of markup a field was read from.
 *
 * Stable and enumerable, unlike the id of whatever Amazon element happens to enclose it
 * — those change without notice and cannot be listed in advance, so a per-source setting
 * keyed on them would silently match nothing.
 */
export type OriginSourceId =
  'amazon-detail-table' | 'amazon-detail-bullets' | 'amazon-definition-list'

export interface OriginField {
  /** The label exactly as the page wrote it. */
  label: string
  /** The value text, verbatim — handed to `resolveOrigin` untouched. */
  rawText: string
  /** Stable identity of the markup shape this came from. */
  sourceId: OriginSourceId
  /** Nearest identified region of the page. Context only — Amazon's id, so unstable. */
  sectionId: string | null
  kind: ClaimKind
  confidence: Confidence
}

/**
 * `<tr><th>Country of Origin</th><td>China</td></tr>`.
 *
 * The value is taken by DOM relationship — the row's own cell — not by string offset.
 * The prior art regexed raw HTML with a greedy lookbehind whose capture start depends on
 * surrounding markup, which is why it returns plausible-looking values read from an
 * arbitrary position.
 */
function fromTableRows(root: ParentNode): OriginField[] {
  const found: OriginField[] = []
  for (const row of root.querySelectorAll('tr')) {
    const cells = rowCells(row)
    if (!cells) continue

    const match = matchOriginLabel(text(cells.label))
    if (!match) continue

    // An empty cell is "not stated", not a claim. Amazon renders the label with a blank
    // value often enough that treating it as a finding would manufacture evidence.
    const rawText = text(cells.value)
    if (!rawText) continue

    found.push({
      label: text(cells.label),
      rawText,
      sourceId: 'amazon-detail-table',
      sectionId: sectionOf(row),
      ...match,
    })
  }
  return found
}

/**
 * `<li><span class="a-text-bold">Country of Origin :</span><span>China</span></li>`.
 *
 * Amazon's detail bullets put the label in a bold span and the value in its sibling.
 * Where there is no sibling the label and value share one text node, so the text is
 * split on the first colon — and only then, never as a general fallback.
 */
function fromDetailBullets(root: ParentNode): OriginField[] {
  const found: OriginField[] = []
  for (const item of root.querySelectorAll('li')) {
    if (item.querySelector('li')) continue // outer list wrapper, not a row

    const bold = item.querySelector('.a-text-bold, b, strong, dt')
    if (bold) {
      const label = text(bold)
      const match = matchOriginLabel(label)
      if (match) {
        const sibling = bold.nextElementSibling
        // Cut where the label actually sits, not at its length. A bullet can open with a
        // marker span, and slicing by length then shifts into the value — enough of a
        // prefix and the country itself is truncated away.
        const whole = text(item)
        const at = whole.indexOf(label)
        const value = sibling
          ? text(sibling)
          : whole.slice(at === -1 ? label.length : at + label.length).replace(/^\s*[:：]?\s*/, '')
        if (value) {
          found.push({
            label,
            rawText: value,
            sourceId: 'amazon-detail-bullets',
            sectionId: sectionOf(item),
            ...match,
          })
        }
        continue
      }
    }

    const whole = text(item)
    const split = whole.indexOf(':')
    if (split === -1) continue
    const label = whole.slice(0, split)
    const match = matchOriginLabel(label)
    if (!match) continue
    const value = whole.slice(split + 1).trim()
    if (value) {
      found.push({
        label,
        rawText: value,
        sourceId: 'amazon-detail-bullets',
        sectionId: sectionOf(item),
        ...match,
      })
    }
  }
  return found
}

/** `<dt>Country of Origin</dt><dd>China</dd>`. */
function fromDefinitionLists(root: ParentNode): OriginField[] {
  const found: OriginField[] = []
  for (const term of root.querySelectorAll('dt')) {
    const match = matchOriginLabel(text(term))
    if (!match) continue
    const value = term.nextElementSibling
    if (value?.tagName.toLowerCase() !== 'dd') continue
    const rawText = text(value)
    if (rawText) {
      found.push({
        label: text(term),
        rawText,
        sourceId: 'amazon-definition-list',
        sectionId: sectionOf(term),
        ...match,
      })
    }
  }
  return found
}

/**
 * Every origin field on the page.
 *
 * Extraction and interpretation stay separate: this returns the text the page shows and
 * nothing more. Deciding what country that text names is `resolveOrigin`'s job, and the
 * two are separately testable because of it.
 *
 * Returns an empty array when the page states no origin — which is the most common case,
 * and the one where a guess does the most damage.
 */
export function extractOriginFields(root: ParentNode): OriginField[] {
  const all = [...fromTableRows(root), ...fromDetailBullets(root), ...fromDefinitionLists(root)]

  // The same field often appears in two sections of an Amazon page.
  const seen = new Set<string>()
  return all.filter((field) => {
    const key = `${field.kind}|${field.label.toLowerCase()}|${field.rawText.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
