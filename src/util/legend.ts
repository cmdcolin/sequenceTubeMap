// What the color legend says, derived once and drawn twice: as the HTML panel
// over the map, and as the <g> that goes into an exported figure. A figure
// that leaves without its key is one nobody else can read, and a key that
// disagrees with the panel on screen is worse than none.

import type { FileType, Tracks } from '../Types.ts'
import {
  alphaScaleFor,
  type Coloring,
  colorScaleFor,
  fileMarks,
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
  // Empty when nothing colored this track, which is worth showing as such.
  rows: LegendRow[]
}

// Everything but the track list, which is what the renderer reports
export interface LegendColoring extends Coloring {
  // Indexed by track, as the renderer indexes them.
  colorSchemes: (LegendScheme | undefined)[]
}

export interface LegendInput extends LegendColoring {
  tracks: Tracks
}

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

function rowsFor(
  type: FileType,
  scheme: LegendScheme | undefined,
  input: LegendInput,
  hasHaplotype: boolean,
): LegendRow[] {
  const marks = fileMarks(type, input, hasHaplotype)
  if (marks === undefined) {
    return scheme === undefined
      ? []
      : [{ label: type, palette: scheme.mainPalette }]
  }
  return marks.flatMap(({ mark, noun }) => [
    ...(colorScaleFor(mark, scheme, input)?.rows(noun) ?? []),
    ...(alphaScaleFor(mark, input)?.rows() ?? []),
  ])
}

export function legendSections(input: LegendInput): LegendSection[] {
  const hasHaplotype = input.tracks.some(t => t.trackType === 'haplotype')
  return input.tracks.map((track, i) => ({
    label: trackLabel(track.trackFile, track.trackType, track.trackDisplayName),
    kind: track.trackType,
    rows: rowsFor(track.trackType, input.colorSchemes[i], input, hasHaplotype),
  }))
}
