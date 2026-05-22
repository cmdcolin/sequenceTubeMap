/**
 * Guts of the local API Web Worker. Runs in a web worker in the browser and
 * in the main thread under Vitest.
 */

import * as Comlink from 'comlink'
import { GBZBaseAPI } from '../GBZBaseAPI.ts'
import { getCompiledWasm } from '../wasm/loader.browser.ts'
import type { ChunkedDataResponse } from '../APIInterface.ts'
import type {
  FileType,
  FilenamesResponse,
  PathInfo,
  RegionInfo,
  Track,
  ViewTarget,
} from '../../Types.ts'

class WorkerAPI {
  #api = new GBZBaseAPI(getCompiledWasm)
  #abortControllers = new Map<number, AbortController>()

  #getSignal(cancelID: number | undefined): AbortSignal | null {
    if (cancelID === undefined) return null
    const controller = new AbortController()
    this.#abortControllers.set(cancelID, controller)
    return controller.signal
  }

  #requestOver(cancelID: number | undefined): void {
    if (cancelID !== undefined) {
      this.#abortControllers.delete(cancelID)
    }
  }

  cancel(cancelID: number): void {
    this.#abortControllers.get(cancelID)?.abort()
  }

  setBaseUrl(url: string): void {
    this.#api.setBaseUrl(url)
  }

  async getChunkedData(
    viewTarget: ViewTarget,
    cancelID: number | undefined,
  ): Promise<ChunkedDataResponse> {
    try {
      return await this.#api.getChunkedData(
        viewTarget,
        this.#getSignal(cancelID),
      )
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getFilenames(
    cancelID: number | undefined,
  ): Promise<FilenamesResponse> {
    try {
      return await this.#api.getFilenames(this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async putFile(
    fileType: FileType,
    file: File,
    cancelID: number | undefined,
  ): Promise<string> {
    try {
      return await this.#api.putFile(fileType, file, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getBedRegions(
    bedFile: string,
    cancelID: number | undefined,
  ): Promise<{ bedRegions?: RegionInfo }> {
    try {
      return await this.#api.getBedRegions(bedFile, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getPathNames(
    graphFile: string,
    cancelID: number | undefined,
  ): Promise<{ pathNames: string[] }> {
    try {
      return await this.#api.getPathNames(graphFile, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getPathInfo(
    graphFile: string,
    cancelID: number | undefined,
  ): Promise<{ pathInfo: PathInfo[] }> {
    try {
      return await this.#api.getPathInfo(graphFile, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelID: number | undefined,
  ): Promise<{ tracks?: Track[] }> {
    try {
      return await this.#api.getChunkTracks(
        bedFile,
        chunk,
        this.#getSignal(cancelID),
      )
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getReadCountsPerPath(
    graphFile: string,
    readFile: string,
    cancelID: number | undefined,
  ): Promise<{ counts: Record<string, number> } | null> {
    try {
      return await this.#api.getReadCountsPerPath(
        graphFile,
        readFile,
        this.#getSignal(cancelID),
      )
    } finally {
      this.#requestOver(cancelID)
    }
  }

  subscribeToFilenameChanges(onChangeCallback: () => void): () => void {
    const controller = new AbortController()
    this.#api.subscribeToFilenameChanges(onChangeCallback, controller.signal)
    return Comlink.proxy(() => {
      controller.abort()
    })
  }
}

export type WorkerAPIShape = WorkerAPI

// Comlink.Endpoint covers both real Workers and the cross-EventEmitter
// pair used by the Vitest mock in __mocks__/WorkerFactory.js.
export function setUpWorker(target: Comlink.Endpoint): void {
  Comlink.expose(new WorkerAPI(), target)
}
