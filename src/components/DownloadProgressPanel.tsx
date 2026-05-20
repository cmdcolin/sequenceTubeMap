import { useSyncExternalStore } from 'react'
import {
  getDownloadProgressSnapshot,
  subscribeDownloadProgress,
} from '../api/downloadProgress.ts'
import type { DownloadProgress } from '../api/downloadProgress.ts'

function fileLabel(url: string): string {
  const last = url.split('/').pop()
  return last && last.length > 0 ? last : url
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)
}

function Row({ item }: { item: DownloadProgress }) {
  const pct =
    item.total !== null && item.total > 0
      ? Math.min(100, (item.received / item.total) * 100)
      : null
  const sizeText =
    item.total !== null
      ? `${formatMB(item.received)} / ${formatMB(item.total)} MB`
      : `${formatMB(item.received)} MB`
  return (
    <div style={{ marginTop: 8, minWidth: 280 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: 13,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Downloading <code>{fileLabel(item.url)}</code>
        </span>
        <span>{sizeText}</span>
      </div>
      {pct !== null && (
        <div
          style={{
            marginTop: 4,
            height: 4,
            background: '#eee',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: '#1976d2',
              transition: 'width 120ms linear',
            }}
          />
        </div>
      )}
    </div>
  )
}

// Listens to in-flight downloads published by `GBZBaseAPI.resolveTrackFile`
// and shows one row per active fetch alongside the loader spinner. Renders
// nothing when no downloads are active — small / instant fetches won't blink.
function DownloadProgressPanel() {
  const items = useSyncExternalStore(
    subscribeDownloadProgress,
    getDownloadProgressSnapshot,
  )
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 12 }}>
      {items.map(item => (
        <Row key={item.url} item={item} />
      ))}
    </div>
  )
}

export default DownloadProgressPanel
