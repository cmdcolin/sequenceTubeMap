// Pubsub for in-flight download progress, plus the shape used to ferry
// updates out of the LocalAPI Web Worker.
//
// GBZBaseAPI.resolveTrackFile reads URL-backed track files chunk-by-chunk and
// hands each update to its progress listener. That listener is
// `applyProgress` when GBZBaseAPI runs on the main thread, and a
// Comlink-proxied callback into `applyProgress` when it runs in the worker —
// which is the only reason DownloadProgressPanel sees anything at all, since
// the worker has its own copy of this module's state.
//
// Keyed by URL so concurrent fetches (graph + GAM siblings) don't clobber
// each other. The UI displays whichever entries are currently active.

export interface DownloadProgress {
  url: string
  received: number
  // null when the server omits Content-Length (rare on object stores).
  total: number | null
}

export interface ProgressUpdate extends DownloadProgress {
  // Set when the download finished (or failed) and the row should disappear.
  done: boolean
}

// Returns unknown rather than void because a Comlink proxy hands back a
// promise the reporter deliberately doesn't wait for.
export type ProgressListener = (update: ProgressUpdate) => unknown

let snapshot: DownloadProgress[] = []
const subscribers = new Set<() => void>()
// Live records keyed by URL — turned into the immutable snapshot on every
// change so useSyncExternalStore sees a fresh array reference.
const inflight = new Map<string, DownloadProgress>()

export function getDownloadProgressSnapshot(): DownloadProgress[] {
  return snapshot
}

export function subscribeDownloadProgress(cb: () => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

export function applyProgress({ url, received, total, done }: ProgressUpdate) {
  if (done) {
    inflight.delete(url)
  } else {
    inflight.set(url, { url, received, total })
  }
  snapshot = Array.from(inflight.values())
  for (const cb of subscribers) {
    cb()
  }
}
