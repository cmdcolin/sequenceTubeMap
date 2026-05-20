// Module-level pubsub for in-flight download progress.
//
// GBZBaseAPI.resolveTrackFile reads URL-backed track files chunk-by-chunk and
// calls `report` with bytes-received / total. The TubeMapContainer loader
// subscribes via useSyncExternalStore and renders a "downloading … X / Y MB"
// line next to the spinner so users aren't staring at a silent UI while a
// 128 MB chr20.gbz.db downloads.
//
// Keyed by URL so concurrent fetches (graph + GAM siblings) don't clobber
// each other. The UI displays whichever entries are currently active.

export interface DownloadProgress {
  url: string
  received: number
  // null when the server omits Content-Length (rare on object stores).
  total: number | null
}

let snapshot: DownloadProgress[] = []
const subscribers = new Set<() => void>()
// Live records keyed by URL — turned into the immutable snapshot on every
// change so useSyncExternalStore sees a fresh array reference.
const inflight = new Map<string, DownloadProgress>()

function emit(): void {
  snapshot = Array.from(inflight.values())
  for (const cb of subscribers) cb()
}

export function getDownloadProgressSnapshot(): DownloadProgress[] {
  return snapshot
}

export function subscribeDownloadProgress(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

export function report(url: string, received: number, total: number | null): void {
  inflight.set(url, { url, received, total })
  emit()
}

export function clearProgress(url: string): void {
  inflight.delete(url)
  emit()
}
