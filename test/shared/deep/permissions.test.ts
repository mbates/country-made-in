import { describe, expect, it, vi } from 'vitest'
import { describeOrigins, hasOrigins, requestOrigins } from '../../../src/shared/deep/permissions'
import type { PermissionApi } from '../../../src/shared/deep/permissions'

const api = (over: Partial<PermissionApi> = {}): PermissionApi => ({
  contains: async () => false,
  request: async () => true,
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

  it('degrades to "not granted" when Chrome rejects the call', async () => {
    // Chrome rejects a request made without a user gesture. That is a caller bug, but it
    // must not break the panel.
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
