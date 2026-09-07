import { describe, it, expect, vi, afterEach } from 'vitest'
import { GBZBaseAPI } from './GBZBaseAPI.ts'
import {
  subscribeDownloadProgress,
  getDownloadProgressSnapshot,
} from './downloadProgress.ts'
import type { ProgressUpdate } from './downloadProgress.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

// Stubs fetch with a streaming body of N chunks. The chunked stream is what
// lets `resolveTrackFile` publish progress mid-download — a one-shot Response
// would only fire once at start and once at finish.
function fakeStreamingResponse(chunks: Uint8Array[]): Response {
  const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-length': String(totalBytes) },
  })
}

const CHUNKS = [
  new Uint8Array([1, 2, 3, 4]),
  new Uint8Array([5, 6, 7, 8]),
  new Uint8Array([9, 10, 11, 12]),
]

// resolveTrackFile is private, but it is the whole subject of these tests.
function trackFileReader(api: GBZBaseAPI) {
  const reader: unknown = api
  return reader as {
    resolveTrackFile: (
      trackFile: string,
      cancelSignal: AbortSignal | null,
    ) => Promise<Blob>
  }
}

describe('GBZBaseAPI download progress', () => {
  it('publishes progress while a URL-backed track file is being fetched', async () => {
    const url = 'https://test.example/tiny.gbz.db'
    globalThis.fetch = vi.fn().mockResolvedValue(fakeStreamingResponse(CHUNKS))

    // Capture every subscriber notification so we can confirm progress was
    // reported mid-fetch, not just at completion.
    const seen: { received: number; total: number | null }[] = []
    const unsubscribe = subscribeDownloadProgress(() => {
      const snap = getDownloadProgressSnapshot()
      const ours = snap.find(s => s.url === url)
      if (ours !== undefined) {
        seen.push({ received: ours.received, total: ours.total })
      }
    })

    const blob = await trackFileReader(new GBZBaseAPI()).resolveTrackFile(
      url,
      null,
    )

    unsubscribe()
    expect(blob.size).toBe(12)
    // Initial 0-byte announcement plus one per chunk: total ≥ 4 notifications.
    expect(seen.length).toBeGreaterThanOrEqual(4)
    expect(seen[0]!.received).toBe(0)
    expect(seen[seen.length - 1]!.received).toBe(12)
    // All entries should agree on the Content-Length-derived total.
    expect(seen.every(s => s.total === 12)).toBe(true)
    // After completion the URL drops out of the snapshot so the loader UI
    // doesn't keep showing "done" downloads.
    expect(getDownloadProgressSnapshot().some(s => s.url === url)).toBe(false)
  })

  // In the browser GBZBaseAPI runs in a Web Worker, whose copy of this module
  // nothing on the page is subscribed to. LocalAPI installs a listener that
  // hands each update back across Comlink; this is that seam.
  it('sends progress to an installed listener instead of the module store', async () => {
    const url = 'https://test.example/injected.gbz.db'
    globalThis.fetch = vi.fn().mockResolvedValue(fakeStreamingResponse(CHUNKS))

    const api = new GBZBaseAPI()
    const updates: ProgressUpdate[] = []
    api.setProgressListener(update => updates.push(update))

    await trackFileReader(api).resolveTrackFile(url, null)

    expect(updates.map(u => u.received)).toEqual([0, 4, 8, 12, 12])
    expect(updates.map(u => u.done)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
    expect(updates.every(u => u.url === url && u.total === 12)).toBe(true)
    expect(getDownloadProgressSnapshot().some(s => s.url === url)).toBe(false)
  })

  it('clears progress and forgets the download when the fetch fails', async () => {
    const url = 'https://test.example/missing.gbz.db'
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 404 }))

    const api = new GBZBaseAPI()
    const reader = trackFileReader(api)
    await expect(reader.resolveTrackFile(url, null)).rejects.toThrow(/404/)
    expect(getDownloadProgressSnapshot().some(s => s.url === url)).toBe(false)
    // A rejected promise left in the cache would poison every later attempt.
    await expect(reader.resolveTrackFile(url, null)).rejects.toThrow(/404/)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})
