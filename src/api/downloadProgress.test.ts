import { describe, it, expect, vi, afterEach } from 'vitest'
import { GBZBaseAPI } from './GBZBaseAPI.ts'
import {
  subscribeDownloadProgress,
  getDownloadProgressSnapshot,
} from './downloadProgress.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

// Stubs fetch with a streaming body of N chunks. The chunked stream is what
// lets `resolveTrackFile` publish progress mid-download — a one-shot Response
// would only fire `report` once at start and once at finish.
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

describe('GBZBaseAPI download progress', () => {
  it('publishes progress while a URL-backed track file is being fetched', async () => {
    const url = 'https://test.example/tiny.gbz.db'
    const chunks = [
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([5, 6, 7, 8]),
      new Uint8Array([9, 10, 11, 12]),
    ]
    globalThis.fetch = vi.fn().mockResolvedValue(fakeStreamingResponse(chunks))

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

    const api = new GBZBaseAPI() as unknown as {
      resolveTrackFile: (f: string) => Promise<Blob>
    }
    const blob = await api.resolveTrackFile(url)

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
})
