import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import Button from '@mui/material/Button'
import { config } from '../config-global.mjs'
import { defaultTrackColors } from '../common.ts'
import type { FileType, Track } from '../Types.ts'
import {
  GRAPH_EXTS,
  INDEX_EXTS,
  LOCAL_ACCEPT,
  READ_EXTS,
  SERVER_ACCEPT,
  detectType,
  isIndexSibling,
  isLocallyAccepted,
} from './uploadFileTypes.ts'
import { UploadModeToggle } from './UploadModeToggle.tsx'
import { StagedFileList, type StagedFile } from './StagedFileList.tsx'

interface UploadPanelProps {
  // Tracks have `trackDisplayName` set to the original filename, since the
  // `trackFile` field for LocalAPI uploads is an opaque numeric registry id.
  onUploaded: (tracks: Track[]) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
  apiMode?: 'local' | 'server' | 'upstream'
  // The non-local API mode to switch to when the user toggles "Server upload".
  // 'server' if a self-hosted backend is configured, else 'upstream' (vgteam).
  serverModeId?: 'server' | 'upstream'
  // Called when the user switches the upload destination within the panel.
  // Allows the parent to switch the global API mode so uploads use the right backend.
  onDestChange?: (mode: string) => void
}

function stageFile(file: File): StagedFile {
  return {
    file,
    type: detectType(file.name),
    isIndex: isIndexSibling(file.name),
  }
}

export const UploadPanel = ({
  onUploaded,
  handleFileUpload,
  apiMode = 'local',
  serverModeId = 'upstream',
  onDestChange,
}: UploadPanelProps) => {
  const [files, setFiles] = useState<StagedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLocal = apiMode === 'local'

  // Clear staged files when the user flips the local/server toggle, since
  // the accepted file set differs. Adjust state during render rather than in
  // an effect — see https://react.dev/learn/you-might-not-need-an-effect.
  const [lastApiMode, setLastApiMode] = useState(apiMode)
  if (apiMode !== lastApiMode) {
    setLastApiMode(apiMode)
    setFiles([])
    setError(null)
  }

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list)
    const extOk = isLocal ? arr.filter(f => isLocallyAccepted(f.name)) : arr
    // Server-mode uploads have a size limit (5 MB by default); local mode
    // streams the blob in-browser, so no cap.
    const accepted = isLocal
      ? extOk
      : extOk.filter(f => f.size <= config.MAXUPLOADSIZE)
    const reasons: string[] = []
    const extRejected = arr.length - extOk.length
    if (extRejected > 0) {
      reasons.push(`${extRejected} skipped — browser mode only accepts .gbz.db / .gam / .gai`)
    }
    const sizeRejected = extOk.length - accepted.length
    if (sizeRejected > 0) {
      const mb = (config.MAXUPLOADSIZE / (1024 * 1024)).toFixed(0)
      reasons.push(`${sizeRejected} skipped — file exceeds ${mb} MB server limit`)
    }
    setError(reasons.length > 0 ? reasons.join('; ') : null)
    setFiles(prev => [...prev, ...accepted.map(stageFile)])
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
      for (const { file, type, isIndex } of files) {
        if (!type) {
          continue
        }
        // In server/upstream mode the server creates the .gai itself via vg
        // gamsort — uploading the index separately would cause a
        // "not a GAF or GAM" error.
        if (!isLocal && isIndex) {
          continue
        }
        const uploadedName = await handleFileUpload(type, file)
        if (uploadedName !== undefined && !isIndex) {
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

  return (
    <div data-testid="UploadPanel">
      {onDestChange ? (
        <UploadModeToggle
          apiMode={apiMode}
          serverModeId={serverModeId}
          onDestChange={onDestChange}
        />
      ) : null}

      <div
        onDrop={e => { onDrop(e) }}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => { setDragging(false) }}
        onClick={() => { inputRef.current?.click() }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
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
            : `Graph: ${GRAPH_EXTS.join(' ')}   •   Reads: ${READ_EXTS.join(' ')}   •   Index: ${INDEX_EXTS.join(' ')} (ignored)`}
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

      <StagedFileList
        files={files}
        isLocal={isLocal}
        onChangeType={changeType}
        onRemove={removeFile}
      />

      {error ? (
        <div style={{ color: '#c00', marginBottom: 8 }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Button
          variant="contained"
          size="small"
          onClick={() => { void upload() }}
          disabled={
            files.length === 0 ||
            uploading ||
            files.every(f => f.type === null || (!isLocal && f.isIndex))
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
