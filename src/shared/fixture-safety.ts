/**
 * What a committed fixture must never contain.
 *
 * Fixtures are captured from a browser and committed to a **public** repo. Amazon parks
 * session state in hidden form inputs and in attributes a few nodes from the origin
 * field — a real capture for this project carried `customerId`, `aapiCsrfToken` and
 * `isCustomerLoggedIn`.
 *
 * Patterns cover the separator variants, because the spelling that leaked is not the
 * only spelling: `customerId`, `customer-id` and `customer_id` are the same identifier.
 *
 * Lives in `src/` rather than `scripts/` so both the scrubber and the test suite can
 * import it. It is data, not behaviour, and the one list guarding a public repo should
 * itself be tested.
 */
export interface SensitivePattern {
  name: string
  pattern: RegExp
}

export const SENSITIVE_PATTERNS: readonly SensitivePattern[] = [
  { name: 'customer id', pattern: /customer[-_]?id/i },
  { name: 'login state', pattern: /is[-_]?customer[-_]?logged[-_]?in/i },
  { name: 'CSRF token', pattern: /csrf/i },
  { name: 'session id', pattern: /session[-_]?id/i },
  { name: 'session token', pattern: /session[-_]?token/i },
  { name: 'ubid cookie', pattern: /\bubid\b/i },
  { name: 'amz token', pattern: /x-amz-(?:access-token|security-token)/i },
  { name: 'request id', pattern: /pd_rd_r[-=]/i },
  { name: 'click-stream id', pattern: /data-csa-c-id/i },
  { name: 'inline event handler', pattern: /\son[a-z]+\s*=/i },
  { name: 'form control', pattern: /<(?:form|input|select|textarea|button)\b/i },
  { name: 'script or style', pattern: /<(?:script|style)\b/i },
  { name: 'extension URL', pattern: /chrome-extension:\/\//i },
]

/**
 * Attributes a fixture is allowed to keep.
 *
 * An allowlist, not a denylist: the leak that happened was an attribute nobody had
 * thought to name, and the next one will be too. Everything here is either structural or
 * something an extractor legitimately reads.
 */
export const ALLOWED_ATTRIBUTES: readonly string[] = [
  'id',
  'class',
  'lang',
  'dir',
  'role',
  'colspan',
  'rowspan',
  'data-asin',
  'data-feature-name',
  'rel',
  'charset',
]

/**
 * Class-name tokens that are per-request identifiers rather than styling hooks.
 *
 * `class` has to survive — the extractors select on `.a-text-bold`, `.prodDetTable` and
 * `.detail-bullet-list` — but Amazon threads its click-stream ids through the same
 * attribute (`pd_rd_r-2BSDB6WNYXF2P6BBT9WF`), so the tokens are filtered individually.
 */
export const CLASS_TOKEN_BLOCKLIST: readonly RegExp[] = [/^pd_rd_/i, /[A-Z0-9]{12,}/]

/** A class attribute with per-request identifier tokens removed. */
export function scrubClassValue(value: string): string {
  return value
    .split(/\s+/)
    .filter((token) => token !== '' && !CLASS_TOKEN_BLOCKLIST.some((p) => p.test(token)))
    .join(' ')
}

/** Every pattern the text matches. Empty means clean. */
export function findSensitive(html: string): SensitivePattern[] {
  return SENSITIVE_PATTERNS.filter(({ pattern }) => pattern.test(html))
}
