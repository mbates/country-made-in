import { describe, expect, it, vi } from 'vitest'
import { evidenceFrom, requiredOrigins, runDeepSearch } from '../../../src/shared/deep/orchestrator'
import { countryByCode } from '../../../src/shared/origin'
import type { Evidence } from '../../../src/shared/origin'
import type { OriginSource, ProductSeed, SourceOutcome } from '../../../src/shared/deep/source'

const SEED: ProductSeed = {
  marketplace: 'amazon.com',
  asin: 'B000000000',
  gtin: '00689323639762',
  brand: 'FURHAB',
}

const evidence = (sourceId: string): Evidence => ({
  kind: 'manufactured',
  country: countryByCode('CN'),
  sourceId,
  sourceLabel: sourceId,
  url: 'https://example.test/x',
  quote: 'Made in China',
  confidence: 'medium',
  retrievedAt: '2026-09-06T00:00:00.000Z',
})

function source(over: Partial<OriginSource> & { id: string }): OriginSource {
  return {
    label: over.id,
    origins: [`https://${over.id}.test/*`],
    applies: () => true,
    search: async () => [evidence(over.id)],
    ...over,
  }
}

const statuses = (outcomes: SourceOutcome[]) =>
  Object.fromEntries(outcomes.map((o) => [o.sourceId, o.status]))

describe('a failing source degrades the answer, it does not break it', () => {
  it('keeps going when one source throws', async () => {
    const outcomes = await runDeepSearch(
      [
        source({ id: 'good' }),
        source({
          id: 'broken',
          search: async () => {
            throw new Error('boom')
          },
        }),
        source({ id: 'other' }),
      ],
      SEED
    )
    expect(statuses(outcomes)).toEqual({ good: 'found', broken: 'failed', other: 'found' })
    expect(evidenceFrom(outcomes)).toHaveLength(2)
  })

  it('records why a source failed', async () => {
    const [outcome] = await runDeepSearch(
      [
        source({
          id: 'broken',
          search: async () => {
            throw new Error('403 Forbidden')
          },
        }),
      ],
      SEED
    )
    expect(outcome).toEqual({ sourceId: 'broken', status: 'failed', reason: '403 Forbidden' })
  })

  it('survives a source whose applies() throws', async () => {
    const outcomes = await runDeepSearch(
      [
        source({
          id: 'bad',
          applies: () => {
            throw new Error('nope')
          },
        }),
        source({ id: 'good' }),
      ],
      SEED
    )
    expect(statuses(outcomes)).toEqual({ bad: 'failed', good: 'found' })
  })

  it('does not let a throwing listener stop the search', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const outcomes = await runDeepSearch([source({ id: 'a' }), source({ id: 'b' })], SEED, {
      onOutcome: () => {
        throw new Error('listener exploded')
      },
    })
    expect(outcomes).toHaveLength(2)
    vi.restoreAllMocks()
  })
})

describe('"nothing" is a real answer', () => {
  it('distinguishes a source that found nothing from one that failed', async () => {
    const outcomes = await runDeepSearch(
      [
        source({ id: 'silent', search: async () => [] }),
        source({
          id: 'broken',
          search: async () => {
            throw new Error('x')
          },
        }),
      ],
      SEED
    )
    // "We asked and it said nothing" is information; "we could not ask" is not the same.
    expect(statuses(outcomes)).toEqual({ silent: 'nothing', broken: 'failed' })
  })

  it('skips a source that cannot apply, and says so', async () => {
    const [outcome] = await runDeepSearch([source({ id: 'fcc', applies: () => false })], SEED)
    expect(outcome).toEqual({ sourceId: 'fcc', status: 'skipped', reason: 'not applicable' })
  })
})

