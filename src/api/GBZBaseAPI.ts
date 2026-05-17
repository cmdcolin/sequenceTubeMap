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

/**
 * API implementation that uses tools compiled to WebAssembly, client-side.
 *
 * Can operate either in the main thread or in a worker, but handles file
 * uploads differently depending on where you put it.
 */
export class GBZBaseAPI implements APIInterface {
  // User-uploaded files, indexed by string id (the array index).
  private files: Blob[] = []
  // Index of upload ids by track type.
  private filesByType = new Map<FileType, string[]>()
  // Promise for the compiled WebAssembly module. Populated lazily by setUp().
  private compiledWasm: Promise<WebAssembly.Module> | null = null

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

    const graphFileBlob = this.files[parseInt(graphTrack.trackFile, 10)]

    if (graphFileBlob === undefined) {
      throw new Error('Graph file ' + graphTrack.trackFile + ' does not exist')
    }

    const region = convertRegionToRangeRegion(parseRegion(viewTarget.region))

    if (!region.contig.includes('#')) {
      // Not PanSN; ask for a generic path.
      region.contig = '_gbwt_ref#' + region.contig
    }

    const parts = region.contig.split('#')
    const sample = parts[0] ?? ''
    const contig = parts[parts.length - 1] ?? ''

    const { stdout } = await this.callWasm(
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

    const result = convertSchema(JSON.parse(stdout))
    if (viewTarget.removeSequences) {
      removeNodeSequencesInPlace(result)
    }

    return {
      graph: result,
      gam: [],
      // Match the server's [start, end] shape; the tubemap ruler indexes [0]
      // and [1] as numbers to position the region-highlight ticks.
      region: [region.start, region.end],
      coloredNodes: [],
    }
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
    // Track files just by array index.
    const fileName = this.files.length.toString()
    this.files.push(file)

    debugLog(`Store ${file.size} byte upload:`, file)

    let list = this.filesByType.get(fileType)
    if (!list) {
      list = []
      this.filesByType.set(fileType, list)
    }
    list.push(fileName)

    return fileName
  }

  async getBedRegions(
    _bedFile: string,
    _cancelSignal: AbortSignal | null,
  ): Promise<{ bedRegions?: RegionInfo }> {
    return { bedRegions: {} }
  }

  async getPathNames(
    _graphFile: string,
    _cancelSignal: AbortSignal | null,
  ): Promise<{ pathNames: string[] }> {
    return { pathNames: [] }
  }

  async getPathInfo(
    _graphFile: string,
    _cancelSignal: AbortSignal | null,
  ): Promise<{ pathInfo: PathInfo[] }> {
    return { pathInfo: [] }
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
