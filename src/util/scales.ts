// Each scale maps a drawn track to its color or opacity, and keys that same
// mapping as legend rows, so a key built from a scale can't disagree with it.
import type { ColorableTrack, Coarsening } from '@gmod/tubemap-core'
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

// Palettes by name, or a bare hex for a single custom color
export interface Scheme {
  mainPalette: string
  auxPalette?: string
}

export type LegendRow =
  | { label: string; palette: string }
  // A continuous scale, low to high
  | { label: string; ramp: readonly string[] }

// `noun` names the tracks the rows key, lowercase and plural: "reads"
export interface ColorScale {
  color(track: ColorableTrack): string
  rows(noun: string): LegendRow[]
}

export interface AlphaScale {
  alpha(track: ColorableTrack): number
  rows(): LegendRow[]
}

// The renderer needs a group's reads to color by it; its key needs only the name
export interface ReadGroupColor {
  name?: string
  color: string
  reads?: ReadonlySet<string>
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The palette named when a scheme leaves one unset, as paletteColors falls back
const FALLBACK_PALETTE = 'greys'

function staggered(palette: string, id: number): string {
  const colors = paletteColors(palette)
  return colors[id % colors.length]!
}

// Forward from the main palette, reverse from the aux, staggered by id.
// `keyReverse` says whether anything drawn can be reverse-strand.
export function strandScale(
  scheme: Scheme,
  ignoreStrand: boolean,
  keyReverse: boolean,
): ColorScale {
  const aux = scheme.auxPalette ?? FALLBACK_PALETTE
  return {
    color: track =>
      staggered(
        track.is_reverse === true && !ignoreStrand ? aux : scheme.mainPalette,
        track.id,
      ),
    rows: noun =>
      keyReverse
        ? [
            { label: `Forward ${noun}`, palette: scheme.mainPalette },
            { label: `Reverse ${noun}`, palette: aux },
          ]
        : [{ label: capitalize(noun), palette: scheme.mainPalette }],
  }
}

// One color, the main palette's first, so its key is a single swatch
export function referenceScale(scheme: Scheme): ColorScale {
  const color = paletteColors(scheme.mainPalette)[0]!
  return {
    color: () => color,
    rows: noun => [{ label: capitalize(noun), palette: color }],
  }
}

// The paths beside the reference, which leave the reference's color to it
export function pathScale(scheme: Scheme): ColorScale {
  const aux = scheme.auxPalette ?? FALLBACK_PALETTE
  return {
    color: track => {
      const colors = paletteColors(aux)
      return colors[(track.id - 1 + colors.length) % colors.length]!
    },
    rows: noun => [{ label: capitalize(noun), palette: aux }],
  }
}

// A coarsened haplotype band, shaded by its share of the banded haplotypes
export function shareScale(
  coarsened: Coarsening | undefined,
  ignoreStrand: boolean,
): ColorScale {
  return {
    color: track =>
      haplotypeShareColor(
        track.haplotypeShare!,
        track.is_reverse === true && !ignoreStrand,
      ),
    rows: noun => {
      if (coarsened === undefined) {
        return []
      }
      const { total, reverse } = coarsened
      const span =
        total === 1
          ? 'the one other haplotype'
          : `1 to all ${total.toLocaleString()} other haplotypes`
      return reverse
        ? [
            { label: `Forward ${noun}, ${span}`, ramp: haplotypeShareRamp() },
            {
              label: `Reverse ${noun}, ${span}`,
              ramp: haplotypeShareRamp(true),
            },
          ]
        : [
            {
              label: `${capitalize(noun)}, ${span}`,
              ramp: haplotypeShareRamp(),
            },
          ]
    },
  }
}

// Last group wins on overlap; reads in no group take `otherColor`
export function readGroupScale(
  groups: readonly ReadGroupColor[],
  otherColor: string,
): ColorScale {
  return {
    color: track => {
      const { name } = track
      for (let i = groups.length - 1; i >= 0; i--) {
        if (name !== undefined && groups[i]!.reads?.has(name)) {
          return staggered(groups[i]!.color, track.id)
        }
      }
      return staggered(otherColor, track.id)
    },
    rows: noun => [
      ...groups.map((g, i) => ({
        label: g.name ?? `Group ${i + 1}`,
        palette: g.color,
      })),
      { label: `Other ${noun}`, palette: otherColor },
    ],
  }
}

const MAPPING_QUALITY_RANGE = `0–${MAX_MAPPING_QUALITY}`

function mappingQualityRamp(color: (quality: number) => string): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map(f => color(f * MAX_MAPPING_QUALITY))
}

export const mappingQualityColorScale: ColorScale = {
  color: track => mappingQualityColor(track.mapping_quality),
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
  alpha: track => mappingQualityAlpha(track.mapping_quality),
  rows: () => [
    {
      label: `Opacity, mapping quality ${MAPPING_QUALITY_RANGE}`,
      ramp: mappingQualityRamp(fadedBlack),
    },
  ],
}