describe('budgets', () => {
  it('times a slow source out rather than waiting for it', async () => {
    const outcomes = await runDeepSearch(
      [source({ id: 'slow', search: () => new Promise(() => {}) }), source({ id: 'fast' })],
      SEED,
      { timeoutMs: 20, concurrency: 2 }
    )
    expect(statuses(outcomes)).toEqual({ fast: 'found', slow: 'timeout' })
  })

  it('signals the source when its budget expires', async () => {
    let aborted = false
    await runDeepSearch(
      [
        source({
          id: 'slow',
          search: (_seed, signal) =>
            new Promise((resolve) => {
              signal.addEventListener('abort', () => {
                aborted = true
                resolve([])
              })
            }),
        }),
      ],
      SEED,
      { timeoutMs: 20 }
    )
    expect(aborted).toBe(true)
  })

  it('respects the concurrency cap', async () => {
    let running = 0
    let peak = 0
    const slow = (id: string) =>
      source({
        id,
        search: async () => {
          running += 1
          peak = Math.max(peak, running)
          await new Promise((r) => setTimeout(r, 5))
          running -= 1
          return []
        },
      })
    await runDeepSearch(['a', 'b', 'c', 'd', 'e', 'f'].map(slow), SEED, { concurrency: 2 })
    // Both bounds: `toBeLessThanOrEqual` alone passes for a cap stuck at 1, which is the
    // regression that would actually hurt — six sequential network calls.
    expect(peak).toBe(2)
  })
})

describe('cancellation', () => {
  it('stops when the caller aborts', async () => {
    const controller = new AbortController()
    const outcomes = await runDeepSearch(
      [
        source({
          id: 'first',
          search: async () => {
            controller.abort()
            return []
          },
        }),
        source({ id: 'second' }),
      ],
      SEED,
      { concurrency: 1, signal: controller.signal }
    )
    expect(outcomes.map((o) => o.sourceId)).not.toContain('second')
  })

  it('runs nothing at all when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const search = vi.fn()
    await runDeepSearch([source({ id: 'a', search })], SEED, { signal: controller.signal })
    expect(search).not.toHaveBeenCalled()
  })
})

describe('progress', () => {
  it('reports each outcome as it lands, not all at the end', async () => {
    const seen: string[] = []
    await runDeepSearch([source({ id: 'a' }), source({ id: 'b' })], SEED, {
      concurrency: 1,
      onOutcome: (o) => seen.push(o.sourceId),
    })
    // The panel needs progress, not a spinner that resolves once.
    expect(seen).toEqual(['a', 'b'])
  })
})

describe('requiredOrigins', () => {
  it('lists only the origins applicable sources actually need', async () => {
    const origins = requiredOrigins(
      [
        source({ id: 'a', origins: ['https://a.test/*'] }),
        source({ id: 'b', origins: ['https://b.test/*'], applies: () => false }),
      ],
      SEED
    )
    // Asking for permission a source cannot use is an unearned imposition.
    expect(origins).toEqual(['https://a.test/*'])
  })

  it('deduplicates shared origins', () => {
    const origins = requiredOrigins(
      [
        source({ id: 'a', origins: ['https://same.test/*'] }),
        source({ id: 'b', origins: ['https://same.test/*'] }),
      ],
      SEED
    )
    expect(origins).toEqual(['https://same.test/*'])
  })

  it('is empty when nothing applies, so no prompt is shown', () => {
    expect(requiredOrigins([source({ id: 'a', applies: () => false })], SEED)).toEqual([])
  })
})

describe('regressions from review of PR #20', () => {
  it('gives up promptly when aborted, rather than waiting out the budget', async () => {
    // A ten-second per-source budget would otherwise keep a cancelled search alive for
    // ten seconds after the panel closed, then report a timeout that never happened.
    const controller = new AbortController()
    const started = Date.now()

    const running = runDeepSearch(
      [source({ id: 'slow', search: () => new Promise(() => {}) })],
      SEED,
      { timeoutMs: 5000, signal: controller.signal }
    )
    setTimeout(() => controller.abort(), 10)
    const outcomes = await running

    expect(Date.now() - started).toBeLessThan(2000)
    expect(outcomes.some((o) => o.status === 'timeout')).toBe(false)
  })

  it('does not mistake a source that resolves to the string "timeout"', async () => {
    // withBudget used to race a 'timeout' sentinel against an unconstrained T.
    const odd = source({
      id: 'odd',
      search: async () => 'timeout' as unknown as never,
    })
    const [outcome] = await runDeepSearch([odd], SEED, { timeoutMs: 500 })
    expect(outcome.status).not.toBe('timeout')
  })

  it('calls applies() once per source', () => {
    let calls = 0
    const counted = source({
      id: 'counted',
      applies: () => {
        calls += 1
        return true
      },
    })
    return runDeepSearch([counted], SEED).then(() => expect(calls).toBe(1))
  })
})
