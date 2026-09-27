import * as Comlink from 'comlink'
import type { APIInterface } from './APIInterface.ts'
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
  // Comlink waits forever for a reply that will never come, which left the
  // spinner up for good when the worker script failed to load. Every call
  // races `interrupted`, which rejects when the calls waiting now can no
  // longer expect an answer; `failure` turns away the calls after it.
  private started = false
  private failure: Error | undefined
  private interrupted!: Promise<never>
  private interrupt!: (error: Error) => void

  constructor() {
    this.worker = makeWorker()
    this.workerAPI = Comlink.wrap<WorkerProxy>(this.worker)
    this.resetInterrupt()
    // Once the worker has answered, an error event is an uncaught exception
    // inside it, and it goes on answering.
    this.worker.addEventListener('error', event => {
      if (!this.started) {
        const reason = event instanceof ErrorEvent ? `: ${event.message}` : ''
        this.failure = new Error(
          `The in-browser reader's worker failed to start${reason}`,
        )
        this.interrupt(this.failure)
        this.worker.terminate()
      }
    })
    // A reply that can't be deserialized is lost, and nothing says whose.
    this.worker.addEventListener('messageerror', () => {
      this.interrupt(
        new Error("A reply from the in-browser reader's worker was unreadable"),
      )
      this.resetInterrupt()
    })

    // The worker's self.location is the worker script URL, not the page; pass
    // the page baseURI so relative trackFile paths resolve correctly.
    void this.workerAPI.setBaseUrl(document.baseURI).then(() => {
      this.started = true
    })
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

  private resetInterrupt(): void {
    this.interrupted = new Promise<never>((_resolve, reject) => {
      this.interrupt = reject
    })
    this.interrupted.catch(() => {
      /* each waiting call reports it */
    })
  }

  private async call<T>(run: () => Promise<T>): Promise<T> {
    if (this.failure) {
      throw this.failure
    }
    return await Promise.race([run(), this.interrupted])
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
      return await this.call(() => run(undefined))
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
      return await this.call(() => run(cancelID))
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
  ): void {
    this.nameChangeEvents.addEventListener('change', handler, {
      signal: cancelSignal,
    })
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

  getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
    haplotypeIndexFile?: string,
  ) {
    return this.withCancel(cancelSignal, cancelID =>
      this.workerAPI.getPathInfo(graphFile, cancelID, haplotypeIndexFile),
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
