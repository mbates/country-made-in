import { describe, expect, it } from 'vitest'
import { SOURCES } from '../../../src/shared/deep/registry'
import { requiredOrigins } from '../../../src/shared/deep/orchestrator'

const SEED = { marketplace: 'amazon.com', asin: 'B000000000' } as const

describe('the source registry', () => {
  // Plan 05-01 is a gate: an adapter is written only after its hit rate is measured
  // against the fixture corpus and recorded. Nothing has passed that gate yet, and this
  // test exists so adding one without the measurement is a deliberate act.
  it('is empty until sources pass the 05-01 coverage gate', () => {
    expect(SOURCES).toEqual([])
  })

  it('means the button asks for no permissions yet', () => {
    expect(requiredOrigins(SOURCES, SEED)).toEqual([])
  })

  it('gives every registered source a unique id', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length)
  })

  it('declares at least one origin for every registered source', () => {
    for (const source of SOURCES) expect(source.origins.length).toBeGreaterThan(0)
  })
})
