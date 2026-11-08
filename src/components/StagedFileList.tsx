import Button from '@mui/material/Button'
import type { FileType } from '../Types.ts'

const STAGED_TYPES = [
  'graph',
  'read',
  'haplotype',
] as const satisfies readonly FileType[]

export interface StagedFile {
  file: File
  type: FileType | null
  isIndex: boolean
}

interface StagedFileListProps {
  files: StagedFile[]
  isLocal: boolean
  onChangeType: (idx: number, type: FileType) => void
  onRemove: (idx: number) => void
}

export function StagedFileList({
  files,
  isLocal,
  onChangeType,
  onRemove,
}: StagedFileListProps) {
  if (files.length === 0) {
    return null
  }
  return (
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
            {f.isIndex ? (
              <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                {isLocal
                  ? '(index — paired with .gam)'
                  : '(index — skipped on server)'}
              </span>
            ) : null}
          </span>
          {f.isIndex ? (
            <span
              style={{
                fontSize: 12,
                color: '#888',
                minWidth: 80,
                textAlign: 'right',
              }}
            >
              index
            </span>
          ) : (
            <select
              value={f.type ?? ''}
              onChange={e => {
                const picked = STAGED_TYPES.find(
                  type => type === e.target.value,
                )
                if (picked !== undefined) {
                  onChangeType(i, picked)
                }
              }}
              style={{ fontSize: 12 }}
              aria-label={`type for ${f.file.name}`}
            >
              <option value="" disabled>
                (skip)
              </option>
              {STAGED_TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="text"
            onClick={() => {
              onRemove(i)
            }}
          >
            remove
          </Button>
        </li>
      ))}
    </ul>
  )
}

export default StagedFileList
