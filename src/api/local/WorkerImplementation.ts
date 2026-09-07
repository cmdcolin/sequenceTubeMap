/**
 * Guts of the local API Web Worker. Runs in a web worker in the browser and
 * in the main thread under Vitest.
 */

import * as Comlink from 'comlink'
import { GBZBaseAPI } from '../GBZBaseAPI.ts'
import type { ChunkedDataResponse } from '../APIInterface.ts'
import type { ProgressListener } from '../downloadProgress.ts'
import type {
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../../Types.ts'

class WorkerAPI {
  #api = new GBZBaseAPI()
  #abortControllers = new Map<number, AbortController>()
  // `cancel` can reach the worker before the request it cancels, because
  // LocalAPI posts it as soon as an already-aborted signal is handed over.
  #cancelledEarly = new Set<number>()

  #signalFor(cancelID: number | undefined): AbortSignal | null {
    if (cancelID === undefined) {
      return null
    }
    const controller = new AbortController()
    this.#abortControllers.set(cancelID, controller)
    if (this.#cancelledEarly.delete(cancelID)) {
      controller.abort()
    }
    return controller.signal
  }

  async #withCancel<T>(
    cancelID: number | undefined,
    run: (cancelSignal: AbortSignal | null) => Promise<T>,
  ): Promise<T> {
    const cancelSignal = this.#signalFor(cancelID)
    try {
      return await run(cancelSignal)
    } finally {
      if (cancelID !== undefined) {
        this.#abortControllers.delete(cancelID)
        this.#cancelledEarly.delete(cancelID)
      }
    }
  }

  cancel(cancelID: number): void {
    const controller = this.#abortControllers.get(cancelID)
    if (controller) {
      controller.abort()
    } else {
      this.#cancelledEarly.add(cancelID)
    }
  }

  setBaseUrl(url: string): void {
    this.#api.setBaseUrl(url)
  }

  setDebug(enabled: boolean): void {
    this.#api.setDebug(enabled)
  }

  // The worker has its own copy of the downloadProgress module, so progress
  // has to be handed back over Comlink for the panel on the main thread to
  // see it.
  setProgressListener(listener: ProgressListener): void {
    this.#api.setProgressListener(update => listener(update))
  }

  async getChunkedData(
    viewTarget: ViewTarget,
    cancelID: number | undefined,
  ): Promise<ChunkedDataResponse> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getChunkedData(viewTarget, signal),
    )
  }

  async getFilenames(
    cancelID: number | undefined,
  ): Promise<FilenamesResponse> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getFilenames(signal),
    )
  }

  async putFile(
    fileType: FileType,
    file: File,
    cancelID: number | undefined,
  ): Promise<string> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.putFile(fileType, file, signal),
    )
  }

  async getBedRegions(
    bedFile: string,
    cancelID: number | undefined,
  ): Promise<{ bedRegions?: RegionInfo }> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getBedRegions(bedFile, signal),
    )
  }

  async getPathNames(
    graphFile: string,
    cancelID: number | undefined,
  ): Promise<{ pathNames: string[] }> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getPathNames(graphFile, signal),
    )
  }

  async getPathInfo(
    graphFile: string,
    cancelID: number | undefined,
  ): Promise<{ pathInfo: PathInfo[] }> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getPathInfo(graphFile, signal),
    )
  }

  async getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelID: number | undefined,
  ): Promise<{ tracks?: Track[] }> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getChunkTracks(bedFile, chunk, signal),
    )
  }

  async getReadCountsPerPath(
    graphFile: string,
    readFile: string,
    cancelID: number | undefined,
  ): Promise<{ counts: Record<string, number> } | null> {
    return await this.#withCancel(cancelID, signal =>
      this.#api.getReadCountsPerPath(graphFile, readFile, signal),
    )
  }
}

export type WorkerAPIShape = WorkerAPI

// Comlink.Endpoint covers both real Workers and the cross-EventEmitter
// pair used by the Vitest mock in __mocks__/WorkerFactory.js.
export function setUpWorker(target: Comlink.Endpoint): void {
  Comlink.expose(new WorkerAPI(), target)
}
