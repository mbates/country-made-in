import { describe, expect, it, vi } from 'vitest'
import {
  describeOrigins,
  hasOrigins,
  requestOrigins,
  revokeOrigins,
} from '../../../src/shared/deep/permissions'
import type { PermissionApi } from '../../../src/shared/deep/permissions'

const api = (over: Partial<PermissionApi> = {}): PermissionApi => ({
  contains: async () => false,
  request: async () => true,
  remove: async () => true,
  ...over,
})

describe('permission requests', () => {
  it('asks for exactly the origins it was given', async () => {
    const request = vi.fn(async () => true)
    await requestOrigins(['https://a.test/*', 'https://b.test/*'], api({ request }))
    expect(request).toHaveBeenCalledWith({ origins: ['https://a.test/*', 'https://b.test/*'] })
  })

  it('does not prompt at all when nothing needs permission', async () => {
    const request = vi.fn(async () => true)
    expect(await requestOrigins([], api({ request }))).toBe(true)
    // An empty prompt would be an unearned imposition.
    expect(request).not.toHaveBeenCalled()
  })

  it('treats refusal as a normal answer, not an error', async () => {
    expect(await requestOrigins(['https://a.test/*'], api({ request: async () => false }))).toBe(
      false
    )
  })

  it('degrades to "not granted" when the API is unavailable or the call is rejected', async () => {
    // chrome.permissions does not exist in a content script, and Chrome rejects a request
    // made outside a user gesture. Either is a caller bug that must not break the UI.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const denied = api({
      request: async () => {
        throw new Error('must be called during a user gesture')
      },
    })
    expect(await requestOrigins(['https://a.test/*'], denied)).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('hasOrigins', () => {
  it('is true when nothing is needed', async () => {
    const contains = vi.fn(async () => false)
    expect(await hasOrigins([], api({ contains }))).toBe(true)
    expect(contains).not.toHaveBeenCalled()
  })

  it('asks Chrome otherwise', async () => {
    expect(await hasOrigins(['https://a.test/*'], api({ contains: async () => true }))).toBe(true)
  })
})

describe('describeOrigins', () => {
  it('turns match patterns into hostnames a person can read', () => {
    expect(
      describeOrigins(['https://*.wikidata.org/*', 'https://fcc.report/*', '*://api.test/*'])
    ).toEqual(['api.test', 'fcc.report', 'wikidata.org'])
  })

  it('deduplicates and sorts, so the copy is stable', () => {
    expect(describeOrigins(['https://b.test/*', 'https://a.test/*', 'https://a.test/*'])).toEqual([
      'a.test',
      'b.test',
    ])
  })
})

describe('revokeOrigins', () => {
  it('gives the origins back', async () => {
    const remove = vi.fn(async () => true)
    await revokeOrigins(['https://a.test/*'], api({ remove }))
    expect(remove).toHaveBeenCalledWith({ origins: ['https://a.test/*'] })
  })

  it('is a no-op when there is nothing to give back', async () => {
    const remove = vi.fn(async () => true)
    expect(await revokeOrigins([], api({ remove }))).toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('hasOrigins failures', () => {
  it('reports not-granted rather than throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = api({
      contains: async () => {
        throw new Error('no such API')
      },
    })
    expect(await hasOrigins(['https://a.test/*'], broken)).toBe(false)
    vi.restoreAllMocks()
  })
})
