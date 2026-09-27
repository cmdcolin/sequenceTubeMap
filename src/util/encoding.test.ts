// @vitest-environment node

import type { ColorableTrack } from '@gmod/tubemap-core'
import { describe, expect, it } from 'vitest'
import {
  colorScaleFor,
  type Coloring,
  type DrawnTrack,
  drawnTrack,
  markOf,
} from './encoding.ts'
import { paletteColors } from './palettes.ts'

const SCHEME = { mainPalette: 'blues', auxPalette: 'reds' }

function read(id: number, extra: Partial<ColorableTrack> = {}): ColorableTrack {
  return { id, sourceTrackID: 1, type: 'read', ...extra }
}

const NO_GROUPS: never[] = []

// Every color a scale draws is in a palette one of its rows names
function keyed(coloring: Coloring, drawn: DrawnTrack[]) {
  const scale = colorScaleFor('read', SCHEME, coloring)
  const named = new Set(
    scale
      .rows('reads', drawn)
      .flatMap(row => ('palette' in row ? paletteColors(row.palette) : [])),
  )
  return drawn.every(t => named.has(scale.color(t)))
}

describe('encoding', () => {
  const groups = [{ name: 'A', color: 'plainColors', reads: new Set(['r1']) }]
  const reads = [0, 1, 2, 3].flatMap(id => [
    drawnTrack(read(id, { name: `r${id}` }), 0, groups),
    drawnTrack(read(id, { name: `r${id}`, is_reverse: true }), 0, groups),
  ])

  // Double-clicking a track makes it the reference, which leaves track 0
  // among the other paths
  it('colors every other path, track 0 included', () => {
    const scale = colorScaleFor('path', SCHEME, {})
    const reds = paletteColors('reds')
    expect(
      scale.color({ mark: 'path', source: 0, id: 0, reverse: false }),
    ).toBe(reds.at(-1))
    expect(
      scale.color({ mark: 'path', source: 0, id: 1, reverse: false }),
    ).toBe(reds[0])
  })

  it('keys every color it draws a read in', () => {
    expect(keyed({}, reads)).toBe(true)
    expect(keyed({ ignoreStrand: true }, reads)).toBe(true)
    expect(
      keyed({ readGroups: groups, otherReadsColor: '#123456' }, reads),
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

  it('projects a track onto what the scales read, resolving its group', () => {
    const later = [
      ...groups,
      { name: 'B', color: 'reds', reads: new Set(['r1', 'r2']) },
    ]
    expect(
      drawnTrack(
        read(1, { name: 'r1', is_reverse: true, mapping_quality: 42 }),
        0,
        later,
      ),
    ).toEqual({
      mark: 'read',
      source: 1,
      id: 1,
      name: 'r1',
      reverse: true,
      mappingQuality: 42,
      group: 1,
    })
    expect(drawnTrack(read(5, { name: 'r5' }), 0, later).group).toBeUndefined()
    expect(drawnTrack({ id: 0, sourceTrackID: 0 }, 0, later)).toEqual({
      mark: 'reference',
      source: 0,
      id: 0,
      reverse: false,
    })
  })

  it('draws the reference from the main palette and the rest from the aux', () => {
    const blues = paletteColors('blues')
    const reds = paletteColors('reds')
    expect(
      colorScaleFor('reference', SCHEME, {}).color(
        drawnTrack({ id: 0, sourceTrackID: 0 }, 0, NO_GROUPS),
      ),
    ).toBe(blues[0])
    expect(
      colorScaleFor('path', SCHEME, {}).color(
        drawnTrack({ id: 1, sourceTrackID: 0 }, 0, NO_GROUPS),
      ),
    ).toBe(reds[0])
  })
})
