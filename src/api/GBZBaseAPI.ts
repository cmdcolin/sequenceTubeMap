/**
 * gbz-base-backed API implementation. Designed to run in a worker efficiently.
 *
 * Reads `.gbz.db` files through `@gmod/gbz-base`, a pure TypeScript reader
 * that fetches only the SQLite pages a query touches, so a URL-hosted
 * database is queried by HTTP range requests instead of being downloaded.
 */

import '../config-client.js'
import { BlobFile, RemoteFile } from 'generic-filehandle2'
import {
  GBZBase,
  GENERIC_SAMPLE,
  SCHEMA_VERSION,
  SchemaVersionError,
  nodes as gbzNodes,
} from '@gmod/gbz-base'
import type { PathName, PathQuery } from '@gmod/gbz-base'

import {
  isGbzDbFilename,
  parseRegion,
  convertRegionToRangeRegion,
} from '../common.ts'

import { convertSchema, removeNodeSequencesInPlace } from './gbz/schema.ts'
import { applyProgress } from './downloadProgress.ts'
import type { ProgressListener } from './downloadProgress.ts'
import {
  alignmentVisitsAny,
  readGam,
  readGamRegion,
  scanReadNodeIds,
} from './gam/gam.ts'
import { UploadRegistry, isUploadId } from './local/fileRegistry.ts'

import type {
  APIInterface,
  ChunkedDataResponse,
  FilenameSubscription,
} from './APIInterface.ts'
import type {
  AvailableTrack,
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../Types.ts'
import type { VgNode, VgRead } from '../util/tubemap.ts'

// Set GBZBASE_DEBUG=1 / localStorage.gbzBaseDebug = '1' to re-enable the
// chatty per-call logging that was unconditional in the original .mjs. A Web
// Worker has no localStorage, so LocalAPI also forwards the page's
// `?gbzBaseDebug` flag through setDebug().
function debugFromEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env.GBZBASE_DEBUG === '1') {
    return true
  }
  return (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('gbzBaseDebug') === '1'
  )
}

// Nodes of the subgraph a view resolved to. The id set is what a read has to
// touch to be worth drawing; min/max only bound the .gam.gai lookup, which
// can't express a set.
interface SubgraphNodes {
  ids: Set<bigint>
  min: bigint
  max: bigint
}

interface NodeIdRange {
  min: bigint
  max: bigint
}

