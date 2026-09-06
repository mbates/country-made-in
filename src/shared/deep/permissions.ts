/**
 * Optional host permissions for the wider search.
 *
 * **These functions only work in an extension page — the popup or the options page.**
 * A content script cannot reach `chrome.permissions` at all: it gets `chrome.dom`,
 * `chrome.i18n`, `chrome.storage` and part of `chrome.runtime`, and nothing else. And a
 * service worker, which does have the API, has no user gesture, which
 * `chrome.permissions.request()` requires.
 *
 * The options page is the only context with both, which is why plan 05-02's "always
 * allow the wider search" control lives there rather than on the button itself.
 *
 * Nothing is declared in the manifest yet: with an empty source registry there are no
 * origins to ask for, and the minimal declaration for zero origins is none. The origins
 * are added to `optional_host_permissions` when the sources that need them pass the
 * 05-01 coverage gate.
 */
export interface PermissionApi {
  contains(p: { origins: string[] }): Promise<boolean>
  request(p: { origins: string[] }): Promise<boolean>
  remove(p: { origins: string[] }): Promise<boolean>
}

const api = (): PermissionApi => chrome.permissions as unknown as PermissionApi

/** Whether the origins are already granted. Safe to call from the service worker. */
export async function hasOrigins(
  origins: readonly string[],
  permissions: PermissionApi = api()
): Promise<boolean> {
  if (origins.length === 0) return true
  try {
    return await permissions.contains({ origins: [...origins] })
  } catch (error) {
    console.warn('[country-made-in] permission check failed', error)
    return false
  }
}

/**
 * Ask for the origins. **Extension pages only, from inside a click handler.**
 *
 * Refusal is a first-class outcome, not an error: the passive tier keeps working and the
 * control stays available, so a user who says no once is not locked out.
 */
export async function requestOrigins(
  origins: readonly string[],
  permissions: PermissionApi = api()
): Promise<boolean> {
  if (origins.length === 0) return true
  try {
    return await permissions.request({ origins: [...origins] })
  } catch (error) {
    // Chrome rejects a request made outside a user gesture, or from a context without
    // the API. Either is a bug in the caller, but it must degrade rather than throw.
    console.warn('[country-made-in] permission request failed', error)
    return false
  }
}

/** Give the origins back. The grant should be revocable from the same place it was made. */
export async function revokeOrigins(
  origins: readonly string[],
  permissions: PermissionApi = api()
): Promise<boolean> {
  if (origins.length === 0) return true
  try {
    return await permissions.remove({ origins: [...origins] })
  } catch (error) {
    console.warn('[country-made-in] permission removal failed', error)
    return false
  }
}

/** Human-readable host list for the copy shown before Chrome's prompt appears. */
export function describeOrigins(origins: readonly string[]): string[] {
  return [
    ...new Set(
      origins.map((origin) =>
        origin
          .replace(/^\*:\/\/|^https?:\/\//, '')
          .replace(/\/\*$/, '')
          .replace(/^\*\./, '')
      )
    ),
  ].sort()
}
