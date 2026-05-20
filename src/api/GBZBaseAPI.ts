/**
 * GBZBase-based API implementation. Designed to run in a worker efficiently.
 */

import '../config-client.js'
import {
  WASI,
  File as WasiFile,
  OpenFile,
  PreopenDirectory,
  type Fd,
  type Inode,
} from '@bjorn3/browser_wasi_shim'

import { parseRegion, convertRegionToRangeRegion } from '../common.ts'

import { getCompiledWasm } from '#wasm-loader'
import { makeWasiFile } from './wasm/blobWasiFile.ts'
import { convertSchema, removeNodeSequencesInPlace } from './wasm/schema.ts'
import { clearProgress, report } from './downloadProgress.ts'
import { readGbzDbPaths } from './wasm/gbzDbPaths.ts'
import { readGam, readGamRegion } from './gam/gam.ts'
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

interface WasmResult {
  returnCode: number | undefined
  stdout: string
  stderr: string
}

function nodeIdRange(
  nodes: VgNode[],
): { min: bigint; max: bigint } | null {
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

/**
 * API implementation that uses tools compiled to WebAssembly, client-side.
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
  // Cache of blobs fetched lazily from URLs (built-in sample data sources
  // use paths like "exampleData/cactus.vg.xg" instead of uploaded files).
  private urlCache = new Map<string, Promise<Blob>>()
  // Base URL to resolve relative trackFile paths against. Required because
  // GBZBaseAPI typically runs in a Web Worker whose self.location points at
  // /static/js/Worker.ts, not the page; the host LocalAPI passes the page's
  // baseURI via setBaseUrl().
  private baseUrl: string | null = null
  // Promise for the compiled WebAssembly module. Populated lazily by setUp().
  private compiledWasm: Promise<WebAssembly.Module> | null = null

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  // Resolve a trackFile string to a Blob: a numeric ID points at the uploads
  // array; anything else is fetched from the URL (cached). For large URL
  // fetches (e.g. the 128 MB hprc-chr20.gbz.db demo file) we stream the body
  // and publish progress via `downloadProgress.report` so the loader spinner
  // can show "downloading X / Y MB" instead of looking frozen.
  private async resolveTrackFile(trackFile: string): Promise<Blob> {
    if (isUploadId(trackFile)) {
      const blob = this.registry.get(trackFile)
      if (!blob) {
        throw new Error(`Uploaded file ${trackFile} does not exist`)
      }
      return blob
    }
    const resolved = this.baseUrl
      ? new URL(trackFile, this.baseUrl).href
      : trackFile
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
            // The inner read loop is what actually paces progress reporting;
            // pull all the chunks before assembling the Blob.
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

  async setUp(): Promise<WebAssembly.Module> {
    this.compiledWasm ??= getCompiledWasm()
    return this.compiledWasm
  }

  // Make a call into the WebAssembly code and return the result.
  //
  // If workingDirectory is set, it is an object from filename to blob to
  // present as the current directory.
  async callWasm(
    argv: string[],
    workingDirectory?: Record<string, Blob>,
  ): Promise<WasmResult> {
    if (argv.length < 1) {
      throw new Error('Not safe to invoke main() without program name')
    }

    const module = await this.setUp()

    const stdin = new WasiFile([])
    const stdout = new WasiFile([])
    const stderr = new WasiFile([])

    const environment = ['RUST_BACKTRACE=full']

    const fileDescriptors: Fd[] = [
      new OpenFile(stdin),
      new OpenFile(stdout),
      new OpenFile(stderr),
    ]

    if (workingDirectory) {
      const nameToWASIFile = new Map<string, Inode>()
      for (const [filename, blob] of Object.entries(workingDirectory)) {
        debugLog(`Mount ${blob.size} byte blob:`, blob)
        const file = await makeWasiFile(blob)
        nameToWASIFile.set(filename, file)
        debugLog('Mount file:', file)
      }
      fileDescriptors.push(new PreopenDirectory('.', nameToWASIFile))
    }

    const wasi = new WASI(argv, environment, fileDescriptors)

    const instantiation = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    })

    debugLog('Running WASM with arguments:', argv)
    debugLog('Running WASM with FDs:', fileDescriptors)

    let returnCode: number | undefined
    let stdOutText: string
    let stdErrText: string

    try {
      returnCode = wasi.start(
        instantiation as Parameters<typeof wasi.start>[0],
      )
      // TODO: the shim logs loads of attempts to make/open the lock file, is it maybe not being allowed to be read back?
      // TODO: Our return code is undefined for some reason; it is supposed to come out of start.
      debugLog('Execution finished with return code:', returnCode)
    } finally {
      stdOutText = new TextDecoder().decode(stdout.data)
      stdErrText = new TextDecoder().decode(stderr.data)
      debugLog('Standard Output:', stdOutText)
      debugLog('Standard Error:', stdErrText)
    }

    return { returnCode, stdout: stdOutText, stderr: stdErrText }
  }

  async available(): Promise<boolean> {
    try {
      await this.callWasm(['query', '--help'])
      return true
    } catch {
      return false
    }
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

    const graphFileBlob = await this.resolveTrackFile(graphTrack.trackFile)

    const region = convertRegionToRangeRegion(parseRegion(viewTarget.region))

    if (!region.contig.includes('#')) {
      // Not PanSN; ask for a generic path.
      region.contig = '_gbwt_ref#' + region.contig
    }

    const parts = region.contig.split('#')
    const sample = parts[0] ?? ''
    const contig = parts[parts.length - 1] ?? ''

    const { stdout, stderr, returnCode } = await this.callWasm(
      [
        'query',
        '--sample',
        sample,
        '--contig',
        contig,
        '--interval',
        `${region.start}..${region.end}`,
        '--format',
        'json',
        '--distinct',
        'graph.gbz.db',
      ],
      { 'graph.gbz.db': graphFileBlob },
    )

    let result
    try {
      result = convertSchema(JSON.parse(stdout))
    } catch {
      const stderrTail = stderr.trim().split('\n').slice(-5).join('\n')
      // Pull the first 'Error: ...' line out of stderr; that's the structured
      // message the gbz-base CLI prints for both load failures and query
      // failures, and it's the part the user actually needs.
      const wasmErrorLine = stderr
        .split('\n')
        .map(l => l.trim())
        .find(l => l.startsWith('Error:'))
      const reason = wasmErrorLine ?? `WASM exited with code ${returnCode ?? 'undefined'}`
      // Heuristic: load/parse failures mention the file or schema; query
      // failures mention paths/intervals. Only surface the file-format hint
      // when it's actually plausible the file is the wrong type.
      const looksLikeFormatError =
        wasmErrorLine === undefined ||
        /unsupported|cannot open|not a database|schema|magic/i.test(wasmErrorLine)
      const formatHint = looksLikeFormatError
        ? `\nThe in-browser WASM backend reads .gbz (preferred) or .gbz.db files; .vg / .xg are not supported.`
        : ''
      const stderrSuffix =
        stderrTail && stderrTail !== wasmErrorLine
          ? `\nWASM stderr:\n${stderrTail}`
          : ''
      throw new Error(
        `Failed to query "${graphTrack.trackFile}" at ${region.contig}:${region.start}-${region.end}: ${reason}${formatHint}${stderrSuffix}`,
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
    nodeRange: { min: bigint; max: bigint } | null,
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
    // For uploaded files `graphFile` is a numeric registry id like "0", so the
    // extension check has to look at the original filename the registry kept.
    const checkName = isUploadId(graphFile)
      ? this.registry.getName(graphFile)
      : graphFile
    if (!checkName?.endsWith('.gbz.db')) {
      return { pathInfo: [] }
    }
    try {
      const blob = await this.resolveTrackFile(graphFile)
      const pathInfo = await readGbzDbPaths(blob)
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
}

export default GBZBaseAPI
