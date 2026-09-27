// @vitest-environment node

import type { ColorableTrack } from '@gmod/tubemap-core'
import { describe, expect, it } from 'vitest'
import { colorScaleFor, type Coloring, type Mark, markOf } from './encoding.ts'
import { paletteColors } from './palettes.ts'

const SCHEME = { mainPalette: 'blues', auxPalette: 'reds' }

function read(id: number, extra: Partial<ColorableTrack> = {}): ColorableTrack {
  return { id, sourceTrackID: 1, type: 'read', ...extra }
}

// Every color a scale draws is in a palette one of its rows names
function keyed(mark: Mark, coloring: Coloring, tracks: ColorableTrack[]) {
  const scale = colorScaleFor(mark, SCHEME, coloring)
  const named = new Set(
    scale
      .rows('reads')
      .flatMap(row => ('palette' in row ? paletteColors(row.palette) : [])),
  )
  return tracks.every(t => named.has(scale.color(t)))
}

describe('encoding', () => {
  const reads = [0, 1, 2, 3].flatMap(id => [
    read(id, { name: `r${id}` }),
    read(id, { name: `r${id}`, is_reverse: true }),
  ])

  // Double-clicking a track makes it the reference, which leaves track 0
  // among the other paths
  it('colors every other path, track 0 included', () => {
    const scale = colorScaleFor('path', SCHEME, {})
    const reds = paletteColors('reds')
    expect(scale.color({ id: 0, sourceTrackID: 0 })).toBe(reds.at(-1))
    expect(scale.color({ id: 1, sourceTrackID: 0 })).toBe(reds[0])
  })

  it('keys every color it draws a read in', () => {
    expect(keyed('read', {}, reads)).toBe(true)
    expect(keyed('read', { ignoreStrand: true }, reads)).toBe(true)
    expect(
      keyed(
        'read',
        {
          readGroups: [
            { name: 'A', color: 'plainColors', reads: new Set(['r1']) },
          ],
          otherReadsColor: '#123456',
        },
        reads,
      ),
    ).toBe(true)
  })

  it('tells bands, reads and paths apart', () => {
    expect(markOf(read(3), 0)).toBe('read')
    expect(markOf(read(1_000_000_000), 0)).toBe('readBand')
    expect(
      markOf(
        read(1_000_000_001, { haplotypeShare: { count: 1, total: 2 } }),
        0,
      ),
    ).toBe('haplotypeBand')
    expect(markOf({ id: 0, sourceTrackID: 0 }, 0)).toBe('reference')
    expect(markOf({ id: 2, sourceTrackID: 0 }, 0)).toBe('path')
  })

  it('draws the reference from the main palette and the rest from the aux', () => {
    const blues = paletteColors('blues')
    const reds = paletteColors('reds')
    expect(
      colorScaleFor('reference', SCHEME, {}).color({ id: 0, sourceTrackID: 0 }),
    ).toBe(blues[0])
    expect(
      colorScaleFor('path', SCHEME, {}).color({ id: 1, sourceTrackID: 0 }),
    ).toBe(reds[0])
  })
})
