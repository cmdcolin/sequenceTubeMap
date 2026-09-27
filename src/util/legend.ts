// What the color legend says, derived once and drawn twice: as the HTML panel
// over the map, and as the <g> that goes into an exported figure. A figure
// that leaves without its key is one nobody else can read, and a key that
// disagrees with the panel on screen is worse than none.

import type { Coarsening } from '@gmod/tubemap-core'
import type { FileType, Tracks } from '../Types.ts'
import { haplotypeShareRamp } from './palettes.ts'
import {
  MAX_MAPPING_QUALITY,
  mappingQualityAlpha,
  mappingQualityColor,
} from './mappingQuality.ts'

// Palettes are named or hex strings. Deliberately looser than Types'
// ColorScheme, since tubemap.ts keeps its own shape and a legend describing a
// render has to take whatever that render was given.
export interface LegendScheme {
  mainPalette: string
  auxPalette?: string
}

export type LegendRow =
  | { label: string; palette: string }
  // A continuous scale, low to high
  | { label: string; ramp: readonly string[] }

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
  colorReadsByMappingQuality?: boolean
  alphaReadsByMappingQuality?: boolean
  // What the layout drew as bands, which keep only their strand coloring
  coarsened?: Coarsening | undefined
}

// Everything but the track list, which is what the renderer reports
export type LegendColoring = Omit<LegendInput, 'tracks'>

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

const MAPPING_QUALITY_RANGE = `0–${MAX_MAPPING_QUALITY}`

function mappingQualityRamp(color: (quality: number) => string): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map(f => color(f * MAX_MAPPING_QUALITY))
}

// Black at each opacity, flattened onto the panel's white, so the key needs no
// transparency of its own
function fadedBlack(quality: number): string {
  const level = Math.round(255 * (1 - mappingQualityAlpha(quality)))
    .toString(16)
    .padStart(2, '0')
  return `#${level}${level}${level}`
}

// "reads" gives Forward reads / Reverse reads, or just Reads when nothing
// drawn is reverse-strand
function strandRows(
  noun: string,
  scheme: LegendScheme,
  forwardOnly: boolean,
): LegendRow[] {
  const aux = scheme.auxPalette
  return forwardOnly || aux === undefined
    ? [
        {
          label: noun.charAt(0).toUpperCase() + noun.slice(1),
          palette: scheme.mainPalette,
        },
      ]
    : [
        { label: `Forward ${noun}`, palette: scheme.mainPalette },
        { label: `Reverse ${noun}`, palette: aux },
      ]
}

// Read groups win over mapping quality, which wins over strand, as in
// tubemap.ts's generateTrackColor. Opacity is a channel of its own and applies
// under any of them.
function readRows(
  scheme: LegendScheme | undefined,
  input: LegendInput,
): LegendRow[] {
  const ignoreStrand = input.ignoreStrand ?? false
  if (input.coarsened?.unit === 'read') {
    return scheme === undefined
      ? []
      : strandRows('read bands', scheme, !input.coarsened.reverse)
  }
  const readGroups = input.readGroups ?? []
  const colors: LegendRow[] =
    readGroups.length > 0
      ? [
          ...readGroups.map(g => ({ label: g.name, palette: g.color })),
          { label: 'Other reads', palette: input.otherReadsColor ?? 'greys' },
        ]
      : input.colorReadsByMappingQuality
        ? [
            {
              label: `Mapping quality ${MAPPING_QUALITY_RANGE}`,
              ramp: mappingQualityRamp(mappingQualityColor),
            },
          ]
        : scheme === undefined
          ? []
          : strandRows('reads', scheme, ignoreStrand)
  return input.alphaReadsByMappingQuality
    ? [
        ...colors,
        {
          label: `Opacity, mapping quality ${MAPPING_QUALITY_RANGE}`,
          ramp: mappingQualityRamp(fadedBlack),
        },
      ]
    : colors
}

// A ramp from one of the haplotypes beside the reference lane to all of them
function shareRows({ total, reverse }: Coarsening): LegendRow[] {
  const span =
    total === 1
      ? 'the one other haplotype'
      : `1 to all ${total.toLocaleString()} other haplotypes`
  return reverse
    ? [
        { label: `Forward bands, ${span}`, ramp: haplotypeShareRamp() },
        { label: `Reverse bands, ${span}`, ramp: haplotypeShareRamp(true) },
      ]
    : [{ label: `Bands, ${span}`, ramp: haplotypeShareRamp() }]
}

// Which palette actually colors what, for everything but reads.
//
// Everything but a read takes `mainPalette[0]` for the first track — the
// reference path — and colors every other path from `auxPalette` (see
// generateTrackColor). So a haplotype track, which is never the first, is
// drawn entirely in its aux palette, and a graph track carrying the
// non-reference paths itself needs both rows. Naming `mainPalette` for those
// would name a color nothing on screen is drawn in. Coarsened haplotypes are
// bands, shaded by their share of the haplotypes.
function pathRows(
  type: FileType,
  scheme: LegendScheme,
  hasHaplotype: boolean,
  input: LegendInput,
): LegendRow[] {
  const aux = scheme.auxPalette
  const bands =
    input.coarsened?.unit === 'haplotype'
      ? shareRows(input.coarsened)
      : undefined
  if (type === 'graph') {
    // With a haplotype track loaded, the paths beside the reference belong to
    // that track and are colored from its scheme instead of this one.
    return [
      { label: 'Reference path', palette: scheme.mainPalette },
      ...(hasHaplotype
        ? []
        : (bands ??
          (aux === undefined ? [] : [{ label: 'Other paths', palette: aux }]))),
    ]
  } else if (type === 'haplotype') {
    return (
      bands ?? [{ label: 'Haplotypes', palette: aux ?? scheme.mainPalette }]
    )
  } else {
    return [{ label: type, palette: scheme.mainPalette }]
  }
}

export function legendSections(input: LegendInput): LegendSection[] {
  const hasHaplotype = input.tracks.some(t => t.trackType === 'haplotype')
  return input.tracks.map((track, i) => {
    const scheme = input.colorSchemes[i]
    return {
      label: trackLabel(
        track.trackFile,
        track.trackType,
        track.trackDisplayName,
      ),
      kind: track.trackType,
      rows:
        track.trackType === 'read'
          ? readRows(scheme, input)
          : scheme === undefined
            ? []
            : pathRows(track.trackType, scheme, hasHaplotype, input),
    }
  })
}
