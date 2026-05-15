import * as Comlink from 'comlink'
import { APIInterface } from './APIInterface.mjs'
import { makeWorker } from './local/WorkerFactory.js'

/**
 * API implementation that uses a web worker to run a GBZBaseAPI.
 */
export class LocalAPI extends APIInterface {
  constructor() {
    super()

    this.worker = makeWorker()
    this.workerAPI = Comlink.wrap(this.worker)
    this.nextCancelID = 0
    this.nameChangeEvents = new EventTarget()

    // Forward filename changes from worker to local EventTarget
    this.workerAPI.subscribeToFilenameChanges(
      Comlink.proxy(() => {
        this.nameChangeEvents.dispatchEvent(new CustomEvent('change'))
      }),
    )
  }

  getCancelID(signal) {
    if (signal === undefined) return undefined
    const cancelID = this.nextCancelID++
    signal.addEventListener('abort', () => {
      this.workerAPI.cancel(cancelID)
    })
    return cancelID
  }

  async getChunkedData(viewTarget, cancelSignal) {
    return await this.workerAPI.getChunkedData(
      viewTarget,
      this.getCancelID(cancelSignal),
    )
  }

  async getFilenames(cancelSignal) {
    return await this.workerAPI.getFilenames(this.getCancelID(cancelSignal))
  }

  subscribeToFilenameChanges(handler, cancelSignal) {
    const eventHandler = () => {
      if (!cancelSignal.aborted) handler()
    }
    const unsubscribe = () => {
      this.nameChangeEvents.removeEventListener('change', eventHandler)
      cancelSignal.removeEventListener('abort', unsubscribe)
    }
    this.nameChangeEvents.addEventListener('change', eventHandler)
    cancelSignal.addEventListener('abort', unsubscribe)
    return {}
  }

  async putFile(fileType, file, cancelSignal) {
    return await this.workerAPI.putFile(
      fileType,
      file,
      this.getCancelID(cancelSignal),
    )
  }

  async getBedRegions(bedFile, cancelSignal) {
    return await this.workerAPI.getBedRegions(
      bedFile,
      this.getCancelID(cancelSignal),
    )
  }

  async getPathNames(graphFile, cancelSignal) {
    return await this.workerAPI.getPathNames(
      graphFile,
      this.getCancelID(cancelSignal),
    )
  }

  async getPathInfo(graphFile, cancelSignal) {
    return await this.workerAPI.getPathInfo(
      graphFile,
      this.getCancelID(cancelSignal),
    )
  }

  async getChunkTracks(bedFile, chunk, cancelSignal) {
    return await this.workerAPI.getChunkTracks(
      bedFile,
      chunk,
      this.getCancelID(cancelSignal),
    )
  }
}

export default LocalAPI
