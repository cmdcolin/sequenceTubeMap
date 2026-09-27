import type { HaplotypeShare } from '@gmod/tubemap-core'
import { interpolateOranges, interpolatePurples, rgb } from 'd3'
import type { ColorHex, ColorPaletteName } from '../Types.ts'

export const greys: readonly ColorHex[] = [
  '#d9d9d9',
  '#bdbdbd',
  '#969696',
  '#737373',
  '#525252',
  '#252525',
  '#000000',
]

// Greys but with a special color for the first thing.
export const ygreys: readonly ColorHex[] = [
  '#9467bd',
  '#d9d9d9',
  '#bdbdbd',
  '#969696',
  '#737373',
  '#525252',
  '#252525',
  '#000000',
]

export const blues: readonly ColorHex[] = [
  '#6baed6',
  '#4292c6',
  '#2171b5',
  '#08519c',
  '#08306b',
]

export const reds: readonly ColorHex[] = [
  '#fb6a4a',
  '#ef3b2c',
  '#cb181d',
  '#a50f15',
  '#67000d',
]

// d3 category10, with grey replaced by teal (grey is indistinct from read backgrounds)
export const plainColors: readonly ColorHex[] = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#1a9e77',
  '#bcbd22',
  '#17becf',
]

// d3 category10, lighter, with grey replaced by light teal
export const lightColors: readonly ColorHex[] = [
  '#ABCCE3',
  '#FFCFA5',
  '#B0DBB0',
  '#F0AEAE',
  '#D7C6E6',
  '#C6ABA5',
  '#F4CCE8',
  '#A0D4C0',
  '#E6E6AC',
  '#A8E7ED',
]

// Where a coarsened haplotype band's share sits on its ramp: from one
// haplotype to all of them, half log so rare bands separate and half linear so
// common ones do too. Starting the ramp partway in keeps its pale end visible
// on white.
const SHARE_RAMP_START = 0.45

function sharePosition({ count, total }: HaplotypeShare): number {
  if (total <= 1) return 1
  const log = Math.log(count) / Math.log(total)
  const linear = (count - 1) / (total - 1)
  return Math.min(1, Math.max(0, (log + linear) / 2))
}

function shareColorAt(position: number, reverse: boolean): ColorHex {
  const ramp = reverse ? interpolatePurples : interpolateOranges
  return rgb(
    ramp(SHARE_RAMP_START + (1 - SHARE_RAMP_START) * position),
  ).formatHex() as ColorHex
}

// Forward bands in orange, reverse-strand bands in purple
export function haplotypeShareColor(
  share: HaplotypeShare,
  reverse = false,
): ColorHex {
  return shareColorAt(sharePosition(share), reverse)
}

export function haplotypeShareRamp(reverse = false): ColorHex[] {
  return [0, 0.25, 0.5, 0.75, 1].map(p => shareColorAt(p, reverse))
}

// "sequential" palettes are gradations along a single hue; "categorical"
// palettes are sets of distinguishable colors with no implied ordering.
export type PaletteKind = 'sequential' | 'categorical'

export interface PaletteInfo {
  name: ColorPaletteName
  label: string
  kind: PaletteKind
  colors: readonly ColorHex[]
}

export const PALETTES: readonly PaletteInfo[] = [
  { name: 'greys', label: 'Greys', kind: 'sequential', colors: greys },
  {
    name: 'ygreys',
    label: 'Greys (with purple)',
    kind: 'sequential',
    colors: ygreys,
  },
  { name: 'blues', label: 'Blues', kind: 'sequential', colors: blues },
  { name: 'reds', label: 'Reds', kind: 'sequential', colors: reds },
  {
    name: 'plainColors',
    label: 'Plain (categorical)',
    kind: 'categorical',
    colors: plainColors,
  },
  {
    name: 'lightColors',
    label: 'Light (categorical)',
    kind: 'categorical',
    colors: lightColors,
  },
]

// A palette by name, or a single custom color given as a bare hex
export function paletteColors(name: string | undefined): readonly string[] {
  if (name?.startsWith('#')) {
    return [name]
  }
  return PALETTES.find(entry => entry.name === name)?.colors ?? greys
}
