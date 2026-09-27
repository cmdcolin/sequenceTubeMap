// What the color legend says, derived once and drawn twice: as the HTML panel
// over the map, and as the <g> that goes into an exported figure. A figure
// that leaves without its key is one nobody else can read, and a key that
// disagrees with the panel on screen is worse than none.
//
// Each loaded file is a section, and its rows come from the scales that
// colored the tracks the last draw placed from that file. A file that placed
// nothing gets no rows rather than a key to colors nothing in view has.

import type { FileType, Tracks } from '../Types.ts'
import {
  alphaScaleFor,
  type Coloring,
  colorScaleFor,
  type DrawnTrack,
  type Mark,
} from './encoding.ts'
import type { LegendRow, Scheme } from './scales.ts'

export type { LegendRow } from './scales.ts'

// Looser than Types' ColorScheme, since a legend describing a render has to
// take whatever that render was given.
export type LegendScheme = Scheme

export interface LegendSection {
  // The track this describes: its file, or the display name an upload carried.
  label: string
  kind: FileType
  // Empty when the file drew nothing, which is worth showing as such.
  rows: LegendRow[]
}

// What the renderer reports about its last draw
export interface LegendColoring extends Coloring {
  // Indexed by track, as the renderer indexes them.
  colorSchemes: (LegendScheme | undefined)[]
  // What the draw placed, which is what the rows key
  drawn: readonly DrawnTrack[]
}

export interface LegendInput extends LegendColoring {
  tracks: Tracks
}

// Keyed in this order within a section
const MARKS: readonly Mark[] = [
  'reference',
  'path',
  'read',
  'readBand',
  'haplotypeBand',
]

function trackLabel(
  file: string | undefined,
  type: string,
  displayName: string | undefined,
): string {
  // displayName is set by UploadPanel to the original filename, since
  // `trackFile` for LocalAPI uploads is an opaque numeric registry id.
  if (displayName) {
    return displayName
  }
  if (!file) {
    return `(unset ${type})`
  }
  return file.split('/').pop() ?? file
}

// With a haplotype file loaded, the paths beside the reference are its tracks
// rather than the graph's
function nounFor(type: FileType, mark: Mark): string {
  switch (mark) {
    case 'reference':
      return 'reference path'
    case 'path':
      return type === 'graph' ? 'other paths' : 'haplotypes'
    case 'read':
      return 'reads'
    case 'readBand':
      return 'read bands'
    case 'haplotypeBand':
      return 'bands'
  }
}

function rowsFor(
  type: FileType,
  scheme: LegendScheme | undefined,
  drawn: readonly DrawnTrack[],
  coloring: Coloring,
): LegendRow[] {
  return MARKS.flatMap(mark => {
    const ofMark = drawn.filter(track => track.mark === mark)
    if (ofMark.length === 0) {
      return []
    }
    const noun = nounFor(type, mark)
    return [
      ...(colorScaleFor(mark, scheme, coloring)?.rows(noun, ofMark) ?? []),
      ...(alphaScaleFor(mark, coloring)?.rows() ?? []),
    ]
  })
}

export function legendSections(input: LegendInput): LegendSection[] {
  return input.tracks.map((track, i) => ({
    label: trackLabel(track.trackFile, track.trackType, track.trackDisplayName),
    kind: track.trackType,
    rows: rowsFor(
      track.trackType,
      input.colorSchemes[i],
      input.drawn.filter(drawn => drawn.source === i),
      input,
    ),
  }))
}
