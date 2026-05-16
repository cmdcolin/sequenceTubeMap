import type {
  AvailableTrack,
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../Types'

// Shape returned by getChunkedData. Tube map rendering consumes these.
export interface ChunkedDataResponse {
  graph?: unknown
  gam?: unknown[]
  nameMap?: Record<string, unknown>
  region?: unknown
  coloredNodes?: unknown
}

// Opaque handle returned by subscribeToFilenameChanges; the caller just holds
// a reference for as long as updates are wanted.
export type FilenameSubscription = unknown

// Contract implemented by LocalAPI and ServerAPI. All methods take an optional
// AbortSignal that cancels the underlying request.
export interface APIInterface {
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

  getPathNames(
    graphFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ pathNames: string[] }>

  getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ pathInfo: PathInfo[] }>

  getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ tracks?: Track[] }>
}

// Re-export commonly needed types so callers can import from one place.
export type { AvailableTrack, FileType, PathInfo, RegionInfo, Track, ViewTarget }
