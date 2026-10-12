/**
 * The in-browser API implementation. Designed to run in a worker efficiently.
 *
 * Reads `.gbz.db` files through `@gmod/gbz-base`, a pure TypeScript reader
 * that fetches only the SQLite pages a query touches, so a URL-hosted
 * database is queried by HTTP range requests instead of being downloaded.
 * Reads `gfa-to-tabix --walks` files the same way, through their Tabix
 * indexes.
 */

import '../config-client.js'
import { BlobFile, RemoteFile } from 'generic-filehandle2'
import type { GenericFilehandle } from 'generic-filehandle2'
import {
  GBZBase,
  GENERIC_SAMPLE,
  SCHEMA_VERSION,
  SchemaVersionError,
  SubgraphLimitError,
} from '@gmod/gbz-base'
import type {
  GbzPath,
  NodeHaplotypeOutput,
  PathName,
  Subgraph,
} from '@gmod/gbz-base'

import {
  isGbzDbFilename,
  isWalksFilename,
  parseRegion,
  convertRegionToRangeRegion,
  withPathSuffix,
} from '../common.ts'
import type { Region } from '../common.ts'

import { convertSchema, removeNodeSequencesInPlace } from './gbz/schema.ts'
import type { ConvertedGraph } from './gbz/schema.ts'
import { WalkLimitError, WalkFiles } from './walks/WalkFiles.ts'
import { pathQueryFor } from './gbz/pathQuery.ts'
import { applyProgress } from './downloadProgress.ts'
import type { ProgressListener } from './downloadProgress.ts'
import {
  alignmentVisitsAny,
  readGam,
  readGamRegion,
  scanReadNodeIds,
} from './gam/gam.ts'
import { UploadRegistry, isUploadId } from './local/fileRegistry.ts'
import { errorMessage, isAbortError, toError } from '../util/error.ts'

import type { APIInterface, ChunkedDataResponse } from './APIInterface.ts'
import type {
  AvailableTrack,
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../Types.ts'
import type { InputRegion, VgNode, VgRead } from '../util/tubemap.ts'

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

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}

