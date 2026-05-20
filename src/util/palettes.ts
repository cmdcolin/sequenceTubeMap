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

// d3 category10
export const plainColors: readonly ColorHex[] = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
]

// d3 category10, lighter
export const lightColors: readonly ColorHex[] = [
  '#ABCCE3',
  '#FFCFA5',
  '#B0DBB0',
  '#F0AEAE',
  '#D7C6E6',
  '#C6ABA5',
  '#F4CCE8',
  '#CFCFCF',
  '#E6E6AC',
  '#A8E7ED',
]

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
  { name: 'ygreys', label: 'Greys (with purple)', kind: 'sequential', colors: ygreys },
  { name: 'blues', label: 'Blues', kind: 'sequential', colors: blues },
  { name: 'reds', label: 'Reds', kind: 'sequential', colors: reds },
  { name: 'plainColors', label: 'Plain (categorical)', kind: 'categorical', colors: plainColors },
  { name: 'lightColors', label: 'Light (categorical)', kind: 'categorical', colors: lightColors },
]
