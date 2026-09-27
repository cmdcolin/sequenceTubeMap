import {
  convertRegionToRangeRegion,
  defaultTrackColors,
  parseRegion,
} from '../common.ts'

export const dataTypes = {
  BUILT_IN: 'built-in',
  CUSTOM_FILES: 'mounted files',
  EXAMPLES: 'examples',
} as const
import type {
  AvailableTrack,
  FolderManifest,
  RegionInfo,
  Track,
  Tracks,
  ViewTarget,
} from '../Types.ts'

// Return true if file is set to a string file name or URL, and false if it is
// falsey or the "none" sentinel.
export function isSet(file: string | undefined | null): file is string {
  return !!file && file !== 'none'
}

// Stringly-typed key for tracks (no tuple in JS).
function makeKey(track: Track | AvailableTrack) {
  return `${track.trackType}|${track.trackFile ?? ''}`
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
  const implied: AvailableTrack[] = currentTracks
    .filter(t => trackIsImplied(t, availableTrackSet))
    .map(t => ({
      trackType: t.trackType,
      trackFile: t.trackFile,
      trackIsImplied: true,
    }))
  return [...real, ...implied]
}

export function firstGraphTrack(tracks: Tracks): Track | null {
  return tracks.find(t => t.trackType === 'graph') ?? null
}

// Inputs for building a ViewTarget. All fields are explicit so callers can't
// accidentally mix freshly-set state (e.g. just-changed region) with closure
// reads of state that hasn't re-rendered yet. Returns a complete ViewTarget
// with the simplify flag normalized against the resolved track set.
export interface ViewTargetInputs {
  tracks: Tracks
  bedFile: string | undefined
  name: string | undefined
  region: string
  dataType: string
  simplify: boolean
  removeSequences: boolean
}

// `vg simplify` cannot run over reads, so a view with a read track is never
// simplified, whatever it asks for.
export function simplifyApplies(tracks: Tracks, simplify: boolean | undefined) {
  return (simplify ?? false) && !tracks.some(t => t.trackType === 'read')
}

export function makeViewTarget(inputs: ViewTargetInputs): ViewTarget {
  return {
    tracks: inputs.tracks,
    bedFile: inputs.bedFile,
    name: inputs.name,
    region: inputs.region,
    dataType: inputs.dataType,
    simplify: simplifyApplies(inputs.tracks, inputs.simplify),
    removeSequences: inputs.removeSequences,
  }
}

function parentDir(filePath: string) {
  const idx = filePath.lastIndexOf('/')
  return idx === -1 ? '' : filePath.slice(0, idx)
}

function trimTrailingSlash(s: string) {
  return s.endsWith('/') ? s.slice(0, -1) : s
}

// Synthesize ViewTarget entries from immediate subdirectories of the mounted
// data path that either (a) contain a manifest.json or (b) contain at least
// one graph file. Manifest fields override auto-detected fields; missing
// fields fall back to auto-detection.
export function discoverDataSources(
  availableTracks: AvailableTrack[],
  bedFiles: string[],
  builtIn: ViewTarget[],
  rootDataPath: string,
  folderManifests: Record<string, FolderManifest> = {},
): ViewTarget[] {
  const root = trimTrailingSlash(rootDataPath)

  // Folders already covered by a built-in entry (so we don't duplicate them).
  const skipDirs = new Set<string>()
  const skipNames = new Set<string>()
  for (const ds of builtIn) {
    skipNames.add(ds.name ?? '')
    for (const t of ds.tracks) {
      if (t.trackFile) {
        skipDirs.add(parentDir(t.trackFile))
      }
    }
    if (ds.bedFile) {
      skipDirs.add(parentDir(ds.bedFile))
    }
  }

  const groups = new Map<string, { tracks: AvailableTrack[]; beds: string[] }>()
  const groupFor = (dir: string) => {
    let g = groups.get(dir)
    if (!g) {
      g = { tracks: [], beds: [] }
      groups.set(dir, g)
    }
    return g
  }
  for (const t of availableTracks) {
    if (t.trackFile) {
      groupFor(parentDir(t.trackFile)).tracks.push(t)
    }
  }
  for (const bed of bedFiles) {
    groupFor(parentDir(bed)).beds.push(bed)
  }
  // A folder with only a manifest (no auto-detected files) should still
  // produce an entry — seed an empty group for each manifest folder.
  for (const folder of Object.keys(folderManifests)) {
    groupFor(trimTrailingSlash(folder))
  }

  const out: ViewTarget[] = []
  for (const [dir, { tracks, beds }] of groups) {
    if (dir === '' || dir === root) continue
    if (skipDirs.has(dir)) continue

    const manifest = folderManifests[dir]
    const autoGraph = tracks.find(t => t.trackType === 'graph')
    const autoHaplotype = tracks.find(t => t.trackType === 'haplotype')
    const autoReads = tracks.filter(t => t.trackType === 'read')
    const autoTracks: Tracks = autoGraph?.trackFile
      ? [
          { trackType: 'graph', trackFile: autoGraph.trackFile },
          ...(autoHaplotype?.trackFile
            ? [
                {
                  trackType: 'haplotype' as const,
                  trackFile: autoHaplotype.trackFile,
                },
              ]
            : []),
          ...autoReads
            .filter(r => !!r.trackFile)
            .map(r => ({
              trackType: 'read' as const,
              trackFile: r.trackFile,
            })),
        ]
      : []

    const finalTracks = manifest?.tracks ?? autoTracks
    if (finalTracks.length === 0) continue

    const folderName = dir.split('/').filter(Boolean).pop() ?? dir
    const name = manifest?.name ?? folderName
    if (skipNames.has(name)) continue

    out.push({
      name,
      tracks: finalTracks,
      bedFile: manifest?.bedFile ?? beds[0],
      region: manifest?.region ?? '',
      dataType: 'built-in',
      simplify: manifest?.simplify,
      removeSequences: manifest?.removeSequences,
    })
  }
  out.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  return out
}

function colorsOf(track: Track) {
  return track.trackColorSettings ?? defaultTrackColors(track.trackType)
}

// The same file read the same way, whatever colors it is drawn in.
function sameTrackSource(a: Track, b: Track) {
  return (
    a.trackType === b.trackType &&
    (a.trackFile ?? '') === (b.trackFile ?? '') &&
    (a.haplotypeIndexFile ?? '') === (b.haplotypeIndexFile ?? '')
  )
}

// Tracks that draw the same thing. A track without color settings takes its
// type's default palettes, as the renderer does.
export function tracksEqual(a: Track, b: Track) {
  return (
    sameTrackSource(a, b) &&
    colorsOf(a).mainPalette === colorsOf(b).mainPalette &&
    colorsOf(a).auxPalette === colorsOf(b).auxPalette
  )
}

export function trackListsEqual(a: Tracks, b: Tracks) {
  return (
    a.length === b.length && a.every((track, i) => tracksEqual(track, b[i]!))
  )
}

export function trackSourcesEqual(a: Tracks, b: Tracks) {
  return (
    a.length === b.length &&
    a.every((track, i) => sameTrackSource(track, b[i]!))
  )
}

// Two view targets are equal if they have the same tracks, region, and flags.
export function viewTargetsEqual(
  a: ViewTarget | undefined,
  b: ViewTarget | undefined,
) {
  if ((a === undefined) !== (b === undefined)) return false
  if (!a || !b) return true
  return (
    trackListsEqual(a.tracks, b.tracks) &&
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
        parseInt(regionInfo.start![i]!) === parsed.start &&
        parseInt(regionInfo.end![i]!) === parsed.end &&
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
