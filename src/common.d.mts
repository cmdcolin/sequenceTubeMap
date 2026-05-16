// Type declarations for common.mjs (kept as .mjs so the Node server can import
// it directly without a TS build step).

import type { ColorScheme, Tracks } from './Types'

export interface RangeRegion {
  contig: string
  start: number
  end: number
}

export interface DistanceRegion {
  contig: string
  start: number
  distance: number
}

export type Region = RangeRegion | DistanceRegion

export function parseRegion(region: string): Region
export function convertRegionToRangeRegion(region: Region): RangeRegion
export function stringifyRangeRegion(region: RangeRegion): string
export function stringifyRegion(region: Region): string
export function defaultTrackColors(trackType: string): ColorScheme
export function readsExist(tracks: Tracks): boolean
export function isValidURL(value: string | undefined | null): boolean
export function isEmpty(obj: object): boolean
