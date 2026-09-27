import { interpolateOranges, rgb } from 'd3'
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

// A coarsened haplotype band's share of the haplotypes, log-scaled from 1% so
// a singleton in a hundred-haplotype cohort still shows. Oranges starts at 0.4
// to keep that pale end off the white page and away from the reference lane.
const SHARE_FLOOR = 0.01
const SHARE_RAMP_START = 0.4

export function haplotypeShareColor(share: number): ColorHex {
  const t = Math.min(
    1,
    Math.max(0, 1 - Math.log10(share) / Math.log10(SHARE_FLOOR)),
  )
  return rgb(
    interpolateOranges(SHARE_RAMP_START + (1 - SHARE_RAMP_START) * t),
  ).formatHex() as ColorHex
}

export const haplotypeShare: readonly ColorHex[] = [
  0.01, 0.03, 0.1, 0.3, 1,
].map(haplotypeShareColor)

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
