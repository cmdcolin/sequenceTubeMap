import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerAPI } from './ServerAPI.ts'

type Handler = (() => void) | null

// setupTests stubs WebSocket with a version that discards its handlers, so the
// reconnect behaviour needs a stub that actually keeps them.
class FakeWebSocket {
  static opened: FakeWebSocket[] = []
  onmessage: Handler = null
  onclose: Handler = null
  onerror: Handler = null
  closed = false

  constructor(readonly url: string) {
    FakeWebSocket.opened.push(this)
  }

  close() {
    this.closed = true
  }
}

const realWebSocket = globalThis.WebSocket
const realXhr = globalThis.XMLHttpRequest

function latestSocket() {
  const socket = FakeWebSocket.opened.at(-1)
  if (!socket) {
    throw new Error('no socket was opened')
  }
  return socket
}

describe('ServerAPI.subscribeToFilenameChanges', () => {
  beforeEach(() => {
    FakeWebSocket.opened = []
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.stubGlobal('WebSocket', realWebSocket)
  })

  it('connects to the api url over ws', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    api.subscribeToFilenameChanges(() => {}, new AbortController().signal)
    expect(latestSocket().url).toBe('ws://example.test/api/v0')
  })

  it('calls the handler on every message', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const handler = vi.fn()
    api.subscribeToFilenameChanges(handler, new AbortController().signal)
    latestSocket().onmessage?.()
    latestSocket().onmessage?.()
    expect(handler).toHaveBeenCalledTimes(2)
  })

  // Regression: onerror used to run the abort teardown, which nulled onclose,
  // so the socket never came back after a server restart.
  it('reconnects after an error', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    api.subscribeToFilenameChanges(() => {}, new AbortController().signal)
    const first = latestSocket()
    first.onerror?.()
    expect(first.closed).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.opened).toHaveLength(2)
  })

  it('reconnects after a close', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    api.subscribeToFilenameChanges(() => {}, new AbortController().signal)
    latestSocket().onclose?.()
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.opened).toHaveLength(2)
  })

  it('reconnects once when an error is followed by a close', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    api.subscribeToFilenameChanges(() => {}, new AbortController().signal)
    const first = latestSocket()
    first.onerror?.()
    first.onclose?.()
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.opened).toHaveLength(2)
  })

  it('keeps delivering messages through a reconnect', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const handler = vi.fn()
    api.subscribeToFilenameChanges(handler, new AbortController().signal)
    latestSocket().onerror?.()
    vi.advanceTimersByTime(1000)
    latestSocket().onmessage?.()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stops reconnecting once the signal is aborted', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const controller = new AbortController()
    api.subscribeToFilenameChanges(() => {}, controller.signal)
    const first = latestSocket()
    controller.abort()
    expect(first.closed).toBe(true)
    first.onclose?.()
    vi.advanceTimersByTime(5000)
    expect(FakeWebSocket.opened).toHaveLength(1)
  })

  it('ignores a message that arrives after the signal aborted', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const controller = new AbortController()
    const handler = vi.fn()
    api.subscribeToFilenameChanges(handler, controller.signal)
    const socket = latestSocket()
    controller.abort()
    socket.onmessage?.()
    expect(handler).not.toHaveBeenCalled()
  })

  it('closes the socket when the returned unsubscribe is called', () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const unsubscribe = api.subscribeToFilenameChanges(
      () => {},
      new AbortController().signal,
    )
    unsubscribe()
    expect(latestSocket().closed).toBe(true)
  })
})

class FakeXhr {
  static latest: FakeXhr | null = null
  responseType = ''
  response: unknown = null
  status = 0
  statusText = ''
  readyState = 0
  aborted = false
  onreadystatechange: Handler = null

  open() {}

  send() {
    FakeXhr.latest = this
  }

  abort() {
    this.aborted = true
  }

  respond(status: number, statusText: string, response: unknown) {
    this.status = status
    this.statusText = statusText
    this.response = response
    this.readyState = 4
    this.onreadystatechange?.()
  }
}

function upload(api: ServerAPI, cancelSignal: AbortSignal | null) {
  const file = new window.File(['data'], 'reads.gam', {
    type: 'application/octet-stream',
  })
  return api.putFile('read', file, cancelSignal)
}

describe('ServerAPI.putFile', () => {
  beforeEach(() => {
    FakeXhr.latest = null
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })

  afterEach(() => {
    vi.stubGlobal('XMLHttpRequest', realXhr)
  })

  it('resolves with the path the server assigned', async () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const pending = upload(api, null)
    FakeXhr.latest?.respond(200, 'OK', { path: 'uploads/abc/reads.gam' })
    await expect(pending).resolves.toBe('uploads/abc/reads.gam')
  })

  it('rejects with the error the server reported', async () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const pending = upload(api, null)
    FakeXhr.latest?.respond(400, 'Bad Request', { error: 'File too large' })
    await expect(pending).rejects.toThrow('File too large')
  })

  // With responseType 'json' a non-JSON body leaves response null, which used
  // to be stringified into the message as "undefined".
  it('rejects with the status when the body is not JSON', async () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const pending = upload(api, null)
    FakeXhr.latest?.respond(502, 'Bad Gateway', null)
    await expect(pending).rejects.toThrow(
      'Failed to upload file: HTTP 502 Bad Gateway',
    )
  })

  it('rejects when a 200 comes back without a path', async () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const pending = upload(api, null)
    FakeXhr.latest?.respond(200, 'OK', {})
    await expect(pending).rejects.toThrow('Failed to upload file: HTTP 200 OK')
  })

  it('aborts the request when the signal is aborted', async () => {
    const api = new ServerAPI('http://example.test/api/v0')
    const controller = new AbortController()
    const pending = upload(api, controller.signal)
    controller.abort()
    FakeXhr.latest?.respond(200, 'OK', { path: 'uploads/abc/reads.gam' })
    await expect(pending).rejects.toThrow('Upload aborted')
    expect(FakeXhr.latest?.aborted).toBe(true)
  })
})
