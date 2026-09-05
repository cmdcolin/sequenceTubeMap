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
  nodes as gbzNodes,
  subgraphInInterval,
} from '@gmod/gbz-base'
import type { GbzPath, PathName, PathQuery, Pos } from '@gmod/gbz-base'

import { parseRegion, convertRegionToRangeRegion } from '../common.ts'

import { convertSchema, removeNodeSequencesInPlace } from './gbz/schema.ts'
import { clearProgress, report } from './downloadProgress.ts'
import { readGam, readGamRegion, scanReadNodeIds } from './gam/gam.ts'
import { UploadRegistry, isUploadId } from './local/fileRegistry.ts'

import type {
  APIInterface,
  ChunkedDataResponse,
  FilenameSubscription,
} from './APIInterface.ts'
import type {
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../Types.ts'
import type { VgNode, VgRead } from '../util/tubemap.ts'

// Set GBZBASE_DEBUG=1 / localStorage.gbzBaseDebug = '1' to re-enable the
// chatty per-call logging that was unconditional in the original .mjs.
const DEBUG = (() => {
  if (typeof process !== 'undefined' && process.env.GBZBASE_DEBUG === '1') {
    return true
  }
  if (typeof globalThis !== 'undefined') {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    if (ls?.getItem('gbzBaseDebug') === '1') return true
  }
  return false
})()

const debugLog: (...args: unknown[]) => void = DEBUG
  ? (...args) => {
      console.warn(...args)
    }
  : () => {
      /* no-op */
    }

interface NodeIdRange {
  min: bigint
  max: bigint
}

function nodeIdRange(nodes: VgNode[]): NodeIdRange | null {
  if (nodes.length === 0) {
    return null
  }
  let min: bigint | null = null
  let max: bigint | null = null
  for (const n of nodes) {
    const id = typeof n.id === 'bigint' ? n.id : BigInt(n.id)
    if (min === null || id < min) {
      min = id
    }
    if (max === null || id > max) {
      max = id
    }
  }
  return min === null || max === null ? null : { min, max }
}

function alignmentInRange(
  aln: VgRead,
  min: bigint,
  max: bigint,
): boolean {
  for (const m of aln.path?.mapping ?? []) {
    const id = m.position?.node_id
    if (id === undefined) {
      continue
    }
    const n = typeof id === 'bigint' ? id : BigInt(id)
    if (n >= min && n <= max) {
      return true
    }
  }
  return false
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// The Region field takes `contig`, `sample#contig` or
// `sample#haplotype#contig`. A bare contig is the generic `_gbwt_ref` path.
function pathQueryFor(contig: string): PathQuery {
  const parts = contig.split('#')
  const [sample, second] = parts
  if (parts.length === 1 || sample === undefined || second === undefined) {
    return { contig }
  }
  if (parts.length === 2) {
    return { sample, contig: second }
  }
  const haplotype = Number(second)
  return {
    sample,
    contig: parts.slice(2).join('#'),
    ...(Number.isInteger(haplotype) ? { haplotype } : {}),
  }
}

// gbz-base path names follow the GBWT `sample#haplotype#contig` convention.
// Reference paths carry the `_gbwt_ref` sample, which is stripped so the
// surfaced name is what the Region field accepts.
function displayName({ sample, contig, haplotype }: PathName): string {
  if (sample === GENERIC_SAMPLE) {
    return contig
  }
  return haplotype === 0 ? `${sample}#${contig}` : `${sample}#${haplotype}#${contig}`
}

// Match the server-side filtering: skip internal `_…` paths and the
// `thread_N` names vg gbwt -G emits for haplotypes that came through
// `vg chunk -T`. Neither is a meaningful contig for the path picker.
function isUserFacingPath(name: string): boolean {
  return !name.startsWith('_') && !/^thread_\d+$/.test(name)
}

// Walk the GBWT from the last ReferenceIndex sample to the end of the path.
// Samples are at most one index interval apart, so this is a short walk that
// turns the sampled offset into the exact path length.
async function walkToPathEnd(
  db: GBZBase,
  from: { pathOffset: number; pos: Pos },
): Promise<number> {
  let offset = from.pathOffset
  let pos: Pos | undefined = from.pos
  while (pos !== undefined && pos.node !== gbzNodes.ENDMARKER) {
    const record = await db.getRecord(pos.node)
    if (!record) {
      throw new Error(`Node record ${pos.node} is missing from the database`)
    }
    offset += record.sequenceLen
    pos = record.gbwt().lf(pos.offset)
  }
  return offset
}

async function pathLength(db: GBZBase, path: GbzPath): Promise<number | null> {
  const indexed = db.hasHaplotypeIndex
    ? await db.haplotypeLength(path.handle)
    : undefined
  if (indexed !== undefined) {
    return indexed
  }
  const last = await db.indexedPosition(path.handle, Number.MAX_SAFE_INTEGER)
  return last ? walkToPathEnd(db, last) : null
}

// Per-path node-id range from the ReferenceIndex samples. Approximate — the
// index samples nodes, so a path can in principle traverse ids outside
// MIN/MAX; for typical reference paths this is rare.
async function pathNodeRanges(db: GBZBase): Promise<Map<number, NodeIdRange>> {
  const ranges = new Map<number, NodeIdRange>()
  for await (const { values } of db.sqlite.scan('ReferenceIndex')) {
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

  setBaseUrl(url: string): void {
    this.baseUrl = url
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
  // stream the body and publish progress via `downloadProgress.report` so the
  // loader spinner can show "downloading X / Y MB" instead of looking frozen.
  private async resolveTrackFile(trackFile: string): Promise<Blob> {
    if (isUploadId(trackFile)) {
      return this.uploadedBlob(trackFile)
    }
    const resolved = this.resolveUrl(trackFile)
    let cached = this.urlCache.get(resolved)
    if (!cached) {
      cached = (async () => {
        const response = await fetch(resolved)
        if (!response.ok) {
          throw new Error(
            `Could not load ${trackFile}: HTTP ${response.status}`,
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
          report(resolved, 0, total)
          try {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
              received += value.length
              report(resolved, received, total)
            }
          } finally {
            clearProgress(resolved)
          }
          return new Blob(chunks as BlobPart[])
        }
        return response.blob()
      })()
      this.urlCache.set(resolved, cached)
    }
    return cached
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
          throw new Error(
            `Could not open "${trackFile}" as a gbz-base database: ${errorMessage(e)}\n` +
              'The in-browser backend reads .gbz.db files; .vg, .xg and .gbz are not supported.',
            { cause: e },
          )
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
    return checkName === null ? false : checkName.endsWith('.gbz.db')
  }

  /////////
  // Tube Map API implementation
  /////////

  async getChunkedData(
    viewTarget: ViewTarget,
    _cancelSignal: AbortSignal | null,
  ): Promise<ChunkedDataResponse> {
    debugLog('Got view target:', viewTarget)

    const graphTrack = viewTarget.tracks.find(t => t.trackType === 'graph') ?? null
    if (!graphTrack?.trackFile) {
      throw new Error('No graph track selected')
    }

    const region = convertRegionToRangeRegion(parseRegion(viewTarget.region))
    const db = await this.openGraph(graphTrack.trackFile)

    let result
    try {
      const subgraph = await subgraphInInterval(
        db,
        pathQueryFor(region.contig),
        region.start,
        region.end,
        { haplotypes: 'distinct' },
      )
      if (db.hasHaplotypeIndex) {
        await subgraph.identifyPaths()
      }
      result = convertSchema(
        subgraph.toJSON(false, {
          names: db.hasHaplotypeIndex ? 'resolved' : 'anonymous',
        }),
      )
    } catch (e) {
      throw new Error(
        `Failed to query "${graphTrack.trackFile}" at ${region.contig}:${region.start}-${region.end}: ${errorMessage(e)}`,
        { cause: e },
      )
    }
    const readTracks = viewTarget.tracks.filter(t => t.trackType === 'read')
    const nodeRange = nodeIdRange(result.node)
    const gam: ChunkedDataResponse['gam'] = []
    for (const track of readTracks) {
      if (!track.trackFile) {
        gam.push([])
        continue
      }
      gam.push(await this.readsForTrack(track.trackFile, nodeRange))
    }

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
  ): Promise<Blob | null> {
    if (isUploadId(trackFile)) {
      return this.registry.sibling(trackFile, suffix)
    }
    try {
      return await this.resolveTrackFile(trackFile + suffix)
    } catch {
      return null
    }
  }

  private async readsForTrack(
    trackFile: string,
    nodeRange: NodeIdRange | null,
  ): Promise<VgRead[]> {
    const gamBlob = await this.resolveTrackFile(trackFile)
    if (nodeRange) {
      const gaiBlob = await this.resolveSibling(trackFile, '.gai')
      if (gaiBlob) {
        return readGamRegion(gamBlob, gaiBlob, nodeRange.min, nodeRange.max)
      }
    }
    const all = await readGam(gamBlob)
    if (!nodeRange) {
      return all
    }
    return all.filter(r => alignmentInRange(r, nodeRange.min, nodeRange.max))
  }

  async getFilenames(
    _cancelSignal: AbortSignal | null,
  ): Promise<FilenamesResponse> {
    const response: FilenamesResponse = {
      files: [],
      bedFiles: [],
    }

    for (const [type, files] of this.filesByType) {
      if (type === 'bed') {
        response.bedFiles = files
      } else {
        for (const fileName of files) {
          response.files!.push({ trackFile: fileName, trackType: type })
        }
      }
    }

    return response
  }

  subscribeToFilenameChanges(
    _handler: () => void,
    _cancelSignal: AbortSignal,
  ): FilenameSubscription {
    return {}
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
    debugLog(`Store ${file.size} byte upload:`, file)

    // Sibling index files (.gai for .gam, .tbi for .gaf.gz) get uploaded so
    // they're available for region queries, but they aren't tracks in their
    // own right; `resolveSibling` looks them up by name later.
    if (isSibling) {
      return id
    }

    let list = this.filesByType.get(fileType)
    if (!list) {
      list = []
      this.filesByType.set(fileType, list)
    }
    list.push(id)

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
    _cancelSignal: AbortSignal | null,
  ): Promise<{ pathNames: string[] }> {
    const { pathInfo } = await this.getPathInfo(graphFile, null)
    return { pathNames: pathInfo.map(p => p.name) }
  }

  async getPathInfo(
    graphFile: string,
    _cancelSignal: AbortSignal | null,
  ): Promise<{ pathInfo: PathInfo[] }> {
    if (!this.isGbzDb(graphFile)) {
      return { pathInfo: [] }
    }
    try {
      const db = await this.openGraph(graphFile)
      const paths = (await db.paths())
        .filter(p => p.isIndexed)
        .map(p => ({ path: p, name: displayName(p.name) }))
        .filter(({ name }) => isUserFacingPath(name))
      const pathInfo: PathInfo[] = []
      for (const { path, name } of paths) {
        pathInfo.push({
          name,
          start: path.name.fragment,
          length: await pathLength(db, path),
          cyclic: false,
        })
      }
      return { pathInfo }
    } catch (e) {
      debugLog('getPathInfo failed:', e)
      return { pathInfo: [] }
    }
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
    _cancelSignal: AbortSignal | null,
  ): Promise<{ counts: Record<string, number> } | null> {
    const cacheKey = `${graphFile}|${readFile}`
    const cached = this.readCountCache.get(cacheKey)
    if (cached) return cached
    const promise = this.computeReadCountsPerPath(graphFile, readFile)
    this.readCountCache.set(cacheKey, promise)
    return promise
  }

  private async computeReadCountsPerPath(
    graphFile: string,
    readFile: string,
  ): Promise<{ counts: Record<string, number> } | null> {
    if (!this.isGbzDb(graphFile)) return null
    try {
      const db = await this.openGraph(graphFile)
      const ranges = await pathNodeRanges(db)
      const paths = (await db.paths())
        .filter(p => p.isIndexed)
        .map(p => ({ name: displayName(p.name), range: ranges.get(p.handle) }))
        .filter(
          (p): p is { name: string; range: NodeIdRange } =>
            p.range !== undefined && isUserFacingPath(p.name),
        )
      if (paths.length === 0) return null

      const gamBlob = await this.resolveTrackFile(readFile)
      const readNodes = await scanReadNodeIds(gamBlob)

      const counts: Record<string, number> = {}
      for (const { name, range } of paths) {
        let n = 0
        for (const nodes of readNodes) {
          // De-dup per read: increment once even if multiple visited nodes
          // fall inside the path's range.
          for (const id of nodes) {
            if (id >= range.min && id <= range.max) {
              n++
              break
            }
          }
        }
        counts[name] = n
      }
      return { counts }
    } catch (e) {
      debugLog('getReadCountsPerPath failed:', e)
      return null
    }
  }
}

export default GBZBaseAPI
