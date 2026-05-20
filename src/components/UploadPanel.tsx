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
  onUploaded: (tracks: Track[]) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
}

const GRAPH_EXTS = ['.xg', '.vg', '.hg', '.pg', '.db']
const READ_EXTS = ['.gam']
const HAPLOTYPE_EXTS = ['.gbwt']
const ACCEPT = [...GRAPH_EXTS, ...READ_EXTS, ...HAPLOTYPE_EXTS, '.gbz'].join(',')

function detectType(name: string): FileType | null {
  const lower = name.toLowerCase()
  if (GRAPH_EXTS.some(e => lower.endsWith(e))) {
    return 'graph'
  }
  if (READ_EXTS.some(e => lower.endsWith(e))) {
    return 'read'
  }
  if (HAPLOTYPE_EXTS.some(e => lower.endsWith(e))) {
    return 'haplotype'
  }
  if (lower.endsWith('.gbz')) {
    return 'graph'
  }
  return null
}

export const UploadPanel = ({
  onUploaded,
  handleFileUpload,
}: UploadPanelProps) => {
  const [files, setFiles] = useState<StagedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | File[]) => {
    const next = Array.from(list).map(file => ({
      file,
      type: detectType(file.name),
    }))
    setFiles(prev => [...prev, ...next])
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
        if (uploadedName !== undefined) {
          tracks.push({
            trackFile: uploadedName,
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
      <div
        onDrop={e => {
          onDrop(e)
        }}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => {
          setDragging(false)
        }}
        onClick={() => {
          inputRef.current?.click()
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
        <div style={{ fontWeight: 500 }}>
          Drop files here or click to choose
        </div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Accepted: {ACCEPT}</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        accept={ACCEPT}
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
              <span style={{ flex: 1, wordBreak: 'break-all' }}>
                {f.file.name}
              </span>
              <select
                value={f.type ?? ''}
                onChange={e => {
                  changeType(i, e.target.value as FileType)
                }}
                style={{ fontSize: 12 }}
              >
                <option value="" disabled>
                  (skip)
                </option>
                <option value="graph">graph</option>
                <option value="read">read</option>
                <option value="haplotype">haplotype</option>
              </select>
              <Button
                size="sm"
                color="link"
                onClick={() => {
                  removeFile(i)
                }}
              >
                remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <div style={{ color: '#c00', marginBottom: 8 }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          color="primary"
          size="sm"
          onClick={() => {
            void upload()
          }}
          disabled={
            files.length === 0 ||
            uploading ||
            files.every(f => f.type === null)
          }
        >
          {uploading ? 'Uploading…' : 'Upload & use'}
        </Button>
      </div>
    </div>
  )
}

export default UploadPanel
