// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeListing } from '../../src/content/adapters/listing'
import type { ListingTile } from '../../src/content/adapters/listing'

function page(html: string) {
  document.body.innerHTML = html
  return document
}

const asins = (batches: ListingTile[][]) => batches.flat().map((t) => t.asin)

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('observeListing', () => {
  it('reports the tiles already on the page, without waiting for a mutation', () => {
    const doc = page(
      '<div class="s-main-slot"><div data-asin="B000000001"></div><div data-asin="B000000002"></div></div>'
    )
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))
    stop()
    expect(asins(batches)).toEqual(['B000000001', 'B000000002'])
  })

  it('ignores placeholder tiles with an empty or malformed data-asin', () => {
    const doc = page(
      '<div class="s-main-slot"><div data-asin=""></div><div data-asin="  "></div>' +
        '<div data-asin="nope"></div><div data-asin="B000000001"></div></div>'
    )
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))
    stop()
    expect(asins(batches)).toEqual(['B000000001'])
  })

  it('reports tiles added later, batched into one callback', async () => {
    vi.useFakeTimers()
    const doc = page('<div class="s-main-slot"></div>')
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))

    const slot = doc.querySelector('.s-main-slot')!
    for (const asin of ['B000000001', 'B000000002', 'B000000003']) {
      const tile = doc.createElement('div')
      tile.setAttribute('data-asin', asin)
      slot.append(tile)
    }

    await vi.advanceTimersByTimeAsync(200)
    stop()

    // Three mutations in one burst must not mean three callbacks.
    expect(batches).toHaveLength(1)
    expect(asins(batches)).toEqual(['B000000001', 'B000000002', 'B000000003'])
  })

  it('never reports the same tile twice', async () => {
    vi.useFakeTimers()
    const doc = page('<div class="s-main-slot"><div data-asin="B000000001"></div></div>')
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))

    // A re-render that leaves the same product in place.
    doc.querySelector('.s-main-slot')!.append(doc.createElement('span'))
    await vi.advanceTimersByTimeAsync(200)
    stop()

    expect(asins(batches)).toEqual(['B000000001'])
  })

  it('stops calling back after teardown', async () => {
    vi.useFakeTimers()
    const doc = page('<div class="s-main-slot"></div>')
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))
    stop()

    const tile = doc.createElement('div')
    tile.setAttribute('data-asin', 'B000000001')
    doc.querySelector('.s-main-slot')!.append(tile)
    await vi.advanceTimersByTimeAsync(500)

    expect(batches).toEqual([])
  })

  it('cancels a pending batch on teardown', async () => {
    vi.useFakeTimers()
    const doc = page('<div class="s-main-slot"></div>')
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))

    const tile = doc.createElement('div')
    tile.setAttribute('data-asin', 'B000000001')
    doc.querySelector('.s-main-slot')!.append(tile)

    // Teardown lands inside the debounce window.
    stop()
    await vi.advanceTimersByTimeAsync(500)
    expect(batches).toEqual([])
  })

  it('does not poll — no timer is pending on a still page', async () => {
    vi.useFakeTimers()
    const doc = page('<div class="s-main-slot"><div data-asin="B000000001"></div></div>')
    const stop = observeListing(doc, () => {})
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })

  it('falls back to the root when no results container is present', () => {
    const doc = page('<div><div data-asin="B000000001"></div></div>')
    const batches: ListingTile[][] = []
    const stop = observeListing(doc, (t) => batches.push(t))
    stop()
    expect(asins(batches)).toEqual(['B000000001'])
  })
})
