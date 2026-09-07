import { describe, expect, it } from 'vitest'
import { binIdRange, runsForNodeRange } from './gamIndex.ts'
import type { GamIndex } from './gamIndex.ts'

const UINT64_MAX = 2n ** 64n - 1n

// vg numbers bins so that bin B = offset + index, where offset is the all-ones
// value with K bits set and the bin covers every ID whose top K bits are
// `index` (see StreamIndexBase in vg/src/stream_index.hpp).
describe('binIdRange', () => {
  it('maps bin 0 to the whole 64-bit ID space', () => {
    expect(binIdRange(0n)).toEqual({ rangeStart: 0n, rangeEnd: UINT64_MAX })
  })

  it('splits the space in half at the one-bit-prefix level', () => {
    expect(binIdRange(1n)).toEqual({
      rangeStart: 0n,
      rangeEnd: 2n ** 63n - 1n,
    })
    expect(binIdRange(2n)).toEqual({
      rangeStart: 2n ** 63n,
      rangeEnd: UINT64_MAX,
    })
  })

  it('splits into quarters at the two-bit-prefix level', () => {
    const quarter = 2n ** 62n
    expect(binIdRange(3n)).toEqual({ rangeStart: 0n, rangeEnd: quarter - 1n })
    expect(binIdRange(4n)).toEqual({
      rangeStart: quarter,
      rangeEnd: 2n * quarter - 1n,
    })
    expect(binIdRange(6n)).toEqual({
      rangeStart: 3n * quarter,
      rangeEnd: UINT64_MAX,
    })
  })

  it('bottoms out at single IDs for the deepest bin level', () => {
    expect(binIdRange(2n ** 64n - 1n)).toEqual({
      rangeStart: 0n,
      rangeEnd: 0n,
    })
    // One level up, each bin still covers a pair of IDs.
    expect(binIdRange(2n ** 63n)).toEqual({ rangeStart: 2n, rangeEnd: 3n })
  })

  it('covers the space without gaps at every level it reports', () => {
    for (const level of [1n, 2n, 3n]) {
      const offset = (1n << level) - 1n
      const count = 1n << level
      let expected = 0n
      for (let i = 0n; i < count; i++) {
        const { rangeStart, rangeEnd } = binIdRange(offset + i)
        expect(rangeStart).toBe(expected)
        expected = rangeEnd + 1n
      }
      expect(expected).toBe(2n ** 64n)
    }
  })
})

function index(
  bins: [bigint, { start: bigint; pastEnd: bigint }[]][],
  windows: [bigint, bigint][],
): GamIndex {
  return { version: 1, bins: new Map(bins), windows: new Map(windows) }
}

describe('runsForNodeRange', () => {
  it('returns nothing when no window covers the range', () => {
    const idx = index([[0n, [{ start: 0n, pastEnd: 100n }]]], [[9999n, 0n]])
    expect(runsForNodeRange(idx, 1n, 10n)).toEqual([])
  })

  it('coalesces overlapping runs from different bins', () => {
    const idx = index(
      [
        [0n, [{ start: 0n, pastEnd: 100n }]],
        [1n, [{ start: 50n, pastEnd: 200n }]],
      ],
      [[0n, 0n]],
    )
    expect(runsForNodeRange(idx, 1n, 10n)).toEqual([
      { start: 0n, pastEnd: 200n },
    ])
  })

  it('keeps disjoint runs separate and clips them to the first window', () => {
    const idx = index(
      [[0n, [{ start: 0n, pastEnd: 100n }, { start: 400n, pastEnd: 500n }]]],
      [[0n, 40n]],
    )
    expect(runsForNodeRange(idx, 1n, 10n)).toEqual([
      { start: 40n, pastEnd: 100n },
      { start: 400n, pastEnd: 500n },
    ])
  })

  it('drops runs that end before the first window', () => {
    const idx = index(
      [[0n, [{ start: 0n, pastEnd: 30n }, { start: 400n, pastEnd: 500n }]]],
      [[0n, 40n]],
    )
    expect(runsForNodeRange(idx, 1n, 10n)).toEqual([
      { start: 400n, pastEnd: 500n },
    ])
  })

  it('ignores bins whose ID range misses the query', () => {
    const idx = index(
      [
        [1n, [{ start: 0n, pastEnd: 100n }]],
        [2n, [{ start: 400n, pastEnd: 500n }]],
      ],
      [[0n, 0n]],
    )
    expect(runsForNodeRange(idx, 1n, 10n)).toEqual([
      { start: 0n, pastEnd: 100n },
    ])
  })
})
