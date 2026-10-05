// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  type DrawnTrack,
  type ReadColoringFlags,
  readEncodingFrom,
} from './encoding.ts'
import {
  type LegendColoring,
  legendSections,
  type LegendRow,
} from './legend.ts'
import { mappingQualityColor } from './mappingQuality.ts'
import { paletteColors } from './palettes.ts'
import type { Tracks } from '../Types.ts'

const GREYS = { mainPalette: 'greys', auxPalette: 'ygreys' }
const READS = { mainPalette: 'blues', auxPalette: 'reds' }

const describeRow = (row: LegendRow) =>
  `${row.label}=${'ramp' in row ? 'ramp' : row.palette}`

const GRAPH: Tracks = [{ trackType: 'graph', trackFile: 'x.gbz.db' }]
const GRAPH_AND_READS: Tracks = [
  ...GRAPH,
  { trackType: 'read', trackFile: 'x.gam' },
]
const GRAPH_AND_HAPLOTYPES: Tracks = [
  ...GRAPH,
  { trackType: 'haplotype', trackFile: 'x.gbwt' },
]

const reference: DrawnTrack = {
  mark: 'reference',
  source: 0,
  id: 0,
  name: '17',
  reverse: false,
}

function path(id: number, source = 0, name = `alt${id}`): DrawnTrack {
  return { mark: 'path', source, id, name, reverse: false }
}

function read(id: number, extra: Partial<DrawnTrack> = {}): DrawnTrack {
  return {
    mark: 'read',
    source: 1,
    id,
    name: `r${id}`,
    reverse: false,
    ...extra,
  }
}

const bothStrands = [read(1), read(2, { reverse: true })]

// The View menu's flags pick the read encoding, as they do for the renderer
function rowsFor(
  tracks: Tracks,
  drawn: DrawnTrack[],
  extra: Partial<LegendColoring> & ReadColoringFlags = {},
) {
  return legendSections({
    tracks,
    colorSchemes: [GREYS, READS],
    drawn,
    read: readEncodingFrom(extra),
    ...extra,
  }).map(s => s.rows.map(describeRow))
}

