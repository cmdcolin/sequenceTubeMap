import * as Comlink from 'comlink'
import type { APIInterface, FilenameSubscription } from './APIInterface.ts'
import { applyProgress } from './downloadProgress.ts'
import type { ProgressUpdate } from './downloadProgress.ts'
import { makeWorker } from './local/WorkerFactory.js'
import type { WorkerAPIShape } from './local/WorkerImplementation.ts'
import type { FileType, ViewTarget } from '../Types.ts'

type WorkerProxy = Comlink.Remote<WorkerAPIShape>

// The worker can't read localStorage, so the page decides whether the
// gbz-base backend logs and tells it.
function debugRequested(): boolean {
  const { search, hash } = window.location
  return (
    new URLSearchParams(search).has('gbzBaseDebug') ||
    hash.includes('gbzBaseDebug')
  )
}

/**
 * API implementation that uses a web worker to run a GBZBaseAPI.
 */
export class LocalAPI implements APIInterface {
  readonly mode = 'local' as const
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
    if (debugRequested()) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.workerAPI.setDebug(true)
    }
    // Download progress is published by the module inside the worker, so
    // bridge it into this thread's copy for DownloadProgressPanel to read.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.workerAPI.setProgressListener(
      Comlink.proxy((update: ProgressUpdate) => {
        applyProgress(update)
      }),
    )
  }

  // Register an id the worker can match a `cancel` message to, and keep it
  // wired to `signal` only for as long as the request runs. An
  // already-aborted signal still gets an id and an immediate cancel, which
  // the worker remembers until the request it belongs to arrives.
  private async withCancel<T>(
    signal: AbortSignal | null | undefined,
    run: (cancelID: number | undefined) => Promise<T>,
  ): Promise<T> {
    if (!signal) {
      return await run(undefined)
    }
    const cancelID = this.nextCancelID++
    const onAbort = () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.workerAPI.cancel(cancelID)
    }
    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort)
    }
    try {
      return await run(cancelID)
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }

  getChunkedData(viewTarget: ViewTarget, cancelSignal: AbortSignal | null) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getChunkedData(viewTarget, cancelID),
    )
  }

  getFilenames(cancelSignal: AbortSignal | null) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getFilenames(cancelID),
    )
  }

  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): FilenameSubscription {
    const onChange = () => {
      if (!cancelSignal.aborted) {
        handler()
      }
    }
    const unsubscribe = () => {
      this.nameChangeEvents.removeEventListener('change', onChange)
      cancelSignal.removeEventListener('abort', unsubscribe)
    }
    this.nameChangeEvents.addEventListener('change', onChange)
    cancelSignal.addEventListener('abort', unsubscribe)
    return unsubscribe
  }

  async putFile(
    fileType: FileType,
    file: File,
    cancelSignal: AbortSignal | null,
  ) {
    const id = await this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.putFile(fileType, file, cancelID),
    )
    // Uploading is the only thing that changes the worker's file list, so
    // this is where the "filenames changed" notification comes from.
    this.nameChangeEvents.dispatchEvent(new Event('change'))
    return id
  }

  getBedRegions(bedFile: string, cancelSignal: AbortSignal | null) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getBedRegions(bedFile, cancelID),
    )
  }

  getPathNames(graphFile: string, cancelSignal: AbortSignal | null) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getPathNames(graphFile, cancelID),
    )
  }

  getPathInfo(graphFile: string, cancelSignal: AbortSignal | null) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getPathInfo(graphFile, cancelID),
    )
  }

  getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getChunkTracks(bedFile, chunk, cancelID),
    )
  }

  getReadCountsPerPath(
    graphFile: string,
    readFile: string,
    cancelSignal: AbortSignal | null,
  ) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getReadCountsPerPath(graphFile, readFile, cancelID),
    )
  }
}

export default LocalAPI
