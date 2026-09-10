import type {
  AvailableTrack,
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../Types.ts'
import type { InputRegion, VgJson, VgRead } from '../util/tubemap.ts'

// Shape returned by getChunkedData. Tube map rendering consumes these.
export interface ChunkedDataResponse {
  graph?: VgJson
  gam?: VgRead[][]
  nameMap?: Record<string, string>
  region?: InputRegion
  coloredNodes?: string[]
}

// Returned by subscribeToFilenameChanges. Callers may either call it to stop
// listening or abort the signal they passed in, whichever fits.
export type FilenameSubscription = () => void

// Contract implemented by LocalAPI and ServerAPI. All methods take an optional
// AbortSignal that cancels the underlying request.
export interface APIInterface {
  readonly mode: 'local' | 'server' | 'upstream'

  getChunkedData(
    viewTarget: ViewTarget,
    cancelSignal: AbortSignal | null,
  ): Promise<ChunkedDataResponse>

  getFilenames(cancelSignal: AbortSignal | null): Promise<FilenamesResponse>

  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): FilenameSubscription

  putFile(
    fileType: FileType,
    file: File,
    cancelSignal: AbortSignal | null,
  ): Promise<string>

  getBedRegions(
    bedFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ bedRegions?: RegionInfo }>

  // `haplotypeIndexFile` is the graph track's companion index, when it has
  // one. Only the in-browser gbz-base backend reads it, and only to answer
  // path lengths from the index's table rather than by walking the graph; a
  // server ignores it, as its own graph already carries the paths.
  getPathNames(
    graphFile: string,
    cancelSignal: AbortSignal | null,
    haplotypeIndexFile?: string,
  ): Promise<{ pathNames: string[] }>

  getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
    haplotypeIndexFile?: string,
  ): Promise<{ pathInfo: PathInfo[] }>

  // Count reads from `readFile` that visit any node belonging to each path
  // declared in `graphFile`. Approximate — uses the gbz-base ReferenceIndex
  // sampled handles to bound each path's node-id range, so a read that
  // touches an out-of-range node missed by the sampling won't be counted.
  // Returns null in environments that can't (or don't) implement it (i.e.
  // ServerAPI without a counterpart endpoint).
  getReadCountsPerPath?: (
    graphFile: string,
    readFile: string,
    cancelSignal: AbortSignal | null,
  ) => Promise<{ counts: Record<string, number> } | null>

  getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ tracks?: Track[] }>
}

// Re-export commonly needed types so callers can import from one place.
export type { AvailableTrack, FileType, PathInfo, RegionInfo, Track, ViewTarget }