describe('legendSections', () => {
  it('keys only what the draw placed, so a graph with one path has no other-path row', () => {
    expect(rowsFor(GRAPH_AND_READS, [reference, ...bothStrands])).toEqual([
      ['Reference path 17=#d9d9d9'],
      ['Forward reads=blues', 'Reverse reads=reds'],
    ])
  })

  it('names each other path in its own color while the palette tells them apart', () => {
    const ygreys = paletteColors('ygreys')
    expect(rowsFor(GRAPH, [reference, path(2), path(1)])).toEqual([
      ['Reference path 17=#d9d9d9', `alt1=${ygreys[0]}`, `alt2=${ygreys[1]}`],
    ])
  })

  it('shows the palette the paths cycle through once there are more than its colors', () => {
    const paths = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => path(id))
    expect(rowsFor(GRAPH, [reference, ...paths])).toEqual([
      ['Reference path 17=#d9d9d9', '9 other paths=ygreys'],
    ])
  })

  it('files the haplotype paths under the haplotype track they came from', () => {
    expect(
      rowsFor(GRAPH_AND_HAPLOTYPES, [reference, path(1, 1, 'thread_1')]),
    ).toEqual([['Reference path 17=#d9d9d9'], ['thread 1=#fb6a4a']])
  })

  it('says nothing for a file that drew nothing', () => {
    expect(rowsFor(GRAPH_AND_READS, [reference])).toEqual([
      ['Reference path 17=#d9d9d9'],
      [],
    ])
  })

  // The strand qualifies a row only where it distinguishes anything drawn
  it('keys only the strands in view', () => {
    expect(rowsFor(GRAPH_AND_READS, [read(1)])[1]).toEqual(['Reads=blues'])
    expect(rowsFor(GRAPH_AND_READS, [read(1, { reverse: true })])[1]).toEqual([
      'Reverse reads=reds',
    ])
  })

  it('collapses the strand rows under ignoreStrand', () => {
    expect(
      rowsFor(GRAPH_AND_READS, bothStrands, { ignoreStrand: true })[1],
    ).toEqual(['Reads=blues'])
  })

  it('describes read groups instead of strands once any group exists', () => {
    // Every read is colored through the group system while a group is active,
    // so the strand rows would name colors nothing is drawn in.
    expect(
      rowsFor(GRAPH_AND_READS, [read(1, { group: 0 }), read(2)], {
        readGroups: [{ name: 'Carriers', color: 'blues' }],
        otherReadsColor: 'greys',
      })[1],
    ).toEqual(['Carriers=blues', 'Other reads=greys'])
  })

  it('leaves out a group none of the drawn reads belong to', () => {
    expect(
      rowsFor(GRAPH_AND_READS, [read(1, { group: 1 })], {
        readGroups: [
          { name: 'Carriers', color: 'blues' },
          { name: 'Controls', color: 'reds' },
        ],
      })[1],
    ).toEqual(['Controls=reds'])
  })

  it('keys mapping-quality color with the ramp the reads are drawn from', () => {
    const [, reads] = legendSections({
      tracks: GRAPH_AND_READS,
      colorSchemes: [GREYS, READS],
      drawn: bothStrands,
      read: { color: 'mapq' },
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
      rowsFor(GRAPH_AND_READS, [read(1, { group: 0 }), read(2)], {
        colorReadsByMappingQuality: true,
        readGroups: [{ name: 'Carriers', color: 'blues' }],
      })[1],
    ).toEqual(['Carriers=blues', 'Other reads=greys'])
  })

  it('adds an opacity row under whatever colors the reads', () => {
    expect(
      rowsFor(GRAPH_AND_READS, bothStrands, {
        alphaReadsByMappingQuality: true,
      })[1],
    ).toEqual([
      'Forward reads=blues',
      'Reverse reads=reds',
      'Opacity, mapping quality 0–60=ramp',
    ])
  })

  // A band stands for many reads, so groups and mapping quality, which belong
  // to one read, don't color it.
  it('keys coarsened reads by strand alone', () => {
    const bands = [
      read(1_000_000_000, { mark: 'readBand', group: 0 }),
      read(1_000_000_001, { mark: 'readBand', reverse: true }),
    ]
    expect(
      rowsFor(GRAPH_AND_READS, [reference, ...bands], {
        colorReadsByMappingQuality: true,
        alphaReadsByMappingQuality: true,
        readGroups: [{ name: 'Carriers', color: 'blues' }],
      }),
    ).toEqual([
      ['Reference path 17=#d9d9d9'],
      ['Forward read bands=blues', 'Reverse read bands=reds'],
    ])
  })

  it('keys coarsened haplotypes by share of the others', () => {
    const band = (id: number, source: number, reverse = false): DrawnTrack => ({
      mark: 'haplotypeBand',
      source,
      id: 1_000_000_000 + id,
      reverse,
      share: { count: 1, total: 94 },
    })
    expect(rowsFor(GRAPH, [reference, band(1, 0), band(2, 0)])).toEqual([
      ['Reference path 17=#d9d9d9', 'Bands, 1 to all 94 other haplotypes=ramp'],
    ])
    expect(
      rowsFor(GRAPH_AND_HAPLOTYPES, [reference, band(1, 1), band(2, 1, true)]),
    ).toEqual([
      ['Reference path 17=#d9d9d9'],
      [
        'Forward bands, 1 to all 94 other haplotypes=ramp',
        'Reverse bands, 1 to all 94 other haplotypes=ramp',
      ],
    ])
  })

  it('names the greys the renderer falls back to without an aux palette', () => {
    expect(
      legendSections({
        tracks: GRAPH_AND_READS,
        colorSchemes: [{ mainPalette: 'blues' }, { mainPalette: 'reds' }],
        drawn: [
          reference,
          ...[1, 2, 3, 4, 5, 6, 7, 8].map(id => path(id)),
          ...bothStrands,
        ],
        read: { color: 'strand' },
      }).map(s => s.rows.map(describeRow)),
    ).toEqual([
      ['Reference path 17=#6baed6', '8 other paths=greys'],
      ['Forward reads=reds', 'Reverse reads=greys'],
    ])
  })

  it('labels a track by its display name, else the file it came from', () => {
    const sections = legendSections({
      tracks: [
        { trackType: 'graph', trackFile: 'exampleData/deep/x.gbz.db' },
        { trackType: 'read', trackFile: '7', trackDisplayName: 'mine.gam' },
      ],
      colorSchemes: [GREYS, READS],
      drawn: [],
      read: { color: 'strand' },
    })
    expect(sections.map(s => s.label)).toEqual(['x.gbz.db', 'mine.gam'])
  })
})
