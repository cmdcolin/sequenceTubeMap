/**
 * Guts of the local API Web Worker. Runs in a web worker in the browser and in the main thread in Jest.
 */

import * as Comlink from 'comlink'
import { GBZBaseAPI } from '../GBZBaseAPI.mjs'

class WorkerAPI {
  #api = new GBZBaseAPI()
  #abortControllers = new Map()

  #getSignal(cancelID) {
    if (cancelID === undefined) return undefined
    const controller = new AbortController()
    this.#abortControllers.set(cancelID, controller)
    return controller.signal
  }

  #requestOver(cancelID) {
    this.#abortControllers.delete(cancelID)
  }

  cancel(cancelID) {
    this.#abortControllers.get(cancelID)?.abort()
  }

  async getChunkedData(viewTarget, cancelID) {
    try {
      return await this.#api.getChunkedData(
        viewTarget,
        this.#getSignal(cancelID),
      )
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getFilenames(cancelID) {
    try {
      return await this.#api.getFilenames(this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async putFile(fileType, file, cancelID) {
    try {
      return await this.#api.putFile(fileType, file, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getBedRegions(bedFile, cancelID) {
    try {
      return await this.#api.getBedRegions(bedFile, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getPathNames(graphFile, cancelID) {
    try {
      return await this.#api.getPathNames(graphFile, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getPathInfo(graphFile, cancelID) {
    try {
      return await this.#api.getPathInfo(graphFile, this.#getSignal(cancelID))
    } finally {
      this.#requestOver(cancelID)
    }
  }

  async getChunkTracks(bedFile, chunk, cancelID) {
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

  subscribeToFilenameChanges(onChangeCallback) {
    const controller = new AbortController()
    this.#api.subscribeToFilenameChanges(onChangeCallback, controller.signal)
    return Comlink.proxy(() => controller.abort())
  }
}

export function setUpWorker(self) {
  Comlink.expose(new WorkerAPI(), self)
}
