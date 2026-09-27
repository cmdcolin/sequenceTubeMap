// @vitest-environment node

import type { ColorableTrack } from '@gmod/tubemap-core'
import { describe, expect, it } from 'vitest'
import {
  type Coloring,
  type DrawnTrack,
  drawnTrack,
  encodingFor,
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
  const scale = encodingFor(SCHEME, coloring).read.color
  const named = new Set(
    scale
      .rows('reads', drawn)
      .flatMap(row => ('palette' in row ? paletteColors(row.palette) : [])),
  )
  return drawn.every(t => named.has(scale.map(t)))
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
    const scale = encodingFor(SCHEME, {}).path.color
    const reds = paletteColors('reds')
    expect(scale.map({ mark: 'path', source: 0, id: 0, reverse: false })).toBe(
      reds.at(-1),
    )
    expect(scale.map({ mark: 'path', source: 0, id: 1, reverse: false })).toBe(
      reds[0],
    )
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

  // A read takes its group, else its mapping quality, else its strand; a
  // band only its strand or share
  it('picks a read scale by the view, and leaves groups and quality off bands', () => {
    const datum = drawnTrack(
      read(1, { name: 'r1', mapping_quality: 0 }),
      0,
      groups,
    )
    const byStrand = encodingFor(SCHEME, {})
    const byQuality = encodingFor(SCHEME, { colorReadsByMappingQuality: true })
    const byGroup = encodingFor(SCHEME, {
      readGroups: groups,
      colorReadsByMappingQuality: true,
    })
    expect(byStrand.read.color.map(datum)).toBe(paletteColors('blues')[1])
    expect(byQuality.read.color.map(datum)).not.toBe(
      byStrand.read.color.map(datum),
    )
    expect(byGroup.read.color.map(datum)).toBe(paletteColors('plainColors')[1])
    expect(byGroup.readBand.color.map({ ...datum, mark: 'readBand' })).toBe(
      byStrand.readBand.color.map({ ...datum, mark: 'readBand' }),
    )
  })

  it('sets opacity only when the view asks for it, and only on reads', () => {
    const faded = encodingFor(SCHEME, { alphaReadsByMappingQuality: true })
    expect(faded.read.alpha).toBeDefined()
    expect(faded.readBand.alpha).toBeUndefined()
    expect(encodingFor(SCHEME, {}).read.alpha).toBeUndefined()
  })

  it('draws the reference from the main palette and the rest from the aux', () => {
    const blues = paletteColors('blues')
    const reds = paletteColors('reds')
    const { reference, path } = encodingFor(SCHEME, {})
    expect(
      reference.color.map(
        drawnTrack({ id: 0, sourceTrackID: 0 }, 0, NO_GROUPS),
      ),
    ).toBe(blues[0])
    expect(
      path.color.map(drawnTrack({ id: 1, sourceTrackID: 0 }, 0, NO_GROUPS)),
    ).toBe(reds[0])
  })
})
