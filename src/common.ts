// Shared functions between client and server.
// NOTE: Do NOT import config.json here — it requires syntax incompatible with
// the server's ESM runtime. Config is set up by config-client.js (browser) or
// config-server.mjs (Node) before this module loads.
import { config } from './config-global.mjs'
import type { BaseTrack, ColorScheme, FileType } from './Types.ts'

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

function removeCommas(input: string): string {
  const colonIndex = input.lastIndexOf(':')
  if (colonIndex >= 0) {
    return input.slice(0, colonIndex + 1) + input.slice(colonIndex + 1).replace(/,/g, '')
  } else {
    return input
  }
}

// Parse a region string like "17:1-100" into { contig, start, end }
// or "17:1+100" into { contig, start, distance }.
// Commas in coordinates are ignored. Throws if the region is not understood.
export function parseRegion(region: string): Region {
  if (!region || region === 'none') {
    throw new Error('Missing region.')
  }
  if (!region.includes(':')) {
    throw new Error("Region doesn't contain a ':'.")
  }
  if (region.endsWith(':')) {
    throw new Error("Region ends with a ':' and is missing coordinates.")
  }

  const cleaned = removeCommas(region)
  const colonIndex = cleaned.lastIndexOf(':')
  const contig = cleaned.slice(0, colonIndex)
  const coords = cleaned.slice(colonIndex + 1)

  const rangeMatch = /^(\d+)-(\d+)$/.exec(coords)
  const distMatch = /^(\d+)\+(\d+)$/.exec(coords)

  if (rangeMatch !== null) {
    return { contig, start: Number(rangeMatch[1]!), end: Number(rangeMatch[2]!) }
  } else if (distMatch !== null) {
    return { contig, start: Number(distMatch[1]!), distance: Number(distMatch[2]!) }
  } else {
    throw new Error("Coordinates must be in the form 'X:Y-Z' or 'X:Y+Z'.")
  }
}

export function convertRegionToRangeRegion(region: Region): RangeRegion {
  if ('distance' in region) {
    return { contig: region.contig, start: region.start, end: region.start + region.distance }
  } else {
    return region
  }
}

export function stringifyRangeRegion({ contig, start, end }: RangeRegion): string {
  return `${contig}:${start}-${end}`
}

export function stringifyRegion(region: Region): string {
  if ('distance' in region) {
    return `${region.contig}:${region.start}+${region.distance}`
  } else {
    return stringifyRangeRegion(region)
  }
}

export function defaultTrackColors(trackType: FileType): ColorScheme {
  if (trackType === 'graph') {
    return config.defaultGraphColorPalette
  } else if (trackType === 'read') {
    return config.defaultReadColorPalette
  } else if (trackType === 'haplotype' || trackType === 'node' || trackType === 'translation') {
    return config.defaultHaplotypeColorPalette
  } else {
    throw new Error('Invalid track type: ' + trackType)
  }
}

export function readsExist(tracks: BaseTrack[]): boolean {
  return tracks.some(t => t.trackType === 'read')
}

export function isValidURL(value: string | undefined | null): boolean {
  if (value) {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  } else {
    return false
  }
}

export function isEmpty(obj: object): boolean {
  return Object.keys(obj).length === 0
}
