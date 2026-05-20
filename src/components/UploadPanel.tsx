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
  // True when the active API is the in-browser LocalAPI. Controls the privacy
  // copy ("files stay on your machine") and the LocalAPI-only graph format
  // note.
  isLocal?: boolean
}

const GRAPH_EXTS = ['.xg', '.vg', '.hg', '.pg', '.gbz', '.gbz.db', '.db']
const READ_EXTS = ['.gam', '.gaf', '.gaf.gz']
const HAPLOTYPE_EXTS = ['.gbwt']
// .gai is the sibling index for a sorted .gam — accepted so the picker
// doesn't reject a user dragging both files at once. detectType marks it as
// "skip" because the .gam itself is what gets registered as a read track.
const INDEX_EXTS = ['.gai', '.tbi']
const ACCEPT = [
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
    // Index files ride along with their data file. We classify them as 'read'
    // so they get uploaded through the same path; the backend recognizes the
    // suffix and stores them as a sibling instead of registering them as
    // their own read track.
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
  isLocal,
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
        // Index siblings (.gai, .tbi) are uploaded so the backend can pair
        // them with their data file, but they aren't tracks in their own
        // right.
        if (uploadedName !== undefined && !isIndexSibling(file.name)) {
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
      {isLocal ? (
        <div
          style={{
            fontSize: 12,
            color: '#555',
            background: '#f4f7ff',
            border: '1px solid #d0dbf2',
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          <strong>Files stay on your machine.</strong> Nothing is uploaded — the
          parser and rendering both run in your browser via WebAssembly.
          <br />
          <strong>Graph format:</strong> the in-browser backend reads{' '}
          <code>.gbz.db</code> (a SQLite snapshot of a GBZ pangenome). If you
          have a <code>.xg</code> / <code>.vg</code> / <code>.gbz</code> graph,
          convert it once with vg:{' '}
          <code>vg gbwt -G in.xg --gbz-format -g out.gbz</code> then{' '}
          <code>vg gbz2db --gbz out.gbz --db out.gbz.db</code> (or run the
          equivalent <code>gbz2db</code> WASM bundled with this app).
          <br />
          <strong>Reads:</strong> <code>.gam</code> works out of the box; drop a{' '}
          <code>.sorted.gam</code> + matching <code>.sorted.gam.gai</code>{' '}
          together to enable indexed region queries.
        </div>
      ) : null}
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
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
          <div>
            <strong>Graph:</strong> {GRAPH_EXTS.join(', ')}
          </div>
          <div>
            <strong>Reads:</strong> {READ_EXTS.join(', ')}
          </div>
          <div>
            <strong>Haplotype:</strong> {HAPLOTYPE_EXTS.join(', ')}
          </div>
        </div>
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
