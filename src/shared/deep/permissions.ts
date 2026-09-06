/**
 * Host permissions for the wider search.
 *
 * These are `optional_host_permissions`, requested at the moment of use rather than
 * declared at install. Asking for broad host access up front is both a privacy
 * imposition — the extension would hold it whether or not it was ever used — and the
 * question a Chrome Web Store reviewer asks first.
 *
 * `chrome.permissions.request()` requires a user gesture, so it can only be called
 * synchronously from a click handler. Anything awaited before the call loses the gesture
 * and the request is rejected, which is why `requestOrigins` takes the origins already
 * computed rather than working them out itself.
 */
export interface PermissionApi {
  contains(p: { origins: string[] }): Promise<boolean>
  request(p: { origins: string[] }): Promise<boolean>
}

const api = (): PermissionApi => chrome.permissions as unknown as PermissionApi

export async function hasOrigins(
  origins: readonly string[],
  permissions: PermissionApi = api()
): Promise<boolean> {
  if (origins.length === 0) return true
  return permissions.contains({ origins: [...origins] })
}

/**
 * Ask for the origins. Returns whether they were granted.
 *
 * **Must be called synchronously from a click handler.** Refusal is a first-class
 * outcome, not an error: the passive tier keeps working and the button stays available,
 * so a user who says no once is not locked out.
 */
export async function requestOrigins(
  origins: readonly string[],
  permissions: PermissionApi = api()
): Promise<boolean> {
  if (origins.length === 0) return true
  try {
    return await permissions.request({ origins: [...origins] })
  } catch (error) {
    // Chrome rejects a request made without a user gesture. That is a bug in the caller,
    // but it must degrade to "not granted" rather than breaking the panel.
    console.warn('[country-made-in] permission request failed', error)
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
