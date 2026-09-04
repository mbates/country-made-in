import { matchOriginLabel } from './labels'
import type { ClaimKind, Confidence } from '../../shared/origin'

export interface OriginField {
  /** The label exactly as the page wrote it. */
  label: string
  /** The value text, verbatim — handed to `resolveOrigin` untouched. */
  rawText: string
  /** Nearest identified region of the page, for the evidence trail. */
  sectionId: string | null
  kind: ClaimKind
  confidence: Confidence
}

const text = (node: Node | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Nearest ancestor carrying an id, so evidence can say where on the page it came from. */
function sectionOf(element: Element): string | null {
  return element.closest('[id]')?.id ?? null
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
    const labelCell = row.querySelector('th') ?? row.querySelector('td:first-child')
    const valueCell = row.querySelector('th')
      ? row.querySelector('td')
      : row.querySelector('td + td')
    if (!labelCell || !valueCell || labelCell === valueCell) continue

    const match = matchOriginLabel(text(labelCell))
    if (!match) continue

    // An empty cell is "not stated", not a claim. Amazon renders the label with a blank
    // value often enough that treating it as a finding would manufacture evidence.
    const rawText = text(valueCell)
    if (!rawText) continue

    found.push({
      label: text(labelCell),
      rawText,
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
        const value = sibling
          ? text(sibling)
          : text(item)
              .slice(label.length)
              .replace(/^[:：]\s*/, '')
        if (value) found.push({ label, rawText: value, sectionId: sectionOf(item), ...match })
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
    if (value) found.push({ label, rawText: value, sectionId: sectionOf(item), ...match })
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
    if (rawText) found.push({ label: text(term), rawText, sectionId: sectionOf(term), ...match })
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
