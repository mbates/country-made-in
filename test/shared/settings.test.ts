import { beforeEach, describe, expect, it } from 'vitest'
import {
  ALL_MARKETPLACES,
  DEFAULT_SETTINGS,
  isActiveOn,
  isSourceEnabled,
  loadSettings,
  saveSettings,
} from '../../src/shared/settings'
import type { StorageArea } from '../../src/shared/cache'

class FakeStorage implements StorageArea {
  data: Record<string, unknown> = {}
  async get(keys: string[]) {
    return Object.fromEntries(keys.filter((k) => k in this.data).map((k) => [k, this.data[k]]))
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, items)
  }
}

let storage: FakeStorage
beforeEach(() => {
  storage = new FakeStorage()
})

describe('defaults', () => {
  it('is on, with every marketplace enabled', async () => {
    const settings = await loadSettings(storage)
    expect(settings.enabled).toBe(true)
    for (const marketplace of ALL_MARKETPLACES) {
      expect(isActiveOn(settings, marketplace)).toBe(true)
    }
  })

  it('keeps listing badges off, since a tile badge is never an answer', async () => {
    expect((await loadSettings(storage)).listingBadges).toBe('off')
  })

  it('asks before a wider search', async () => {
    // A search that reads other sites should not happen silently on an old grant.
    expect((await loadSettings(storage)).confirmDeepSearch).toBe(true)
  })
})

describe('persistence', () => {
  it('round-trips a change', async () => {
    await saveSettings({ enabled: false }, storage)
    expect((await loadSettings(storage)).enabled).toBe(false)
  })

  it('leaves untouched settings alone', async () => {
    await saveSettings({ enabled: false }, storage)
    await saveSettings({ listingBadges: 'all' }, storage)
    const settings = await loadSettings(storage)
    expect(settings.enabled).toBe(false)
    expect(settings.listingBadges).toBe('all')
  })

  it('fills in settings added after the stored version was written', async () => {
    // An older install has no `confirmDeepSearch`; it must read as the default, not
    // undefined, or the wider search would stop asking.
    storage.data.settings = { enabled: true }
    const settings = await loadSettings(storage)
    expect(settings.confirmDeepSearch).toBe(DEFAULT_SETTINGS.confirmDeepSearch)
    expect(settings.listingBadges).toBe(DEFAULT_SETTINGS.listingBadges)
  })
})

describe('isActiveOn', () => {
  it('is false everywhere when the extension is off', async () => {
    const settings = await saveSettings({ enabled: false }, storage)
    expect(isActiveOn(settings, 'amazon.com')).toBe(false)
  })

  it('is false on a marketplace that was switched off', async () => {
    const settings = await saveSettings({ marketplaces: { 'amazon.de': false } }, storage)
    expect(isActiveOn(settings, 'amazon.de')).toBe(false)
    expect(isActiveOn(settings, 'amazon.com')).toBe(true)
  })

  it('is false when the hostname is not a marketplace at all', async () => {
    expect(isActiveOn(await loadSettings(storage), null)).toBe(false)
  })
})

describe('isSourceEnabled', () => {
  it('treats an unknown source as enabled', async () => {
    // A source added in a later version must work without the user opting in.
    expect(isSourceEnabled(await loadSettings(storage), 'brand-new-source')).toBe(true)
  })

  it('respects an explicit opt-out', async () => {
    const settings = await saveSettings({ sources: { 'amazon-detail-table': false } }, storage)
    expect(isSourceEnabled(settings, 'amazon-detail-table')).toBe(false)
  })
})
