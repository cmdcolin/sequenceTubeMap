import type {
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

// Contract implemented by LocalAPI and ServerAPI. All methods take an optional
// AbortSignal that cancels the underlying request.
export interface APIInterface {
  readonly mode: 'local' | 'server' | 'upstream'

  getChunkedData(
    viewTarget: ViewTarget,
    cancelSignal: AbortSignal | null,
  ): Promise<ChunkedDataResponse>

  getFilenames(cancelSignal: AbortSignal | null): Promise<FilenamesResponse>

  // Calls `handler` whenever the file list changes, until `cancelSignal`
  // aborts.
  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): void

  // Files uploaded together share a `batch`, which the in-browser backend
  // uses to pair an index with the file it came with.
  putFile(
    fileType: FileType,
    file: File,
    cancelSignal: AbortSignal | null,
    batch?: string,
  ): Promise<string>

  getBedRegions(
    bedFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ bedRegions?: RegionInfo }>

  // `haplotypeIndexFile` is the graph track's companion index, when it has
  // one. Only the in-browser gbz-base backend reads it, and only to answer
  // path lengths from the index's table rather than by walking the graph; a
  // server ignores it, as its own graph already carries the paths.
  getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
    haplotypeIndexFile?: string,
  ): Promise<{ pathInfo: PathInfo[] }>

  // Count reads from `readFile` that visit any node belonging to each path
  // declared in `graphFile`. Approximate — uses the gbz-base ReferenceIndex
  // sampled handles to bound each path's node-id range, so a read that
  // touches an out-of-range node missed by the sampling won't be counted.
  // Returns null when the counts would cost more than they are worth, as for
  // a hosted file; ServerAPI doesn't implement it at all.
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
