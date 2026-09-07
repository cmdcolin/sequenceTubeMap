import { fetchAndParse } from '../fetchAndParse.ts'
import type { APIInterface, ChunkedDataResponse, FilenameSubscription } from './APIInterface.ts'
import type { FileType, FilenamesResponse, PathInfo, RegionInfo, Track, ViewTarget } from '../Types.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const RECONNECT_DELAY_MS = 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(body: unknown, key: string): string | undefined {
  if (isRecord(body) && typeof body[key] === 'string') {
    return body[key]
  }
  return undefined
}

/**
 * API implementation that uses vg running on the server to manipulate files.
 */
export class ServerAPI implements APIInterface {
  readonly mode: 'server' | 'upstream'

  constructor(
    private readonly apiUrl: string,
    mode: 'server' | 'upstream' = 'server',
  ) {
    this.mode = mode
  }

  private async request<T>(
    path: string,
    cancelSignal: AbortSignal | null,
    init: RequestInit,
  ): Promise<T> {
    return await fetchAndParse<T>(`${this.apiUrl}/${path}`, {
      signal: cancelSignal,
      headers: JSON_HEADERS,
      ...init,
    })
  }

  private async postJSON<T>(
    path: string,
    body: unknown,
    cancelSignal: AbortSignal | null,
  ): Promise<T> {
    return await this.request<T>(path, cancelSignal, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async getChunkedData(viewTarget: ViewTarget, cancelSignal: AbortSignal | null): Promise<ChunkedDataResponse> {
    return await this.postJSON<ChunkedDataResponse>('getChunkedData', viewTarget, cancelSignal)
  }

  async getFilenames(cancelSignal: AbortSignal | null): Promise<FilenamesResponse> {
    return await this.request<FilenamesResponse>('getFilenames', cancelSignal, {
      method: 'GET',
    })
  }

  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): FilenameSubscription {
    let current: WebSocket | null = null

    const connect = () => {
      const ws = new WebSocket(this.apiUrl.replace(/^http/, 'ws'))
      current = ws
      // A socket reports failure as onerror followed by onclose, and both
      // want the same response, so only the first one through gets to act.
      let handled = false

      const detach = () => {
        handled = true
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        cancelSignal.removeEventListener('abort', abort)
      }
      const abort = () => {
        detach()
        ws.close()
      }
      // An error used to run the same teardown as an abort, which cleared
      // onclose and so lost the reconnect the server restarting depends on.
      const reconnect = () => {
        if (!handled) {
          detach()
          ws.close()
          if (!cancelSignal.aborted) {
            setTimeout(connect, RECONNECT_DELAY_MS)
          }
        }
      }

      ws.onmessage = () => {
        if (cancelSignal.aborted) {
          abort()
        } else {
          handler()
        }
      }
      ws.onclose = () => {
        reconnect()
      }
      ws.onerror = () => {
        reconnect()
      }

      cancelSignal.addEventListener('abort', abort)
    }

    connect()

    return () => {
      current?.close()
    }
  }

  putFile(
    fileType: FileType,
    file: File,
    cancelSignal: AbortSignal | null,
  ): Promise<string> {
    const formData = new FormData()
    // jsdom (test env) and the browser disagree about Blob types: only jsdom's
    // Blob will be uploaded as a file, Node's becomes a string. We check after
    // appending and bail if stringification occurred.
    // Per https://stackoverflow.com/a/43914175 the third filename arg is
    // required for jsdom's type checking.
    const fileName = file.name || 'upload.dat'
    formData.append('trackFile', file, fileName)
    if (typeof formData.get('trackFile') === 'string') {
      console.error(
        'Cannot upload file because it is not the appropriate type:',
        file,
      )
      throw new Error('File is not an appropriate type to upload')
    }
    formData.append('fileType', fileType)

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.responseType = 'json'
      xhr.onreadystatechange = () => {
        if (cancelSignal?.aborted && xhr.readyState !== 0) {
          xhr.abort()
          reject(new Error('Upload aborted'))
          return
        }

        if (xhr.readyState === 4) {
          // With responseType 'json', a body that isn't JSON — an HTML error
          // page from a proxy, or nothing at all — leaves `response` null,
          // which used to make this reject with "undefined".
          const path = stringField(xhr.response, 'path')
          const error = stringField(xhr.response, 'error')
          if (xhr.status === 200 && path !== undefined) {
            resolve(path)
          } else if (error !== undefined) {
            reject(new Error(error))
          } else {
            reject(
              new Error(
                `Failed to upload file: HTTP ${xhr.status} ${xhr.statusText}`,
              ),
            )
          }
        }
      }

      xhr.open('POST', `${this.apiUrl}/trackFileSubmission`, true)
      xhr.send(formData)
    })
  }

  async getBedRegions(bedFile: string, cancelSignal: AbortSignal | null): Promise<{ bedRegions?: RegionInfo }> {
    return await this.postJSON<{ bedRegions?: RegionInfo }>('getBedRegions', { bedFile }, cancelSignal)
  }

  async getPathNames(graphFile: string, cancelSignal: AbortSignal | null): Promise<{ pathNames: string[] }> {
    return await this.postJSON<{ pathNames: string[] }>('getPathNames', { graphFile }, cancelSignal)
  }

  async getPathInfo(graphFile: string, cancelSignal: AbortSignal | null): Promise<{ pathInfo: PathInfo[] }> {
    return await this.postJSON<{ pathInfo: PathInfo[] }>('getPathInfo', { graphFile }, cancelSignal)
  }

  async getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ tracks?: Track[] }> {
    return await this.postJSON<{ tracks?: Track[] }>('getChunkTracks', { bedFile, chunk }, cancelSignal)
  }
}

export default ServerAPI
