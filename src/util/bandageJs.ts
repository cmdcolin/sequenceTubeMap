import { GENERIC_SAMPLE } from '@gmod/gbz-base'
import { pathQueryFor } from '../api/gbz/pathQuery.ts'
import { isUploadId } from '../api/local/fileRegistry.ts'
import {
  convertRegionToRangeRegion,
  isLocalGraphFilename,
  isWalksFilename,
  parseRegion,
} from '../common.ts'
import type { ViewTarget } from '../Types.ts'

export const BANDAGEJS_URL = 'https://jbrowse.org/demos/bandagejs/'

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

export function bandageJsUrl(
  viewTarget: ViewTarget,
  baseURI: string | undefined,
) {
  const graph = viewTarget.tracks.find(track => track.trackType === 'graph')
  const db =
    graph?.trackFile !== undefined && isLocalGraphFilename(graph.trackFile)
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
  // A walk file set is cut along the one reference it was written for
  const ref = isWalksFilename(db) ? sample : (sample ?? GENERIC_SAMPLE)
  const params = new URLSearchParams({
    gbz: db,
    ...(index !== undefined && { index }),
    loc: `${contig}:${region.start}-${region.end}`,
    ...(ref !== undefined && { ref }),
  })
  return `${BANDAGEJS_URL}?${params}`
}
