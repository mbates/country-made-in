import { normaliseLabel } from './labels'
import { rowCells, text } from './dom'

export interface ProductIdentity {
  asin: string | null
  /**
   * Normalised to GTIN-14 by left-padding with zeros, so a UPC-12 read on amazon.com
   * and the EAN-13 for the same product on amazon.de land on one key. This is the most
   * valuable field on the page: unlike an ASIN it means the same thing everywhere.
   */
  gtin: string | null
  /** The digits exactly as the page printed them, for the evidence trail. */
  gtinRaw: string | null
  brand: string | null
  manufacturer: string | null
  model: string | null
  title: string | null
  /**
   * "Imported by" / "Manufacturer address" blocks, which EU and India listings carry.
   * They frequently name a country when the dedicated field does not, so they are
   * collected here and interpreted later rather than parsed at extraction time.
   */
  addressHints: string[]
}

const LABELS: Record<'gtin' | 'brand' | 'manufacturer' | 'model' | 'address', readonly string[]> = {
  gtin: ['upc', 'ean', 'gtin', 'isbn-13', 'global trade item number'],
  brand: ['brand', 'brand name', 'marke', 'marque', 'marca'],
  manufacturer: ['manufacturer', 'hersteller', 'fabricant', 'fabbricante', 'fabricante'],
  model: ['model number', 'item model number', 'part number', 'modellnummer', 'modelo'],
  address: [
    'manufacturer contact information',
    'importer',
    'imported by',
    'packer',
    'manufacturer address',
    'responsible person',
    'eu responsible person',
  ],
}

const INDEX = new Map<string, keyof typeof LABELS>()
for (const [field, aliases] of Object.entries(LABELS)) {
  for (const alias of aliases) INDEX.set(normaliseLabel(alias), field as keyof typeof LABELS)
}

/**
 * True when the digits carry a valid GTIN check digit.
 *
 * A mistyped barcode is worse than no barcode: the whole point of a GTIN is that it is
 * a global key, so a wrong one silently attaches this product's origin to a different
 * product on every other marketplace. The check digit costs nothing to verify.
 */
export function isValidGtin(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false
  const body = digits.slice(0, -1)
  const check = Number(digits[digits.length - 1])
  let sum = 0
  // Weights alternate 3,1 from the rightmost body digit.
  for (const [i, digit] of [...body].reverse().entries()) {
    sum += Number(digit) * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === check
}

/** GTIN-14, or `null` when the digits are not a valid GTIN. */
export function normaliseGtin(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '')
  return isValidGtin(digits) ? digits.padStart(14, '0') : null
}

function asinFrom(url: string, root: ParentNode): string | null {
  const fromUrl = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1]
  if (fromUrl) return fromUrl
  const attr = root.querySelector('[data-asin]')?.getAttribute('data-asin')?.trim()
  return attr && /^[A-Z0-9]{10}$/.test(attr) ? attr : null
}

/**
 * Seed data for the deep tier, harvested from the page the user is already on.
 *
 * Every field is optional. A missing value is reported as `null` rather than guessed —
 * the deep tier can work with less, but not with something wrong.
 */
export function extractIdentity(root: ParentNode, url: string): ProductIdentity {
  const identity: ProductIdentity = {
    asin: asinFrom(url, root),
    gtin: null,
    gtinRaw: null,
    brand: null,
    manufacturer: null,
    model: null,
    title: text(root.querySelector('#productTitle')) || null,
    addressHints: [],
  }

  for (const row of root.querySelectorAll('tr')) {
    const cells = rowCells(row)
    if (!cells) continue

    const field = INDEX.get(normaliseLabel(text(cells.label)))
    const value = text(cells.value)
    if (!field || !value) continue

    if (field === 'address') {
      if (!identity.addressHints.includes(value)) identity.addressHints.push(value)
    } else if (field === 'gtin') {
      const normalised = normaliseGtin(value)
      if (normalised && !identity.gtin) {
        identity.gtin = normalised
        identity.gtinRaw = value
      }
    } else if (!identity[field]) {
      identity[field] = value
    }
  }

  return identity
}
