import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Button } from 'reactstrap'
import { defaultTrackColors } from '../common.ts'
import type { FileType, Track } from '../Types.ts'

interface StagedFile {
  file: File
  type: FileType | null
}

interface UploadPanelProps {
  // Tracks have `trackDisplayName` set to the original filename, since the
  // `trackFile` field for LocalAPI uploads is an opaque numeric registry id.
  onUploaded: (tracks: Track[]) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
  apiMode?: 'local' | 'server' | 'upstream'
  // Called when the user switches the upload destination within the panel.
  // Allows the parent to switch the global API mode so uploads use the right backend.
  onDestChange?: (mode: string) => void
}

const GRAPH_EXTS = ['.xg', '.vg', '.hg', '.pg', '.gbz', '.gbz.db', '.db']
const READ_EXTS = ['.gam', '.gaf', '.gaf.gz']
const HAPLOTYPE_EXTS = ['.gbwt']
// .gai is the sibling index for a sorted .gam — accepted so the picker
// doesn't reject a user dragging both files at once. detectType marks it as
// "skip" because the .gam itself is what gets registered as a read track.
const INDEX_EXTS = ['.gai', '.tbi']
// Local/WASM mode only supports .gbz.db/.db graphs and .gam reads (+.gai index).
// Server mode accepts all legacy vg formats.
const LOCAL_EXTS = ['.gbz.db', '.db', '.gam', '.gai']
const LOCAL_ACCEPT = LOCAL_EXTS.join(',')
const SERVER_ACCEPT = [
  ...GRAPH_EXTS,
  ...READ_EXTS,
  ...HAPLOTYPE_EXTS,
  ...INDEX_EXTS,
].join(',')

function isIndexSibling(name: string): boolean {
  const lower = name.toLowerCase()
  return INDEX_EXTS.some(e => lower.endsWith(e))
}

function detectType(name: string): FileType | null {
  const lower = name.toLowerCase()
  if (INDEX_EXTS.some(e => lower.endsWith(e))) {
    return 'read'
  }
  if (GRAPH_EXTS.some(e => lower.endsWith(e))) {
    return 'graph'
  }
  if (READ_EXTS.some(e => lower.endsWith(e))) {
    return 'read'
  }
  if (HAPLOTYPE_EXTS.some(e => lower.endsWith(e))) {
    return 'haplotype'
  }
  return null
}

export const UploadPanel = ({
  onUploaded,
  handleFileUpload,
  apiMode = 'local',
  onDestChange,
}: UploadPanelProps) => {
  const [files, setFiles] = useState<StagedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list)
    const accepted = apiMode === 'local'
      ? arr.filter(f => LOCAL_EXTS.some(e => f.name.toLowerCase().endsWith(e)))
      : arr
    const rejected = arr.length - accepted.length
    if (rejected > 0) {
      setError(
        `${rejected} file(s) skipped — browser mode only accepts .gbz.db / .gam / .gai`,
      )
    }
    setFiles(prev => [
      ...prev,
      ...accepted.map(file => ({ file, type: detectType(file.name) })),
    ])
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const changeType = (idx: number, type: FileType) => {
    setFiles(prev => prev.map((f, i) => (i === idx ? { ...f, type } : f)))
  }

  const upload = async () => {
    if (files.length === 0) {
      return
    }
    setUploading(true)
    setError(null)
    try {
      const tracks: Track[] = []
      for (const { file, type } of files) {
        if (!type) {
          continue
        }
        const uploadedName = await handleFileUpload(type, file)
        if (uploadedName !== undefined && !isIndexSibling(file.name)) {
          tracks.push({
            trackFile: uploadedName,
            trackDisplayName: file.name,
            trackType: type,
            trackColorSettings: defaultTrackColors(type),
          })
        }
      }
      if (tracks.length === 0) {
        setError('No files could be uploaded. Check file types.')
        setUploading(false)
        return
      }
      onUploaded(tracks)
      setFiles([])
      setUploading(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const isLocal = apiMode === 'local'
  const isServer = apiMode === 'server'

  return (
    <div data-testid="UploadPanel">
      {/* Mode-specific description — one compact line at the top */}
      <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
        {isLocal ? (
          <>
            <strong>In-browser (WASM)</strong> — files stay on your machine.{' '}
            Accepts <code>.gbz.db</code> graphs and <code>.gam</code> reads.{' '}
            <a
              href="https://github.com/cmdcolin/sequenceTubeMap/blob/master/doc/data.md"
              target="_blank"
              rel="noreferrer"
            >
              How to prepare →
            </a>
          </>
        ) : isServer ? (
          <>
            <strong>Self-hosted server</strong> — drop any vg-supported graph or read file.
          </>
        ) : (
          <>
            <strong>Upload to <code>api.tubemap.graphs.vg</code></strong> (vgteam
            public server). Drop your <code>.xg</code>, <code>.vg</code>, or{' '}
            <code>.gbz</code> graph and <code>.gam</code> / <code>.gaf</code> reads.
            5 MB limit — files deleted after 24 h.
          </>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={e => { onDrop(e) }}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => { setDragging(false) }}
        onClick={() => { inputRef.current?.click() }}
        role="button"
        tabIndex={0}
        style={{
          border: `2px dashed ${dragging ? '#4a90e2' : '#aaa'}`,
          background: dragging ? '#eef5ff' : '#fafafa',
          borderRadius: 6,
          padding: 16,
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 8,
          color: '#555',
        }}
      >
        <div style={{ fontWeight: 500 }}>Drop files here or click to choose</div>
        <div style={{ fontSize: 11, marginTop: 4, color: '#888' }}>
          {isLocal
            ? 'Graph: .gbz.db   •   Reads: .sorted.gam + .sorted.gam.gai'
            : isServer
              ? `Graph: ${GRAPH_EXTS.join(' ')}   •   Reads: ${READ_EXTS.join(' ')}`
              : 'Graph: .xg .vg .gbz   •   Reads: .gam .gaf'}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        accept={isLocal ? LOCAL_ACCEPT : SERVER_ACCEPT}
        onChange={e => {
          if (e.target.files) {
            addFiles(e.target.files)
          }
          e.target.value = ''
        }}
      />

      {files.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            marginBottom: 8,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {files.map((f, i) => (
            <li
              key={`${f.file.name}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{f.file.name}</span>
              <select
                value={f.type ?? ''}
                onChange={e => { changeType(i, e.target.value as FileType) }}
                style={{ fontSize: 12 }}
              >
                <option value="" disabled>(skip)</option>
                <option value="graph">graph</option>
                <option value="read">read</option>
                <option value="haplotype">haplotype</option>
              </select>
              <Button size="sm" color="link" onClick={() => { removeFile(i) }}>
                remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <div style={{ color: '#c00', marginBottom: 8 }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Secondary mode switch link — only shown when toggle is meaningful */}
        {!isServer && onDestChange ? (
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 11,
              color: '#888',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={() => { onDestChange(isLocal ? 'upstream' : 'local') }}
          >
            {isLocal ? 'Switch to vgteam server →' : 'Switch to in-browser (WASM) →'}
          </button>
        ) : <span />}

        <Button
          color="primary"
          size="sm"
          onClick={() => { void upload() }}
          disabled={
            files.length === 0 ||
            uploading ||
            files.every(f => f.type === null)
          }
        >
          {uploading
            ? (isLocal ? 'Loading…' : 'Uploading…')
            : (isLocal ? 'Load files' : 'Upload & use')}
        </Button>
      </div>
    </div>
  )
}

export default UploadPanel
