// Each scale maps a drawn track to its color or opacity, and keys that same
// mapping as legend rows for the tracks actually drawn. A key built from a
// scale can't disagree with it, and a key trained on the drawing can't name a
// color nothing in view has.
import type { HaplotypeShare } from '@jbrowse/tubemap-core'
import {
  MAX_MAPPING_QUALITY,
  mappingQualityAlpha,
  mappingQualityColor,
} from './mappingQuality.ts'
import {
  haplotypeShareColor,
  haplotypeShareRamp,
  paletteColors,
} from './palettes.ts'
import { formatTrackDisplayName } from './trackName.ts'

// What a drawn track is, as far as coloring goes
export type Mark = 'reference' | 'path' | 'read' | 'readBand' | 'haplotypeBand'

// A drawn track projected onto the variables the scales read: the data the
// scales color and the legend is trained on
export interface DrawnTrack {
  mark: Mark
  // Index of the loaded file it came from
  source: number
  id: number
  name?: string
  reverse: boolean
  mappingQuality?: number
  // Index of the read group that colors it, for a read in one
  group?: number
  share?: HaplotypeShare
}

// Palettes by name, or a bare hex for a single custom color
export interface Scheme {
  mainPalette: string
  auxPalette?: string
}

export type LegendRow =
  | { label: string; palette: string }
  // A continuous scale, low to high
  | { label: string; ramp: readonly string[] }

// `noun` names the tracks the rows key, lowercase and plural: "reads".
// `drawn` is what this scale colored, and trains the rows: a value nothing
// drawn takes gets no row.
export interface ColorScale {
  map(track: DrawnTrack): string
  rows(noun: string, drawn: readonly DrawnTrack[]): LegendRow[]
}

export interface AlphaScale {
  map(track: DrawnTrack): number
  rows(): LegendRow[]
}

export interface ReadGroupColor {
  name?: string
  color: string
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The palette named when a scheme leaves one unset, as paletteColors falls back
const FALLBACK_PALETTE = 'greys'

function staggered(palette: string, id: number): string {
  const colors = paletteColors(palette)
  return colors[id % colors.length]!
}

function trackLabel(track: DrawnTrack): string {
  return track.name === undefined
    ? `#${track.id}`
    : formatTrackDisplayName(track.name)
}

// The strand qualifies a row only where it tells the reader something: once
// anything drawn is reverse, its row has to say so, and the forward row then
// says so too
function strandRows(
  noun: string,
  drawn: readonly DrawnTrack[],
  ignoreStrand: boolean,
  row: (strand: 'Forward' | 'Reverse' | undefined) => LegendRow,
): LegendRow[] {
  if (ignoreStrand || !drawn.some(t => t.reverse)) {
    return [row(undefined)]
  }
  return [
    ...(drawn.some(t => !t.reverse) ? [row('Forward')] : []),
    row('Reverse'),
  ]
}

const strandLabel = (strand: string | undefined, noun: string) =>
  strand === undefined ? capitalize(noun) : `${strand} ${noun}`

// Forward from the main palette, reverse from the aux, staggered by id
export function strandScale(scheme: Scheme, ignoreStrand: boolean): ColorScale {
  const aux = scheme.auxPalette ?? FALLBACK_PALETTE
  return {
    map: track =>
      staggered(
        track.reverse && !ignoreStrand ? aux : scheme.mainPalette,
        track.id,
      ),
    rows: (noun, drawn) =>
      strandRows(noun, drawn, ignoreStrand, strand => ({
        label: strandLabel(strand, noun),
        palette: strand === 'Reverse' ? aux : scheme.mainPalette,
      })),
  }
}

// One color, the main palette's first, so its key is a single swatch naming
// the path
export function referenceScale(scheme: Scheme): ColorScale {
  const color = paletteColors(scheme.mainPalette)[0]!
  return {
    map: () => color,
    rows: (noun, drawn) =>
      drawn.map(track => ({
        label:
          track.name === undefined
            ? capitalize(noun)
            : `${capitalize(noun)} ${trackLabel(track)}`,
        palette: color,
      })),
  }
}

// The paths beside the reference, which leave the reference's color to it.
// Each gets its own row while the palette can tell them apart; past that the
// colors repeat, so one row shows the palette they cycle through.
export function pathScale(scheme: Scheme): ColorScale {
  const aux = scheme.auxPalette ?? FALLBACK_PALETTE
  const colors = paletteColors(aux)
  const color = (track: DrawnTrack) =>
    colors[(track.id - 1 + colors.length) % colors.length]!
  return {
    map: color,
    rows: (noun, drawn) =>
      drawn.length <= colors.length
        ? [...drawn]
            .sort((a, b) => a.id - b.id)
            .map(track => ({ label: trackLabel(track), palette: color(track) }))
        : [{ label: `${drawn.length.toLocaleString()} ${noun}`, palette: aux }],
  }
}

// A coarsened haplotype band, shaded by its share of the banded haplotypes
export function shareScale(ignoreStrand: boolean): ColorScale {
  return {
    map: track =>
      haplotypeShareColor(track.share!, track.reverse && !ignoreStrand),
    rows: (noun, drawn) => {
      const totals = new Set(drawn.map(track => track.share?.total))
      const [total] = totals
      if (total === undefined) {
        return []
      }
      // Panels faceted by sample band their own haplotypes, each its own total
      const span =
        totals.size > 1
          ? "1 to all of a panel's other haplotypes"
          : total === 1
            ? 'the one other haplotype'
            : `1 to all ${total.toLocaleString()} other haplotypes`
      return strandRows(noun, drawn, ignoreStrand, strand => ({
        label: `${strandLabel(strand, noun)}, ${span}`,
        ramp: haplotypeShareRamp(strand === 'Reverse'),
      }))
    },
  }
}

// Reads in no group take `otherColor`
export function readGroupScale(
  groups: readonly ReadGroupColor[],
  otherColor: string,
): ColorScale {
  return {
    map: track =>
      staggered(
        track.group === undefined ? otherColor : groups[track.group]!.color,
        track.id,
      ),
    rows: (noun, drawn) => [
      ...groups.flatMap((g, i) =>
        drawn.some(t => t.group === i)
          ? [{ label: g.name ?? `Group ${i + 1}`, palette: g.color }]
          : [],
      ),
      ...(drawn.some(t => t.group === undefined)
        ? [{ label: `Other ${noun}`, palette: otherColor }]
        : []),
    ],
  }
}

const MAPPING_QUALITY_RANGE = `0–${MAX_MAPPING_QUALITY}`

function mappingQualityRamp(color: (quality: number) => string): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map(f => color(f * MAX_MAPPING_QUALITY))
}

export const mappingQualityColorScale: ColorScale = {
  map: track => mappingQualityColor(track.mappingQuality),
  rows: () => [
    {
      label: `Mapping quality ${MAPPING_QUALITY_RANGE}`,
      ramp: mappingQualityRamp(mappingQualityColor),
    },
  ],
}

// Black at each opacity, flattened onto the panel's white, so the key needs no
// transparency of its own
function fadedBlack(quality: number): string {
  const level = Math.round(255 * (1 - mappingQualityAlpha(quality)))
    .toString(16)
    .padStart(2, '0')
  return `#${level}${level}${level}`
}

export const mappingQualityAlphaScale: AlphaScale = {
  map: track => mappingQualityAlpha(track.mappingQuality),
  rows: () => [
    {
      label: `Opacity, mapping quality ${MAPPING_QUALITY_RANGE}`,
      ramp: mappingQualityRamp(fadedBlack),
    },
  ],
}
