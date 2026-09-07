import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAndParse } from './fetchAndParse.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function respondWith(body: string, init?: ResponseInit) {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, init))
}

describe('fetchAndParse', () => {
  it('returns the parsed body of a successful response', async () => {
    respondWith('{"pathNames":["x"]}', { status: 200 })
    await expect(fetchAndParse('/getPathNames')).resolves.toEqual({
      pathNames: ['x'],
    })
  })

  it('throws the error field even on a 200', async () => {
    respondWith('{"error":"vg chunk failed"}', { status: 200 })
    await expect(fetchAndParse('/getChunkedData')).rejects.toThrow(
      'vg chunk failed',
    )
  })

  // A proxy or a crashed server answers with HTML, which response.json() used
  // to reject on before the status was ever looked at.
  it('reports the status and body when an error response is not JSON', async () => {
    respondWith('<html>Bad Gateway</html>', {
      status: 502,
      statusText: 'Bad Gateway',
    })
    await expect(fetchAndParse('/getFilenames')).rejects.toThrow(
      'Server responded with error code 502: <html>Bad Gateway</html>',
    )
  })

  it('prefers the server error field over the raw body for an error status', async () => {
    respondWith('{"error":"Region not found"}', { status: 400 })
    await expect(fetchAndParse('/getChunkedData')).rejects.toThrow(
      'Server responded with error code 400: Region not found',
    )
  })

  it('reports a successful response that is not JSON', async () => {
    respondWith('not json at all', { status: 200 })
    await expect(fetchAndParse('/getFilenames')).rejects.toThrow(
      'Server response was not JSON: not json at all',
    )
  })

  it('passes its arguments straight through to fetch', async () => {
    respondWith('{}', { status: 200 })
    const init = { method: 'POST', body: '{"a":1}' }
    await fetchAndParse('/getBedRegions', init)
    expect(globalThis.fetch).toHaveBeenCalledWith('/getBedRegions', init)
  })
})
