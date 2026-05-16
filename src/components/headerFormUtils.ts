import { convertRegionToRangeRegion, parseRegion } from '../common.mjs'
import type {
  AvailableTrack,
  RegionInfo,
  Track,
  Tracks,
  ViewTarget,
} from '../Types'

// Return true if file is set to a string file name or URL, and false if it is
// falsey or the "none" sentinel.
export function isSet(file: string | undefined | null): file is string {
  return !!file && file !== 'none'
}

// Stringly-typed key for tracks (no tuple in JS).
function makeKey(track: Track | AvailableTrack) {
  return JSON.stringify([track.trackType, track.trackFile])
}

export function makeAvailableTrackSet(availableTracks: AvailableTrack[]) {
  const available = new Set<string>()
  for (const track of availableTracks) {
    if (!track.trackIsImplied) {
      available.add(makeKey(track))
    }
  }
  return available
}

export function trackIsImplied(
  track: Track | AvailableTrack,
  availableTrackSet: Set<string>,
) {
  return !availableTrackSet.has(makeKey(track))
}

export function trackListWithImplied(
  availableTracks: AvailableTrack[],
  availableTrackSet: Set<string>,
  currentTracks: Tracks,
): AvailableTrack[] {
  const real = availableTracks.filter(t => !t.trackIsImplied)
  const implied: AvailableTrack[] = Object.values(currentTracks)
    .filter(t => trackIsImplied(t, availableTrackSet))
    .map(t => ({
      trackType: t.trackType,
      trackFile: t.trackFile,
      trackIsImplied: true,
    }))
  return [...real, ...implied]
}

export function firstGraphTrack(tracks: Tracks): Track | null {
  for (const key in tracks) {
    if (tracks[key].trackType === 'graph') {
      return tracks[key]
    }
  }
  return null
}

export function tracksFromArray(array: Track[]): Tracks {
  return Object.fromEntries(array.map((t, i) => [i, t]))
}

// Checks if two track objects are equivalent for the purpose of viewTarget
// equality (same file, same color settings).
function tracksEqual(curr: Track | undefined, next: Track | undefined) {
  if ((curr === undefined) !== (next === undefined)) {
    return false
  }
  if (!curr || !next) {
    return true
  }
  const cs = curr.trackColorSettings
  const ns = next.trackColorSettings
  if (cs && ns) {
    if (
      cs.mainPalette !== ns.mainPalette ||
      cs.auxPalette !== ns.auxPalette ||
      cs.colorReadsByMappingQuality !== ns.colorReadsByMappingQuality ||
      cs.alphaReadsByMappingQuality !== ns.alphaReadsByMappingQuality
    ) {
      return false
    }
  }
  return (!curr.trackFile && !next.trackFile) || curr.trackFile === next.trackFile
}

// Two view targets are equal if they have the same tracks, region, and flags.
export function viewTargetsEqual(
  a: ViewTarget | undefined,
  b: ViewTarget | undefined,
) {
  if ((a === undefined) !== (b === undefined)) return false
  if (!a || !b) return true
  if (Object.keys(a.tracks).length !== Object.keys(b.tracks).length) return false
  for (const key in a.tracks) {
    if (!tracksEqual(a.tracks[key], b.tracks[key])) return false
  }
  return (
    a.bedFile === b.bedFile &&
    a.region === b.region &&
    a.simplify === b.simplify &&
    a.removeSequences === b.removeSequences
  )
}

// Returns the region index (in regionInfo) matching a region string, or null.
export const determineRegionIndex = (
  regionString: string,
  regionInfo: RegionInfo,
): number | null => {
  let parsed
  try {
    parsed = convertRegionToRangeRegion(parseRegion(regionString))
  } catch {
    return null
  }
  const chr = regionInfo.chr
  if (chr) {
    for (let i = 0; i < chr.length; i++) {
      if (
        parseInt(regionInfo.start![i]) === parsed.start &&
        parseInt(regionInfo.end![i]) === parsed.end &&
        chr[i] === parsed.contig
      ) {
        return i
      }
    }
  }
  return null
}

// Reconstructs a region string from an index into regionInfo.
export const regionStringFromRegionIndex = (
  regionIndex: number,
  regionInfo: RegionInfo,
): string => {
  return `${regionInfo.chr![regionIndex]}:${regionInfo.start![regionIndex]}-${regionInfo.end![regionIndex]}`
}

export function regionDescByCoords(coords: string, ri: RegionInfo) {
  const chr = ri.chr
  if (chr) {
    for (let i = 0; i < chr.length; i++) {
      if (coords === regionStringFromRegionIndex(i, ri)) {
        return ri.desc?.[i] ?? null
      }
    }
  }
  return null
}
