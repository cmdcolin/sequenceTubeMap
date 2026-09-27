// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { legendSections, type LegendRow } from './legend.ts'
import { mappingQualityColor } from './mappingQuality.ts'
import type { Tracks } from '../Types.ts'

const GREYS = { mainPalette: 'greys', auxPalette: 'ygreys' }
const READS = { mainPalette: 'blues', auxPalette: 'reds' }

const describeRow = (row: LegendRow) =>
  `${row.label}=${'ramp' in row ? 'ramp' : row.palette}`

function rowsFor(tracks: Tracks, extra = {}) {
  return legendSections({
    tracks,
    colorSchemes: [GREYS, READS],
    ...extra,
  }).map(s => s.rows.map(describeRow))
}

const GRAPH_AND_READS: Tracks = [
  { trackType: 'graph', trackFile: 'x.gbz.db' },
  { trackType: 'read', trackFile: 'x.gam' },
]

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

  it('keys mapping-quality color with the ramp the reads are drawn from', () => {
    const [, reads] = legendSections({
      tracks: GRAPH_AND_READS,
      colorSchemes: [GREYS, READS],
      colorReadsByMappingQuality: true,
    })
    expect(reads?.rows).toEqual([
      {
        label: 'Mapping quality 0–60',
        ramp: [0, 15, 30, 45, 60].map(q => mappingQualityColor(q)),
      },
    ])
  })

  it('lets read groups win over mapping-quality color, as the drawing does', () => {
    expect(
      rowsFor(GRAPH_AND_READS, {
        colorReadsByMappingQuality: true,
        readGroups: [{ name: 'Carriers', color: 'blues' }],
      })[1],
    ).toEqual(['Carriers=blues', 'Other reads=greys'])
  })

  it('adds an opacity row under whatever colors the reads', () => {
    expect(
      rowsFor(GRAPH_AND_READS, { alphaReadsByMappingQuality: true })[1],
    ).toEqual([
      'Forward reads=blues',
      'Reverse reads=reds',
      'Opacity, mapping quality 0–60=ramp',
    ])
  })

  // A band stands for many reads, so groups and mapping quality, which belong
  // to one read, don't color it.
  it('keys coarsened reads by strand alone', () => {
    expect(
      rowsFor(GRAPH_AND_READS, {
        coarsened: { unit: 'read', total: 3, reverse: true },
        colorReadsByMappingQuality: true,
        alphaReadsByMappingQuality: true,
        readGroups: [{ name: 'Carriers', color: 'blues' }],
      }),
    ).toEqual([
      ['Reference path=greys', 'Other paths=ygreys'],
      ['Forward read bands=blues', 'Reverse read bands=reds'],
    ])
  })

  it('keys coarsened haplotypes by share of the others', () => {
    const graph: Tracks = [{ trackType: 'graph', trackFile: 'x.gbz.db' }]
    const coarsened = { unit: 'haplotype', total: 94, reverse: false } as const
    expect(rowsFor(graph, { coarsened })).toEqual([
      ['Reference path=greys', 'Bands, 1 to all 94 other haplotypes=ramp'],
    ])
    expect(
      rowsFor([...graph, { trackType: 'haplotype', trackFile: 'x.gbwt' }], {
        coarsened: { ...coarsened, reverse: true },
      }),
    ).toEqual([
      ['Reference path=greys'],
      [
        'Forward bands, 1 to all 94 other haplotypes=ramp',
        'Reverse bands, 1 to all 94 other haplotypes=ramp',
      ],
    ])
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
