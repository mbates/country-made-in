import { MARKETPLACE_DOMAINS } from './marketplaces'
import type { Marketplace } from './marketplaces'
import type { StorageArea } from './cache'

/**
 * How many badges to put on a search or category page.
 *
 * Tiles carry no origin data, so every badge there is an "unknown — check" affordance
 * rather than an answer. Some people want the prompt everywhere; most will not, so the
 * default is off and the product page alone.
 */
export type BadgeDensity = 'off' | 'unknown-only' | 'all'

export interface Settings {
  enabled: boolean
  /** Per-marketplace opt-out. Absent keys mean enabled. */
  marketplaces: Partial<Record<Marketplace, boolean>>
  listingBadges: BadgeDensity
  /** Ask before every wider search, rather than reusing an earlier permission grant. */
  confirmDeepSearch: boolean
  /** Per-source opt-out, keyed by `Evidence.sourceId`. Absent keys mean enabled. */
  sources: Record<string, boolean>
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  marketplaces: {},
  listingBadges: 'off',
  // Defaults to asking. A wider search costs network and host permissions, and a user
  // who has forgotten granting it should not have it happen silently.
  confirmDeepSearch: true,
  sources: {},
}

const KEY = 'settings'

const area = (): StorageArea => chrome.storage.sync as unknown as StorageArea

export async function loadSettings(storage: StorageArea = area()): Promise<Settings> {
  const raw = await storage.get([KEY])
  const stored = (raw[KEY] as Partial<Settings> | undefined) ?? {}
  // Merged over the defaults rather than replacing them, so a setting added in a later
  // version does not read as `undefined` for everyone who already has stored settings.
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    marketplaces: { ...DEFAULT_SETTINGS.marketplaces, ...stored.marketplaces },
    sources: { ...DEFAULT_SETTINGS.sources, ...stored.sources },
  }
}

export async function saveSettings(
  patch: Partial<Settings>,
  storage: StorageArea = area()
): Promise<Settings> {
  const next = { ...(await loadSettings(storage)), ...patch }
  await storage.set({ [KEY]: next })
  return next
}

/** Whether the extension should do anything at all on this marketplace. */
export function isActiveOn(settings: Settings, marketplace: Marketplace | null): boolean {
  if (!settings.enabled || !marketplace) return false
  return settings.marketplaces[marketplace] !== false
}

/** Whether a source's evidence should be gathered. */
export function isSourceEnabled(settings: Settings, sourceId: string): boolean {
  return settings.sources[sourceId] !== false
}

export const ALL_MARKETPLACES = MARKETPLACE_DOMAINS
