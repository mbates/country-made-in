/** Collapsed, trimmed text of a node. */
export const text = (node: Node | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Nearest ancestor carrying an id, so evidence can say where on the page it came from. */
export function sectionOf(element: Element): string | null {
  return element.closest('[id]')?.id ?? null
}

export interface LabelledCell {
  label: Element
  value: Element
}

/**
 * The label and value cells of a table row, or `null` when the row has neither.
 *
 * Scoped to the row's **direct children**. `row.querySelector('th')` searches
 * descendants, so a row wrapping a nested table matches that table's label and pairs it
 * with the outer row's own cell — inventing a second field for one stated fact, which
 * `aggregate` then reports as corroboration.
 *
 * The value is the first non-empty cell *after* the label, not simply the first `td`:
 * a row can carry a leading `td` before the label, or an empty spacer cell after it.
 */
export function rowCells(row: Element): LabelledCell | null {
  const cells = [...row.children].filter((el) => /^(?:th|td)$/i.test(el.tagName))
  if (cells.length < 2) return null

  const labelIndex = cells.findIndex((cell) => cell.tagName.toLowerCase() === 'th')
  const label = labelIndex === -1 ? cells[0] : cells[labelIndex]
  const value = cells
    .slice((labelIndex === -1 ? 0 : labelIndex) + 1)
    .find((cell) => text(cell) !== '')

  return value ? { label, value } : null
}
