import { GENERIC_SAMPLE } from '@gmod/gbz-base'
import { pathQueryFor } from '../api/gbz/pathQuery.ts'
import { isUploadId } from '../api/local/fileRegistry.ts'
import {
  convertRegionToRangeRegion,
  isGbzDbFilename,
  parseRegion,
} from '../common.ts'
import type { ViewTarget } from '../Types.ts'

export const BANDAGEJS_URL = 'https://jbrowse.org/demos/bandagejs/'

interface HaplotypeTrack {
  name: string
  hidden: boolean
}

// `baseURI` is where the page serves a relative track file from, or undefined
// when relative track files are paths on a vg server that BandageJS can't
// reach.
function hostedUrl(file: string, baseURI: string | undefined) {
  return /^https?:\/\//i.test(file)
    ? file
    : baseURI === undefined || isUploadId(file)
      ? undefined
      : new URL(file, baseURI).href
}

function rangeRegion(region: string) {
  try {
    return convertRegionToRangeRegion(parseRegion(region))
  } catch {
    return undefined
  }
}

// BandageJS narrows to `sample#haplotype` prefixes. An anonymous `unknown#N`
// track has no prefix to send, so a selection holding one opens every
// haplotype rather than a subset the user didn't pick.
function haplotypePrefixes(tracks: readonly HaplotypeTrack[]) {
  const visible = tracks
    .filter(track => !track.hidden)
    .map(track => track.name.split('#'))
  return visible.length === tracks.length ||
    visible.length === 0 ||
    visible.some(parts => parts.length < 3)
    ? undefined
    : [
        ...new Set(
          visible.map(([sample, haplotype]) => `${sample}#${haplotype}`),
        ),
      ]
}

export function bandageJsUrl(
  viewTarget: ViewTarget,
  baseURI: string | undefined,
  haplotypeTracks: readonly HaplotypeTrack[] = [],
) {
  const graph = viewTarget.tracks.find(track => track.trackType === 'graph')
  const db =
    graph?.trackFile !== undefined && isGbzDbFilename(graph.trackFile)
      ? hostedUrl(graph.trackFile, baseURI)
      : undefined
  const region = rangeRegion(viewTarget.region)
  if (db === undefined || region === undefined) {
    return undefined
  }
  const index =
    graph?.haplotypeIndexFile === undefined
      ? undefined
      : hostedUrl(graph.haplotypeIndexFile, baseURI)
  const { sample, contig } = pathQueryFor(region.contig)
  const haps = haplotypePrefixes(haplotypeTracks)
  const params = new URLSearchParams({
    gbz: db,
    ...(index !== undefined && { index }),
    loc: `${contig}:${region.start}-${region.end}`,
    ref: sample ?? GENERIC_SAMPLE,
    ...(haps !== undefined && { haps: haps.join(',') }),
  })
  return `${BANDAGEJS_URL}?${params}`
}
