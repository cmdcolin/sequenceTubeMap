// What the color legend says, derived once and drawn twice: as the HTML panel
// over the map, and as the <g> that goes into an exported figure. A figure
// that leaves without its key is one nobody else can read, and a key that
// disagrees with the panel on screen is worse than none.

import type { FileType, Tracks } from '../Types.ts'

// Palettes are named or hex strings. Deliberately looser than Types'
// ColorScheme, since tubemap.ts keeps its own shape and a legend describing a
// render has to take whatever that render was given.
export interface LegendScheme {
  mainPalette: string
  auxPalette?: string
}

export interface LegendRow {
  label: string
  palette: string
}

export interface LegendSection {
  // The track this describes: its file, or the display name an upload carried.
  label: string
  kind: FileType
  // Empty when nothing colored this track, which is worth showing as such.
  rows: LegendRow[]
}

export interface LegendReadGroup {
  name: string
  color: string
}

export interface LegendInput {
  tracks: Tracks
  // Indexed by track, as the renderer indexes them.
  colorSchemes: LegendScheme[]
  // Named read groups override strand coloring while any of them exists.
  readGroups?: LegendReadGroup[]
  otherReadsColor?: string
  ignoreStrand?: boolean
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

// Which palette actually colors what, per track type.
//
// Only a read track uses `mainPalette` for its bulk: everything else takes
// `mainPalette[0]` for the first track — the reference path — and colors every
// other path from `auxPalette` (see generateTrackColor). So a haplotype track,
// which is never the first, is drawn entirely in its aux palette, and a graph
// track carrying the non-reference paths itself needs both rows. Naming
// `mainPalette` for those would name a color nothing on screen is drawn in.
function schemeRows(
  type: FileType,
  scheme: LegendScheme,
  hasHaplotype: boolean,
  ignoreStrand: boolean,
): LegendRow[] {
  const aux = scheme.auxPalette
  if (type === 'read') {
    // ignoreStrand collapses the aux/reverse palette; show one Reads row.
    return ignoreStrand || aux === undefined
      ? [{ label: 'Reads', palette: scheme.mainPalette }]
      : [
          { label: 'Forward reads', palette: scheme.mainPalette },
          { label: 'Reverse reads', palette: aux },
        ]
  } else if (type === 'graph') {
    // With a haplotype track loaded, the paths beside the reference belong to
    // that track and are colored from its scheme instead of this one.
    return [
      { label: 'Reference path', palette: scheme.mainPalette },
      ...(hasHaplotype || aux === undefined
        ? []
        : [{ label: 'Other paths', palette: aux }]),
    ]
  } else if (type === 'haplotype') {
    return [{ label: 'Haplotypes', palette: aux ?? scheme.mainPalette }]
  } else {
    return [{ label: type, palette: scheme.mainPalette }]
  }
}

export function legendSections({
  tracks,
  colorSchemes,
  readGroups = [],
  otherReadsColor = 'greys',
  ignoreStrand = false,
}: LegendInput): LegendSection[] {
  const hasHaplotype = tracks.some(t => t.trackType === 'haplotype')
  return tracks.map((track, i) => {
    const scheme = colorSchemes[i]
    // Once any group exists every read is colored through the group system, so
    // the strand rows would name colors nothing on screen is drawn in.
    const grouped = track.trackType === 'read' && readGroups.length > 0
    return {
      label: trackLabel(
        track.trackFile,
        track.trackType,
        track.trackDisplayName,
      ),
      kind: track.trackType,
      rows: grouped
        ? [
            ...readGroups.map(g => ({ label: g.name, palette: g.color })),
            { label: 'Other reads', palette: otherReadsColor },
          ]
        : scheme === undefined
          ? []
          : schemeRows(track.trackType, scheme, hasHaplotype, ignoreStrand),
    }
  })
}
