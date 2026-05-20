import * as Comlink from 'comlink'
import type { APIInterface, FilenameSubscription } from './APIInterface.ts'
import { makeWorker } from './local/WorkerFactory.js'
import type { WorkerAPIShape } from './local/WorkerImplementation.ts'
import type { FileType, ViewTarget } from '../Types.ts'

type WorkerProxy = Comlink.Remote<WorkerAPIShape>

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
    this.workerAPI = Comlink.wrap<WorkerProxy>(this.worker)

    // The worker's self.location is the worker script URL, not the page; pass
    // the page baseURI so relative trackFile paths resolve correctly.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.workerAPI.setBaseUrl(document.baseURI)

    // Forward filename changes from worker to local EventTarget.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
