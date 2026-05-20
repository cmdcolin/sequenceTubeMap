import { fetchAndParse } from '../fetchAndParse.ts'
import type { APIInterface, FilenameSubscription } from './APIInterface.ts'
import type { FileType, ViewTarget } from '../Types.ts'

interface WebSocketSubscription {
  ws?: WebSocket
  disconnect?: () => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * API implementation that uses vg running on the server to manipulate files.
 */
export class ServerAPI implements APIInterface {
  readonly mode = 'server' as const

  constructor(private readonly apiUrl: string) {}

  private async postJSON(
    path: string,
    body: unknown,
    cancelSignal: AbortSignal | null,
  ) {
    return await fetchAndParse(`${this.apiUrl}/${path}`, {
      signal: cancelSignal,
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
  }

  async getChunkedData(viewTarget: ViewTarget, cancelSignal: AbortSignal | null) {
    return await this.postJSON('getChunkedData', viewTarget, cancelSignal)
  }

  async getFilenames(cancelSignal: AbortSignal | null) {
    return await fetchAndParse(`${this.apiUrl}/getFilenames`, {
      signal: cancelSignal,
      method: 'GET',
      headers: JSON_HEADERS,
    })
  }

  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): FilenameSubscription {
    const subscription: WebSocketSubscription = {}

    const connect = () => {
      const ws = new WebSocket(this.apiUrl.replace(/^http/, 'ws'))
      subscription.ws = ws

      subscription.disconnect = () => {
        ws.close()
        cancelSignal.removeEventListener('abort', subscription.disconnect!)
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
      }

      ws.onmessage = () => {
        if (cancelSignal.aborted) {
          subscription.disconnect!()
        } else {
          handler()
        }
      }
      ws.onclose = () => {
        if (!cancelSignal.aborted) {
          setTimeout(connect, 1000)
        }
      }
      ws.onerror = () => {
        subscription.disconnect!()
      }

      cancelSignal.addEventListener('abort', subscription.disconnect)
    }

    connect()

    // Caller should hold the subscription for as long as updates are wanted.
    return subscription
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
          const response = xhr.response as { path?: string; error?: string }
          if (xhr.status === 200 && response.path) {
            resolve(response.path)
          } else if (response.error) {
            reject(new Error(response.error))
          } else {
            reject(
              new Error(
                `Failed to upload file: status ${xhr.status} and response: ${JSON.stringify(xhr.response)}`,
              ),
            )
          }
        }
      }

      xhr.open('POST', `${this.apiUrl}/trackFileSubmission`, true)
      xhr.send(formData)
    })
  }

  async getBedRegions(bedFile: string, cancelSignal: AbortSignal | null) {
    return await this.postJSON('getBedRegions', { bedFile }, cancelSignal)
  }

  async getPathNames(graphFile: string, cancelSignal: AbortSignal | null) {
    return await this.postJSON('getPathNames', { graphFile }, cancelSignal)
  }

  async getPathInfo(graphFile: string, cancelSignal: AbortSignal | null) {
    return await this.postJSON('getPathInfo', { graphFile }, cancelSignal)
  }

  async getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ) {
    return await this.postJSON('getChunkTracks', { bedFile, chunk }, cancelSignal)
  }
}

export default ServerAPI