// Settles like `promise` unless `signal` aborts first, which lets one caller
// stop waiting on work that others still want.
function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | null,
): Promise<T> {
  if (!signal) {
    return promise
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(toError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

// gbz-base path names follow the GBWT `sample#haplotype#contig` convention.
// Reference paths carry the `_gbwt_ref` sample, which is stripped so the
// surfaced name is what the Region field accepts.
export function displayName({ sample, contig, haplotype }: PathName): string {
  if (sample === GENERIC_SAMPLE) {
    return contig
  }
  return haplotype === 0
    ? `${sample}#${contig}`
    : `${sample}#${haplotype}#${contig}`
}

// Match the server-side filtering: skip internal `_…` paths and the
// `thread_N` names vg gbwt -G emits for haplotypes that came through
// `vg chunk -T`. Neither is a meaningful contig for the path picker.
export function isUserFacingPath(name: string): boolean {
  return !name.startsWith('_') && !/^thread_\d+$/.test(name)
}

// A fragment's length. gbz-base takes it from the companion index when there
// is one, and otherwise walks the fragment.
async function pathLength(db: GBZBase, path: GbzPath): Promise<number> {
  const [fragment] = await db.getPathFragments({
    path: {
      sample: path.name.sample,
      contig: path.name.contig,
      haplotype: path.name.haplotype,
    },
    start: path.name.fragment,
    end: path.name.fragment + 1,
  })
  return fragment === undefined ? 0 : fragment.end - fragment.start
}

// Per-path node-id range, from the nodes each fragment's subgraph holds. A
// path past the node limit throws SubgraphLimitError.
async function pathNodeRanges(
  db: GBZBase,
  paths: GbzPath[],
  nodeLimit: number,
  cancelSignal: AbortSignal | null,
): Promise<Map<number, NodeIdRange>> {
  const ranges = new Map<number, NodeIdRange>()
  for (const path of paths) {
    cancelSignal?.throwIfAborted()
    const start = path.name.fragment
    const end = start + (await pathLength(db, path))
    const ids = nodeIdsOf(
      await db.subgraphInInterval({
        path: {
          sample: path.name.sample,
          contig: path.name.contig,
          haplotype: path.name.haplotype,
        },
        start,
        end,
        haplotypes: 'none',
        context: 0,
        limit: nodeLimit,
        signal: cancelSignal ?? undefined,
      }),
    )
    if (ids.length > 0) {
      ranges.set(path.handle, {
        min: BigInt(ids.reduce((a, b) => Math.min(a, b))),
        max: BigInt(ids.reduce((a, b) => Math.max(a, b))),
      })
    }
  }
  return ranges
}

function nodeIdsOf(subgraph: Subgraph): number[] {
  return Array.from(subgraph.toCompactSubgraph().nodeIds)
}

// gbz-base refuses an id it does not have, so each id in a node range is
// probed on its own.
async function nodeExists(
  db: GBZBase,
  id: number,
  signal: AbortSignal | null,
): Promise<boolean> {
  if (id < 1) {
    return false
  }
  try {
    await db.subgraphAroundNodes({
      nodeIds: [id],
      context: 0,
      haplotypes: 'none',
      signal: signal ?? undefined,
    })
    return true
  } catch (e) {
    if (e instanceof Error && e.message.includes('does not exist')) {
      return false
    }
    throw e
  }
}

const READ_COUNT_MAX_BYTES = 32 * 1024 * 1024

// A download arrives in thousands of chunks, and each progress update is a
// message out of the worker and a render of the progress panel, so a download
// reports at most this often, then once more when it ends.
const PROGRESS_INTERVAL_MS = 100

async function isGzip(blob: Blob): Promise<boolean> {
  const [first, second] = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  return first === 0x1f && second === 0x8b
}

// `vg chunk -r first:last -c 20`, which the server runs for `node:first-last`.
const NODE_RANGE_CONTEXT_STEPS = 20

// Every node a node region takes in, and every id in its range whether or not
// the node exists, costs a record lookup, which for a hosted graph can be a
// range request. A region that asks for more than a tube map could draw is
// refused rather than walked across the graph.
const MAX_NODE_REGION = 10000

// The most nodes a path region takes in before gbz-base gives up on it, a
// backstop for the width notice in App: the width of a region says little
// about its size on a base-level graph, and gbz-base stops walking the
// reference at the limit, before it has read a haplotype or built a byte of
// JSON. On HPRC v2.1 a 500 kb window is 18,832 nodes and 221 MB of JSON, so
// this sits where a confirmed load is still something the browser survives.
export const SUBGRAPH_NODE_LIMIT = 50_000

// gbz-base says how far along the reference it got when the limit tripped,
// which bounds what would fit, with a margin for the context past the window.
function subgraphLimitMessage(region: string, e: SubgraphLimitError): string {
  const fits =
    e.walkedBp !== undefined && e.walkedBp > 0
      ? ` A region of about ${Math.floor(e.walkedBp * 0.8).toLocaleString()} bp would fit.`
      : ''
  return `${region} takes in more than ${e.limit.toLocaleString()} graph nodes, the most the browser reads for one view.${fits}`
}

// The server's node regions, cut the way `vg chunk` cuts them:
// `node:first-last` is the nodes with ids in that range and everything within
// 20 edges of them, and `node:id+steps` is node `id` and everything within
// `steps` edges. gbz-base widens a query by bases, not edges, so each step
// asks for the frontier with a one-base context, which adds the nodes one edge
// away.
async function nodeRegionSubgraph(
  db: GBZBase,
  region: Region,
  haplotypes: NodeHaplotypeOutput,
  signal: AbortSignal | null,
): Promise<Subgraph> {
  const first = region.start
  const last = 'end' in region ? region.end : region.start
  const steps = 'end' in region ? NODE_RANGE_CONTEXT_STEPS : region.distance
  if (last - first >= MAX_NODE_REGION) {
    throw new Error(
      `node:${first}-${last} spans more than ${MAX_NODE_REGION} node ids`,
    )
  }
  let frontier: number[] = []
  for (let id = first; id <= last; id++) {
    signal?.throwIfAborted()
    if (await nodeExists(db, id, signal)) {
      frontier.push(id)
    }
  }
  if (frontier.length === 0) {
    throw new Error(
      first === last
        ? `the graph has no node ${first}`
        : `the graph has no node with an id in ${first}-${last}`,
    )
  }
  const reached = new Set(frontier)
  for (let step = 0; step < steps && frontier.length > 0; step++) {
    signal?.throwIfAborted()
    const around = await db.subgraphAroundNodes({
      nodeIds: frontier,
      context: 1,
      haplotypes: 'none',
      signal: signal ?? undefined,
    })
    const next: number[] = []
    for (const id of nodeIdsOf(around)) {
      if (!reached.has(id)) {
        if (reached.size >= MAX_NODE_REGION) {
          throw new Error(
            `more than ${MAX_NODE_REGION} nodes lie within ${steps} edges; ask for fewer steps`,
          )
        }
        reached.add(id)
        next.push(id)
      }
    }
    frontier = next
  }
  const subgraph = await db.subgraphAroundNodes({
    nodeIds: [...reached],
    context: 0,
    haplotypes,
    signal: signal ?? undefined,
  })
  if (db.hasHaplotypeIndex) {
    await subgraph.identifyPaths()
  }
  return subgraph
}

/**
 * API implementation that reads gbz-base databases client-side.
 *
 * Can operate either in the main thread or in a worker, but handles file
 * uploads differently depending on where you put it.
 */
export class GBZBaseAPI implements APIInterface {
  readonly mode = 'local' as const
  private subgraphNodeLimit: number

  constructor(subgraphNodeLimit = SUBGRAPH_NODE_LIMIT) {
    this.subgraphNodeLimit = subgraphNodeLimit
  }
  // User-uploaded files, indexed by string id (the array index).
  private registry = new UploadRegistry()
  // Index of upload ids by track type.
  private filesByType = new Map<FileType, string[]>()
  // Cache of blobs fetched lazily from URLs. Only the whole-file paths use
  // it — an unindexed read track and the read-count scan; graph databases go
  // through `openGraph` and indexed reads through `trackSource`.
  private urlCache = new Map<string, Promise<Blob>>()
  // One open database per graph file, keyed by upload id or resolved URL.
  private graphs = new Map<string, Promise<GBZBase>>()
  // Companion haplotype index per graph key, from whichever caller named one.
  // Kept beside `graphs` rather than folded into its key so every caller
  // shares one open database: the paths panel asks by filename alone, and a
  // second copy opened without the index would answer path lengths by walking
  // the graph — 39 MB of range requests over HPRC v2.1's 292 indexed paths,
  // against 0.7 MB from the index's own table.
  private haplotypeIndexes = new Map<string, string>()
  // One open walk file set per graph file, keyed the same way.
  private walkGraphs = new Map<string, WalkFiles>()
  // One seekable handle per read track file, keyed the same way.
  private trackSources = new Map<string, GenericFilehandle>()
  // Base URL to resolve relative trackFile paths against. Required because
  // GBZBaseAPI typically runs in a Web Worker whose self.location points at
  // /static/js/Worker.ts, not the page; the host LocalAPI passes the page's
  // baseURI via setBaseUrl().
  private baseUrl: string | null = null
  // Sibling URLs the host answered "absent" for, so a view doesn't re-request
  // a missing `.gai` on every region change.
  private missingSiblings = new Set<string>()
  // Every read of the unindexed read file read last. Without an index a view
  // reads the whole file, and inflating and decoding it again was most of what
  // each region change cost. Only one file's reads are kept: the Blobs live
  // for the session, and the decoded reads of every file viewed would too.
  private decodedReads: { blob: Blob; reads: Promise<VgRead[]> } | undefined
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
  // The cache holds the in-flight promise, so a second caller joins the first
  // caller's download. The download itself takes no caller's signal: a caller
  // that gives up only stops waiting, since the view after it usually wants
  // the same file.
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
      cached = this.downloadBlob(trackFile, resolved)
      cached.catch(() => {
        /* reported to whoever still waits */
      })
      this.urlCache.set(resolved, cached)
    }
    return await raceAbort(cached, cancelSignal)
  }

  private async downloadBlob(
    trackFile: string,
    resolved: string,
  ): Promise<Blob> {
    try {
      const response = await fetch(resolved)
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
        this.progressListener({
          url: resolved,
          received: 0,
          total,
          done: false,
        })
        let reportedAt = Date.now()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            chunks.push(value)
            received += value.length
            const now = Date.now()
            if (now - reportedAt >= PROGRESS_INTERVAL_MS) {
              reportedAt = now
              this.progressListener({
                url: resolved,
                received,
                total,
                done: false,
              })
            }
          }
        } finally {
          this.progressListener({ url: resolved, received, total, done: true })
        }
        return new Blob(chunks as BlobPart[])
      }
      return await response.blob()
    } catch (e) {
      // A rejected promise left in the cache would fail every later attempt,
      // including retries after a transient network error.
      this.urlCache.delete(resolved)
      throw e
    }
  }

  private fileKey(trackFile: string): string {
    return isUploadId(trackFile) ? trackFile : this.resolveUrl(trackFile)
  }

  private byteSource(file: string): GenericFilehandle {
    return isUploadId(file)
      ? new BlobFile(this.uploadedBlob(file))
      : new RemoteFile(this.resolveUrl(file))
  }

  // Record the companion haplotype index a caller named for a graph. A
  // database already open without it is dropped so the next query reopens it
  // with the index; a later caller that names none leaves the open one alone,
  // since dropping the index would rename the haplotypes mid-session.
  private noteHaplotypeIndex(
    trackFile: string,
    indexFile: string | undefined,
  ): void {
    if (indexFile === undefined || indexFile === '') {
      return
    }
    const key = this.fileKey(trackFile)
    if (this.haplotypeIndexes.get(key) !== indexFile) {
      this.haplotypeIndexes.set(key, indexFile)
      this.graphs.delete(key)
    }
  }

  // Open a graph database once per file. Uploads are read from their Blob;
  // URLs are read by range requests, so a hosted multi-hundred-MB database
  // costs only the pages each query touches. A companion haplotype index
  // noted for the file is opened the same way and read the same way.
  private openGraph(trackFile: string): Promise<GBZBase> {
    const key = this.fileKey(trackFile)
    let opened = this.graphs.get(key)
    if (!opened) {
      const indexFile = this.haplotypeIndexes.get(key)
      opened = (async () => {
        const source = this.byteSource(trackFile)
        try {
          return await GBZBase.open({
            source,
            ...(indexFile !== undefined && {
              haplotypeIndex: this.byteSource(indexFile),
            }),
          })
        } catch (e) {
          this.graphs.delete(key)
          if (e instanceof SchemaVersionError) {
            const found = e.found === undefined ? 'unreadable' : `"${e.found}"`
            throw new Error(
              `"${trackFile}" is a gbz-base database, but its schema version is ${found} and this app reads "${SCHEMA_VERSION}". Rebuild it with a gbz-base release that writes that version, or update this app to a reader that understands yours.`,
              { cause: e },
            )
          } else {
            const withIndex =
              indexFile === undefined
                ? ''
                : ` with companion haplotype index "${indexFile}"`
            throw new Error(
              `Could not open "${trackFile}"${withIndex} as a gbz-base database: ${errorMessage(e)}\n` +
                'The in-browser backend reads .gbz.db and gfa-to-tabix .walks.bed.gz files; .vg, .xg and .gbz are not supported.',
              { cause: e },
            )
          }
        }
      })()
      this.graphs.set(key, opened)
    }
    return opened
  }

  // A seekable handle on a track file, for readers that use an index instead
  // of consuming the file whole. Uploads read out of their Blob; URLs are
  // read by HTTP range requests. Kept per file so RemoteFile's cached stat()
  // survives across region changes.
  private trackSource(trackFile: string): GenericFilehandle {
    const key = this.fileKey(trackFile)
    let source = this.trackSources.get(key)
    if (!source) {
      source = this.byteSource(trackFile)
      this.trackSources.set(key, source)
    }
    return source
  }

  // For uploaded files `graphFile` is a numeric registry id like "0", so the
  // extension check has to look at the original filename the registry kept.
  private fileName(trackFile: string): string {
    return isUploadId(trackFile)
      ? (this.registry.getName(trackFile) ?? '')
      : this.resolveUrl(trackFile)
  }

  private isGbzDb(graphFile: string): boolean {
    return isGbzDbFilename(this.fileName(graphFile))
  }

  private isWalks(graphFile: string): boolean {
    return isWalksFilename(this.fileName(graphFile))
  }

  // A walk file and its index beside it: for an upload, the index dropped
  // with it; for a URL, the URL with `.tbi` added
  private openWalks(trackFile: string): WalkFiles {
    const key = this.fileKey(trackFile)
    let opened = this.walkGraphs.get(key)
    if (!opened) {
      const blob = isUploadId(trackFile)
        ? this.registry.sibling(trackFile, '.tbi')
        : undefined
      if (blob === null) {
        throw new Error(
          `${this.fileName(trackFile)} needs its .tbi; drop it in with the walk file`,
        )
      }
      opened = new WalkFiles(
        this.byteSource(trackFile),
        blob
          ? new BlobFile(blob)
          : new RemoteFile(withPathSuffix(this.resolveUrl(trackFile), '.tbi')),
      )
      this.walkGraphs.set(key, opened)
    }
    return opened
  }

  private async walkGraph(
    graphFile: string,
    region: string,
    allHaplotypes: boolean,
    cancelSignal: AbortSignal | null,
  ) {
    const parsed = parseRegion(region)
    if (parsed.contig === 'node') {
      throw new Error(
        'A gfa-to-tabix walk file is indexed by reference position, so it takes a region like GRCh38#chr20:1000-2000, not a node region',
      )
    }
    const { contig, start, end } = convertRegionToRangeRegion(parsed)
    const signal = cancelSignal ?? undefined
    const walks = this.openWalks(graphFile)
    try {
      const anchor = await walks.anchorFor(contig, signal)
      return await walks.subgraph(anchor, start, end + 1, {
        distinct: !allHaplotypes,
        nodeLimit: this.subgraphNodeLimit,
        signal,
      })
    } catch (e) {
      if (isAbortError(e) || e instanceof WalkLimitError) {
        throw e
      }
      throw new Error(
        `Failed to read "${this.fileName(graphFile)}" at ${region}: ${errorMessage(e)}`,
        { cause: e },
      )
    }
  }

  /////////
  // Tube Map API implementation
  /////////

  async getChunkedData(
    viewTarget: ViewTarget,
    cancelSignal: AbortSignal | null,
  ): Promise<ChunkedDataResponse> {
    this.debugLog('Got view target:', viewTarget)

    const graphTrack = viewTarget.tracks.find(t => t.trackType === 'graph')
    const graphFile = graphTrack?.trackFile
    if (!graphFile) {
      throw new Error('No graph track selected')
    }
    if (this.isWalks(graphFile)) {
      const graph = await this.walkGraph(
        graphFile,
        viewTarget.region,
        viewTarget.allHaplotypes === true,
        cancelSignal,
      )
      const { start, end } = convertRegionToRangeRegion(
        parseRegion(viewTarget.region),
      )
      return await this.withReads(graph, [start, end], viewTarget, cancelSignal)
    }
    this.noteHaplotypeIndex(graphFile, graphTrack.haplotypeIndexFile)

    const parsed = parseRegion(viewTarget.region)
    const db = await this.openGraph(graphFile)
    cancelSignal?.throwIfAborted()

    const haplotypes = viewTarget.allHaplotypes ? 'all' : 'distinct'
    let result
    let region: InputRegion
    try {
      let subgraph
      if (parsed.contig === 'node') {
        subgraph = await nodeRegionSubgraph(
          db,
          parsed,
          haplotypes,
          cancelSignal,
        )
        // The server's shape for a region with no path coordinates.
        region = [null, null]
      } else {
        const { contig, start, end } = convertRegionToRangeRegion(parsed)
        // gbz-base resolves which fragment of a split contig covers the
        // window and names the haplotypes itself when the database has the
        // index.
        //
        // The server's `vg chunk -p contig:start-end` includes `end`, while
        // gbz-base treats it as exclusive, so ask for one more base to keep
        // both backends showing the same sequence for the same region string.
        const window = { path: pathQueryFor(contig), start, end: end + 1 }
        const [fragment] = await db.getPathFragments(window)
        subgraph =
          fragment !== undefined && fragment.start <= start
            ? (
                await db.getSubgraphs({
                  ...window,
                  haplotypes,
                  limit: this.subgraphNodeLimit,
                  signal: cancelSignal ?? undefined,
                })
              )[0]
            : undefined
        if (!subgraph) {
          throw new Error(
            `no fragment of path ${contig} covers ${start}-${end}`,
          )
        }
        // The tubemap ruler indexes [0] and [1] as numbers to position the
        // region-highlight ticks.
        region = [start, end]
      }
      result = convertSchema(
        subgraph.toSubgraphJson({
          names: db.hasHaplotypeIndex ? 'resolved' : 'anonymous',
        }),
      )
    } catch (e) {
      if (isAbortError(e)) {
        throw e
      }
      if (e instanceof SubgraphLimitError) {
        throw new Error(subgraphLimitMessage(viewTarget.region, e), {
          cause: e,
        })
      }
      throw new Error(
        `Failed to query "${graphFile}" at ${viewTarget.region}: ${errorMessage(e)}`,
        { cause: e },
      )
    }

    return await this.withReads(result, region, viewTarget, cancelSignal)
  }

  private async withReads(
    graph: ConvertedGraph,
    region: InputRegion,
    viewTarget: ViewTarget,
    cancelSignal: AbortSignal | null,
  ): Promise<ChunkedDataResponse> {
    const nodes = subgraphNodes(graph.node)
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
      removeNodeSequencesInPlace(graph)
    }

    return { graph, gam, region, coloredNodes: [] }
  }

  // Try to resolve a sibling file at `trackFile + suffix` (e.g. ".gai").
  //
  // For URL-based tracks, this is a plain fetch of the sibling URL. Every
  // sibling index (.gai, .tbi, .csi) is gzip, so a body that isn't is a host
  // answering a missing file with a page, as a single-page app's fallback
  // route does, and counts as absent.
  //
  // For uploaded tracks (numeric ids) we look the sibling up by original
  // filename — putFile records the upload's `file.name` and batch, so a
  // `.sorted.gam` and its `.sorted.gam.gai` dropped together pair up.
  private async resolveSibling(
    trackFile: string,
    suffix: string,
    cancelSignal: AbortSignal | null,
  ): Promise<Blob | null> {
    if (isUploadId(trackFile)) {
      return this.registry.sibling(trackFile, suffix)
    }
    const sibling = withPathSuffix(this.resolveUrl(trackFile), suffix)
    if (this.missingSiblings.has(sibling)) {
      return null
    }
    try {
      const blob = await this.resolveTrackFile(sibling, cancelSignal)
      if (!(await isGzip(blob))) {
        this.missingSiblings.add(sibling)
        return null
      }
      return blob
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
    const gaiBlob = await this.resolveSibling(trackFile, '.gai', cancelSignal)
    cancelSignal?.throwIfAborted()
    if (gaiBlob) {
      // Only the BGZF blocks the index points at are read, so a URL-hosted
      // GAM costs a few range requests per region rather than a download of
      // the whole file.
      return await readGamRegion(
        this.trackSource(trackFile),
        gaiBlob,
        nodes.min,
        nodes.max,
        { visits: nodes.ids, signal: cancelSignal },
      )
    }
    // Without an index there is nothing to seek with, so the file is read
    // whole and every read filtered against the subgraph.
    const gamBlob = await this.resolveTrackFile(trackFile, cancelSignal)
    const reads = await raceAbort(this.allReads(gamBlob), cancelSignal)
    return reads.filter(read => alignmentVisitsAny(read, nodes.ids))
  }

  private allReads(gamBlob: Blob): Promise<VgRead[]> {
    if (this.decodedReads?.blob !== gamBlob) {
      const decoded = { blob: gamBlob, reads: readGam(gamBlob) }
      decoded.reads.catch(() => {
        if (this.decodedReads === decoded) {
          this.decodedReads = undefined
        }
      })
      this.decodedReads = decoded
    }
    return this.decodedReads.reads
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
  ): void {
    /* nothing to subscribe to */
  }

  async putFile(
    fileType: FileType,
    file: File,
    _cancelSignal: AbortSignal | null,
    batch?: string,
  ): Promise<string> {
    const { id, isSibling } = this.registry.add({
      name: file.name,
      blob: file,
      batch,
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

  async getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
    haplotypeIndexFile?: string,
  ): Promise<{ pathInfo: PathInfo[] }> {
    if (this.isWalks(graphFile)) {
      return {
        pathInfo: await this.openWalks(graphFile).pathInfo(
          cancelSignal ?? undefined,
        ),
      }
    }
    // Files this backend can't read at all aren't an error — the picker asks
    // about every selected graph, including .gbz/.xg served for the vg server.
    if (!this.isGbzDb(graphFile)) {
      return { pathInfo: [] }
    }
    this.noteHaplotypeIndex(graphFile, haplotypeIndexFile)
    const db = await this.openGraph(graphFile)
    cancelSignal?.throwIfAborted()
    const paths = (await db.paths())
      .filter(p => p.isIndexed)
      .map(p => ({ path: p, name: displayName(p.name) }))
      .filter(({ name }) => isUserFacingPath(name))
    const pathInfo = await Promise.all(
      paths.map(async ({ path, name }) => ({
        name,
        start: path.name.fragment,
        length: await pathLength(db, path),
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

  // Counting reads the whole read file and scans the graph's whole
  // ReferenceIndex table, which for a hosted file is a download and tens of MB
  // of range requests, all for a column in the paths panel. So it only counts
  // uploads, and only a read file small enough to decode quickly.
  private async computeReadCountsPerPath(
    graphFile: string,
    readFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ counts: Record<string, number> } | null> {
    if (
      !this.isGbzDb(graphFile) ||
      !isUploadId(graphFile) ||
      !isUploadId(readFile)
    ) {
      return null
    }
    const gamBlob = this.uploadedBlob(readFile)
    if (gamBlob.size > READ_COUNT_MAX_BYTES) {
      return null
    }
    const db = await this.openGraph(graphFile)
    const indexed = (await db.paths()).filter(
      p => p.isIndexed && isUserFacingPath(displayName(p.name)),
    )
    const ranges = await pathNodeRanges(
      db,
      indexed,
      this.subgraphNodeLimit,
      cancelSignal,
    ).catch((e: unknown) => {
      if (e instanceof SubgraphLimitError) {
        return undefined
      }
      throw e
    })
    if (ranges === undefined) {
      return null
    }
    const paths = indexed
      .map(p => ({ name: displayName(p.name), range: ranges.get(p.handle) }))
      .filter(
        (p): p is { name: string; range: NodeIdRange } => p.range !== undefined,
      )
    if (paths.length === 0) {
      return null
    }

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
