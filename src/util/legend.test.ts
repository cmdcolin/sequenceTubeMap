// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { legendSections } from './legend.ts'
import type { Tracks } from '../Types.ts'

const GREYS = { mainPalette: 'greys', auxPalette: 'ygreys' }
const READS = { mainPalette: 'blues', auxPalette: 'reds' }

function rowsFor(tracks: Tracks, extra = {}) {
  return legendSections({
    tracks,
    colorSchemes: [GREYS, READS],
    ...extra,
  }).map(s => s.rows.map(r => `${r.label}=${r.palette}`))
}

describe('legendSections', () => {
  it('names the palette each row is actually drawn in', () => {
    // Everything but a read takes mainPalette[0] for the first track and
    // auxPalette for the rest, so a graph carrying its own non-reference paths
    // needs both rows named.
    expect(
      rowsFor([
        { trackType: 'graph', trackFile: 'x.gbz.db' },
        { trackType: 'read', trackFile: 'x.gam' },
      ]),
    ).toEqual([
      ['Reference path=greys', 'Other paths=ygreys'],
      ['Forward reads=blues', 'Reverse reads=reds'],
    ])
  })

  it('hands the non-reference paths to a haplotype track when there is one', () => {
    expect(
      rowsFor([
        { trackType: 'graph', trackFile: 'x.gbz.db' },
        { trackType: 'haplotype', trackFile: 'x.gbwt' },
      ]),
    ).toEqual([['Reference path=greys'], ['Haplotypes=reds']])
  })

  it('collapses the strand rows under ignoreStrand', () => {
    expect(
      rowsFor([{ trackType: 'read', trackFile: 'x.gam' }], {
        ignoreStrand: true,
      }),
    ).toEqual([['Reads=greys']])
  })

  it('describes read groups instead of strands once any group exists', () => {
    // Every read is colored through the group system while a group is active,
    // so the strand rows would name colors nothing is drawn in.
    expect(
      rowsFor([{ trackType: 'read', trackFile: 'x.gam' }], {
        readGroups: [{ name: 'Carriers', color: 'blues' }],
        otherReadsColor: 'greys',
      }),
    ).toEqual([['Carriers=blues', 'Other reads=greys']])
  })

  it('says nothing rather than guessing when a track has no scheme', () => {
    expect(
      legendSections({
        tracks: [{ trackType: 'graph', trackFile: 'x.gbz.db' }],
        colorSchemes: [],
      })[0]?.rows,
    ).toEqual([])
  })

  it('labels a track by its display name, else the file it came from', () => {
    const sections = legendSections({
      tracks: [
        { trackType: 'graph', trackFile: 'exampleData/deep/x.gbz.db' },
        { trackType: 'read', trackFile: '7', trackDisplayName: 'mine.gam' },
      ],
      colorSchemes: [GREYS, READS],
    })
    expect(sections.map(s => s.label)).toEqual(['x.gbz.db', 'mine.gam'])
  })
})