function subgraphNodes(nodes: VgNode[]): SubgraphNodes | null {
  const ids = new Set<bigint>()
  let min: bigint | null = null
  let max: bigint | null = null
  for (const node of nodes) {
    const id = BigInt(node.id)
    ids.add(id)
    if (min === null || id < min) {
      min = id
    }
    if (max === null || id > max) {
      max = id
    }
  }
  return min === null || max === null ? null : { ids, min, max }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function throwIfCancelled(cancelSignal: AbortSignal | null): void {
  if (cancelSignal?.aborted) {
    throw new Error('Request was cancelled')
  }
}

// The Region field takes `contig`, `sample#contig` or
// `sample#haplotype#contig`. A bare contig is the generic `_gbwt_ref` path.
//
// gbz-base ships `parsePathName`, but it only accepts the full PanSN triple or
// a bare contig; the tube map's Region field has always taken the two-part
// `sample#contig` form for a haplotype-0 reference path too.
export function pathQueryFor(contig: string): PathQuery {
  const parts = contig.split('#')
  const [sample, second] = parts
  if (parts.length === 1 || sample === undefined || second === undefined) {
    return { contig }
  }
  if (parts.length === 2) {
    return { sample, contig: second }
  }
  const haplotype = Number(second)
  return Number.isInteger(haplotype)
    ? { sample, haplotype, contig: parts.slice(2).join('#') }
    : { sample, contig: parts.slice(1).join('#') }
}

// gbz-base path names follow the GBWT `sample#haplotype#contig` convention.
// Reference paths carry the `_gbwt_ref` sample, which is stripped so the
// surfaced name is what the Region field accepts.
export function displayName({ sample, contig, haplotype }: PathName): string {
  if (sample === GENERIC_SAMPLE) {
    return contig
  }
  return haplotype === 0 ? `${sample}#${contig}` : `${sample}#${haplotype}#${contig}`
}

// Match the server-side filtering: skip internal `_…` paths and the
// `thread_N` names vg gbwt -G emits for haplotypes that came through
// `vg chunk -T`. Neither is a meaningful contig for the path picker.
export function isUserFacingPath(name: string): boolean {
  return !name.startsWith('_') && !/^thread_\d+$/.test(name)
}

// Per-path node-id range from the ReferenceIndex samples. Approximate — the
// index samples nodes, so a path can in principle traverse ids outside
// MIN/MAX; for typical reference paths this is rare.
async function pathNodeRanges(
  db: GBZBase,
  cancelSignal: AbortSignal | null,
): Promise<Map<number, NodeIdRange>> {
  const ranges = new Map<number, NodeIdRange>()
  for await (const { values } of db.sqlite.scan('ReferenceIndex')) {
    throwIfCancelled(cancelSignal)
    const [pathHandle, , nodeHandle] = values
    if (typeof pathHandle === 'number' && typeof nodeHandle === 'number') {
      const id = BigInt(gbzNodes.nodeId(nodeHandle))
      const range = ranges.get(pathHandle)
      if (!range) {
        ranges.set(pathHandle, { min: id, max: id })
      } else {
        if (id < range.min) {
          range.min = id
        }
        if (id > range.max) {
          range.max = id
        }
      }
    }
  }
  return ranges
}

/**
 * API implementation that reads gbz-base databases client-side.
 *
 * Can operate either in the main thread or in a worker, but handles file
 * uploads differently depending on where you put it.
 */
export class GBZBaseAPI implements APIInterface {
  readonly mode = 'local' as const
  // User-uploaded files, indexed by string id (the array index).
  private registry = new UploadRegistry()
  // Index of upload ids by track type.
  private filesByType = new Map<FileType, string[]>()
  // Cache of blobs fetched lazily from URLs (read tracks are still consumed
  // whole; graph databases go through `openGraph` instead).
  private urlCache = new Map<string, Promise<Blob>>()
  // One open database per graph file, keyed by upload id or resolved URL.
  private graphs = new Map<string, Promise<GBZBase>>()
  // Base URL to resolve relative trackFile paths against. Required because
  // GBZBaseAPI typically runs in a Web Worker whose self.location points at
  // /static/js/Worker.ts, not the page; the host LocalAPI passes the page's
  // baseURI via setBaseUrl().
  private baseUrl: string | null = null
  // Sibling URLs the host answered "absent" for, so a view doesn't re-request
  // a missing `.gai` on every region change.
  private missingSiblings = new Set<string>()
  private debugEnabled = debugFromEnvironment()
  // Defaults to this module's own store, which is what the main thread reads.
  // In a worker LocalAPI replaces it with a proxy back across Comlink.
  private progressListener: ProgressListener = applyProgress

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled
  }

  setProgressListener(listener: ProgressListener): void {
    this.progressListener = listener
  }

  private debugLog(...args: unknown[]): void {
    if (this.debugEnabled) {
      console.warn(...args)
    }
  }

  private resolveUrl(trackFile: string): string {
    return this.baseUrl ? new URL(trackFile, this.baseUrl).href : trackFile
  }

  private uploadedBlob(trackFile: string): Blob {
    const blob = this.registry.get(trackFile)
    if (!blob) {
      throw new Error(`Uploaded file ${trackFile} does not exist`)
    }
    return blob
  }

  // Resolve a trackFile string to a Blob: a numeric ID points at the uploads
  // array; anything else is fetched from the URL (cached). Large URL fetches
  // stream the body and publish progress so the loader spinner can show
  // "downloading X / Y MB" instead of looking frozen.
  //
  // The cache is keyed by URL and holds the in-flight promise, so a second
  // caller joins the first caller's download rather than starting its own —
  // which also means it inherits the first caller's cancel signal.
  private async resolveTrackFile(
    trackFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<Blob> {
    if (isUploadId(trackFile)) {
      return this.uploadedBlob(trackFile)
    }
    const resolved = this.resolveUrl(trackFile)
    let cached = this.urlCache.get(resolved)
    if (!cached) {
      cached = this.downloadBlob(trackFile, resolved, cancelSignal)
      this.urlCache.set(resolved, cached)
    }
    return cached
  }

  private async downloadBlob(
    trackFile: string,
    resolved: string,
    cancelSignal: AbortSignal | null,
  ): Promise<Blob> {
    try {
      const response = await fetch(resolved, { signal: cancelSignal })
      if (!response.ok) {
        throw new HttpError(
          response.status,
          `Could not load ${trackFile}: HTTP ${response.status} ${response.statusText}`,
        )
      }
      const contentLength = response.headers.get('content-length')
      const total = contentLength === null ? null : Number(contentLength)
      // Stream the body so we can publish progress. Fall through to the
      // plain .blob() path if the body isn't readable (older browsers /
      // jsdom test env / opaque responses).
      if (response.body) {
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let received = 0
        this.progressListener({ url: resolved, received: 0, total, done: false })
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            chunks.push(value)
            received += value.length
            this.progressListener({
              url: resolved,
              received,
              total,
              done: false,
            })
          }
        } finally {
          this.progressListener({ url: resolved, received, total, done: true })
        }
        return new Blob(chunks as BlobPart[])
      }
      return await response.blob()
    } catch (e) {
      // A rejected promise left in the cache would fail every later attempt,
      // including retries after a transient network error or a cancellation.
      this.urlCache.delete(resolved)
      throw e
    }
  }

  // Open a graph database once per file. Uploads are read from their Blob;
  // URLs are read by range requests, so a hosted multi-hundred-MB database
  // costs only the pages each query touches.
  private openGraph(trackFile: string): Promise<GBZBase> {
    const key = isUploadId(trackFile) ? trackFile : this.resolveUrl(trackFile)
    let opened = this.graphs.get(key)
    if (!opened) {
      opened = (async () => {
        const source = isUploadId(trackFile)
          ? new BlobFile(this.uploadedBlob(trackFile))
          : new RemoteFile(key)
        try {
          return await GBZBase.open(source)
        } catch (e) {
          this.graphs.delete(key)
          if (e instanceof SchemaVersionError) {
            const found =
              e.found === undefined ? 'unreadable' : `"${e.found}"`
            throw new Error(
              `"${trackFile}" is a gbz-base database, but its schema version is ${found} and this app reads "${SCHEMA_VERSION}". Rebuild it with a gbz-base release that writes that version, or update this app to a reader that understands yours.`,
              { cause: e },
            )
          } else {
            throw new Error(
              `Could not open "${trackFile}" as a gbz-base database: ${errorMessage(e)}\n` +
                'The in-browser backend reads .gbz.db files; .vg, .xg and .gbz are not supported.',
              { cause: e },
            )
          }
        }
      })()
      this.graphs.set(key, opened)
    }
    return opened
  }

  // For uploaded files `graphFile` is a numeric registry id like "0", so the
  // extension check has to look at the original filename the registry kept.
  private isGbzDb(graphFile: string): boolean {
    const checkName = isUploadId(graphFile)
      ? this.registry.getName(graphFile)
      : graphFile
    return checkName === null ? false : isGbzDbFilename(checkName)
  }

  /////////
  // Tube Map API implementation
  /////////

  async getChunkedData(
    viewTarget: ViewTarget,
    cancelSignal: AbortSignal | null,
  ): Promise<ChunkedDataResponse> {
    this.debugLog('Got view target:', viewTarget)

    const graphFile = viewTarget.tracks.find(t => t.trackType === 'graph')
      ?.trackFile
    if (!graphFile) {
      throw new Error('No graph track selected')
    }

    const region = convertRegionToRangeRegion(parseRegion(viewTarget.region))
    const db = await this.openGraph(graphFile)
    throwIfCancelled(cancelSignal)

    let result
    try {
      // gbz-base resolves which fragment of a split contig covers the window
      // and names the haplotypes itself when the database has the index.
      //
      // The server's `vg chunk -p contig:start-end` includes `end`, while
      // gbz-base treats it as exclusive, so ask for one more base to keep
      // both backends showing the same sequence for the same region string.
      const subgraph = await db.getSubgraphForRange(
        pathQueryFor(region.contig),
        region.start,
        region.end + 1,
        { haplotypes: 'distinct', signal: cancelSignal ?? undefined },
      )
      if (!subgraph) {
        throw new Error(
          `no fragment of path ${region.contig} covers ${region.start}-${region.end}`,
        )
      }
      result = convertSchema(
        subgraph.toSubgraphJson({
          names: db.hasHaplotypeIndex ? 'resolved' : 'anonymous',
        }),
      )
    } catch (e) {
      throw new Error(
        `Failed to query "${graphFile}" at ${region.contig}:${region.start}-${region.end}: ${errorMessage(e)}`,
        { cause: e },
      )
    }

    const nodes = subgraphNodes(result.node)
    const gam = await Promise.all(
      viewTarget.tracks
        .filter(t => t.trackType === 'read')
        .map(async track =>
          track.trackFile
            ? await this.readsForTrack(track.trackFile, nodes, cancelSignal)
            : [],
        ),
    )

    if (viewTarget.removeSequences) {
      removeNodeSequencesInPlace(result)
    }

    return {
      graph: result,
      gam,
      // Match the server's [start, end] shape; the tubemap ruler indexes [0]
      // and [1] as numbers to position the region-highlight ticks.
      region: [region.start, region.end],
      coloredNodes: [],
    }
  }

  // Try to resolve a sibling file at `trackFile + suffix` (e.g. ".gai").
  //
  // For URL-based tracks, this is a plain fetch of the sibling URL.
  //
  // For uploaded tracks (numeric ids) we look the sibling up by original
  // filename — putFile records the upload's `file.name`, so a `.sorted.gam`
  // and its `.sorted.gam.gai` dropped together pair up automatically.
  private async resolveSibling(
    trackFile: string,
    suffix: string,
    cancelSignal: AbortSignal | null,
  ): Promise<Blob | null> {
    if (isUploadId(trackFile)) {
      return this.registry.sibling(trackFile, suffix)
    }
    const sibling = trackFile + suffix
    if (this.missingSiblings.has(sibling)) {
      return null
    }
    try {
      return await this.resolveTrackFile(sibling, cancelSignal)
    } catch (e) {
      // No index beside the track is normal and means "scan the whole file".
      // S3 answers 403 rather than 404 for a missing key in a bucket that
      // doesn't grant ListBucket, so treat that as absent too. Anything else
      // (CORS, DNS, a broken proxy) is a real problem worth surfacing.
      if (e instanceof HttpError && (e.status === 404 || e.status === 403)) {
        this.missingSiblings.add(sibling)
        return null
      }
      throw e
    }
  }

  private async readsForTrack(
    trackFile: string,
    nodes: SubgraphNodes | null,
    cancelSignal: AbortSignal | null,
  ): Promise<VgRead[]> {
    // An empty subgraph has no node a read could be drawn against, so there
    // is nothing to show — returning the whole file put every read in the
    // view instead.
    if (nodes === null) {
      return []
    }
    const gamBlob = await this.resolveTrackFile(trackFile, cancelSignal)
    const gaiBlob = await this.resolveSibling(trackFile, '.gai', cancelSignal)
    throwIfCancelled(cancelSignal)
    const candidates = gaiBlob
      ? await readGamRegion(gamBlob, gaiBlob, nodes.min, nodes.max)
      : await readGam(gamBlob)
    // The index and the whole-file scan can only prefilter by node-id range,
    // which over-selects whenever the subgraph's ids aren't contiguous.
    return candidates.filter(read => alignmentVisitsAny(read, nodes.ids))
  }

  async getFilenames(
    _cancelSignal: AbortSignal | null,
  ): Promise<FilenamesResponse> {
    const files: AvailableTrack[] = []
    const bedFiles: string[] = []
    for (const [trackType, uploadIds] of this.filesByType) {
      if (trackType === 'bed') {
        bedFiles.push(...uploadIds)
      } else {
        files.push(...uploadIds.map(trackFile => ({ trackFile, trackType })))
      }
    }
    return { files, bedFiles }
  }

  // Nothing outside this object can change the file list, so there is nothing
  // to notify about: LocalAPI raises the event for its own putFile calls.
  subscribeToFilenameChanges(
    _handler: () => void,
    _cancelSignal: AbortSignal,
  ): FilenameSubscription {
    return () => {
      /* nothing subscribed */
    }
  }

  async putFile(
    fileType: FileType,
    file: File,
    _cancelSignal: AbortSignal | null,
  ): Promise<string> {
    const { id, isSibling } = this.registry.add({
      name: file.name,
      blob: file,
    })
    this.debugLog(`Store ${file.size} byte upload:`, file)

    // Sibling index files (.gai for .gam, .tbi for .gaf.gz) get uploaded so
    // they're available for region queries, but they aren't tracks in their
    // own right; `resolveSibling` looks them up by name later.
    if (!isSibling) {
      let list = this.filesByType.get(fileType)
      if (!list) {
        list = []
        this.filesByType.set(fileType, list)
      }
      list.push(id)
    }

    return id
  }

  async getBedRegions(
    _bedFile: string,
    _cancelSignal: AbortSignal | null,
  ): Promise<{ bedRegions?: RegionInfo }> {
    return { bedRegions: {} }
  }

  async getPathNames(
    graphFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ pathNames: string[] }> {
    const { pathInfo } = await this.getPathInfo(graphFile, cancelSignal)
    return { pathNames: pathInfo.map(p => p.name) }
  }

  async getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ pathInfo: PathInfo[] }> {
    // Files this backend can't read at all aren't an error — the picker asks
    // about every selected graph, including .gbz/.xg served for the vg server.
    if (!this.isGbzDb(graphFile)) {
      return { pathInfo: [] }
    }
    const db = await this.openGraph(graphFile)
    throwIfCancelled(cancelSignal)
    const paths = (await db.paths())
      .filter(p => p.isIndexed)
      .map(p => ({ path: p, name: displayName(p.name) }))
      .filter(({ name }) => isUserFacingPath(name))
    const pathInfo = await Promise.all(
      paths.map(async ({ path, name }) => ({
        name,
        start: path.name.fragment,
        length: await db.pathLength(path.handle),
        cyclic: false,
      })),
    )
    return { pathInfo }
  }

  async getChunkTracks(
    _bedFile: string,
    _chunk: string,
    _cancelSignal: AbortSignal | null,
  ): Promise<{ tracks?: Track[] }> {
    return { tracks: [] }
  }

  // Per-path read count cache: scanning a .gam is expensive, so we
  // memoize per (graphFile, readFile) pair. Keyed by stringified pair —
  // upload ids/URLs are both stable identifiers, so they're safe map keys.
  private readCountCache = new Map<
    string,
    Promise<{ counts: Record<string, number> } | null>
  >()

  async getReadCountsPerPath(
    graphFile: string,
    readFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ counts: Record<string, number> } | null> {
    const cacheKey = `${graphFile}|${readFile}`
    const cached = this.readCountCache.get(cacheKey)
    if (cached) {
      return cached
    }
    const promise = this.computeReadCountsPerPath(
      graphFile,
      readFile,
      cancelSignal,
    )
    this.readCountCache.set(cacheKey, promise)
    try {
      const counts = await promise
      // "No answer" is not worth remembering: the file may become readable, or
      // the ReferenceIndex may just have had nothing to say this time.
      if (counts === null) {
        this.readCountCache.delete(cacheKey)
      }
      return counts
    } catch (e) {
      this.readCountCache.delete(cacheKey)
      throw e
    }
  }

  private async computeReadCountsPerPath(
    graphFile: string,
    readFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ counts: Record<string, number> } | null> {
    if (!this.isGbzDb(graphFile)) {
      return null
    }
    const db = await this.openGraph(graphFile)
    const ranges = await pathNodeRanges(db, cancelSignal)
    const paths = (await db.paths())
      .filter(p => p.isIndexed)
      .map(p => ({ name: displayName(p.name), range: ranges.get(p.handle) }))
      .filter(
        (p): p is { name: string; range: NodeIdRange } =>
          p.range !== undefined && isUserFacingPath(p.name),
      )
    if (paths.length === 0) {
      return null
    }

    const gamBlob = await this.resolveTrackFile(readFile, cancelSignal)
    throwIfCancelled(cancelSignal)
    // Bounding each read by its own min/max id lets most (path, read) pairs be
    // settled by two comparisons instead of a walk over the read's nodes.
    const reads = (await scanReadNodeIds(gamBlob))
      .filter(ids => ids.length > 0)
      .map(ids => ({
        ids,
        min: ids.reduce((a, b) => (b < a ? b : a)),
        max: ids.reduce((a, b) => (b > a ? b : a)),
      }))

    const counts: Record<string, number> = {}
    for (const { name, range } of paths) {
      let n = 0
      for (const read of reads) {
        if (read.max >= range.min && read.min <= range.max) {
          // De-dup per read: count it once however many of its nodes land
          // inside the path's range.
          if (read.ids.some(id => id >= range.min && id <= range.max)) {
            n++
          }
        }
      }
      counts[name] = n
    }
    return { counts }
  }
}

export default GBZBaseAPI
