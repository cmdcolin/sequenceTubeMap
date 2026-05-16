import * as Comlink from 'comlink'
import type {
  APIInterface,
  ChunkedDataResponse,
  FilenameSubscription,
} from './APIInterface'
import { makeWorker } from './local/WorkerFactory.js'
import type {
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../Types'

type WorkerProxy = Comlink.Remote<{
  subscribeToFilenameChanges(handler: () => void): void
  cancel(cancelID: number): void
  getChunkedData(
    viewTarget: ViewTarget,
    cancelID: number | undefined,
  ): Promise<ChunkedDataResponse>
  getFilenames(cancelID: number | undefined): Promise<FilenamesResponse>
  putFile(
    fileType: FileType,
    file: File,
    cancelID: number | undefined,
  ): Promise<string>
  getBedRegions(
    bedFile: string,
    cancelID: number | undefined,
  ): Promise<{ bedRegions?: RegionInfo }>
  getPathNames(
    graphFile: string,
    cancelID: number | undefined,
  ): Promise<{ pathNames: string[] }>
  getPathInfo(
    graphFile: string,
    cancelID: number | undefined,
  ): Promise<{ pathInfo: PathInfo[] }>
  getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelID: number | undefined,
  ): Promise<{ tracks?: Track[] }>
}>

/**
 * API implementation that uses a web worker to run a GBZBaseAPI.
 */
export class LocalAPI implements APIInterface {
  private readonly worker: Worker
  private readonly workerAPI: WorkerProxy
  private nextCancelID = 0
  private readonly nameChangeEvents = new EventTarget()

  constructor() {
    this.worker = makeWorker()
    this.workerAPI = Comlink.wrap<WorkerProxy>(this.worker) as WorkerProxy

    // Forward filename changes from worker to local EventTarget.
    this.workerAPI.subscribeToFilenameChanges(
      Comlink.proxy(() => {
        this.nameChangeEvents.dispatchEvent(new CustomEvent('change'))
      }),
    )
  }

  private getCancelID(signal: AbortSignal | null | undefined): number | undefined {
    if (!signal) {
      return undefined
    }
    const cancelID = this.nextCancelID++
    signal.addEventListener('abort', () => {
      this.workerAPI.cancel(cancelID)
    })
    return cancelID
  }

  getChunkedData(viewTarget: ViewTarget, cancelSignal: AbortSignal | null) {
    return this.workerAPI.getChunkedData(
      viewTarget,
      this.getCancelID(cancelSignal),
    )
  }

  getFilenames(cancelSignal: AbortSignal | null) {
    return this.workerAPI.getFilenames(this.getCancelID(cancelSignal))
  }

  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): FilenameSubscription {
    const eventHandler = () => {
      if (!cancelSignal.aborted) {
        handler()
      }
    }
    const unsubscribe = () => {
      this.nameChangeEvents.removeEventListener('change', eventHandler)
      cancelSignal.removeEventListener('abort', unsubscribe)
    }
    this.nameChangeEvents.addEventListener('change', eventHandler)
    cancelSignal.addEventListener('abort', unsubscribe)
    return {}
  }

  putFile(fileType: FileType, file: File, cancelSignal: AbortSignal | null) {
    return this.workerAPI.putFile(
      fileType,
      file,
      this.getCancelID(cancelSignal),
    )
  }

  getBedRegions(bedFile: string, cancelSignal: AbortSignal | null) {
    return this.workerAPI.getBedRegions(bedFile, this.getCancelID(cancelSignal))
  }

  getPathNames(graphFile: string, cancelSignal: AbortSignal | null) {
    return this.workerAPI.getPathNames(
      graphFile,
      this.getCancelID(cancelSignal),
    )
  }

  getPathInfo(graphFile: string, cancelSignal: AbortSignal | null) {
    return this.workerAPI.getPathInfo(
      graphFile,
      this.getCancelID(cancelSignal),
    )
  }

  getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ) {
    return this.workerAPI.getChunkTracks(
      bedFile,
      chunk,
      this.getCancelID(cancelSignal),
    )
  }
}

export default LocalAPI
