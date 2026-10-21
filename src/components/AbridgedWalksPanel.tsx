import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { AbridgedWalk } from '../Types.ts'

const PANEL_STYLE: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d6d8db',
  borderRadius: '4px',
  margin: '8px 0',
  fontSize: '14px',
  background: '#f1f3f5',
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px',
}

const BLOCK_STYLE: CSSProperties = {
  background: 'white',
  border: '1px dashed #868e96',
  borderRadius: '4px',
  padding: '2px 8px',
  fontSize: '13px',
  cursor: 'pointer',
}

const REMOVE_STYLE: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: '1',
  padding: '0 4px',
  color: '#666',
}

// A satellite array can abridge hundreds of walks in one window
const SHOWN_AT_FIRST = 8

const twoDigits = (n: number) =>
  Number(n.toPrecision(2)).toLocaleString('en-US')

function scaled(n: number, unit: string, kilo: string, mega: string) {
  return n >= 1e6
    ? `${twoDigits(n / 1e6)} ${mega}`
    : n >= 1e3
      ? `${twoDigits(n / 1e3)} ${kilo}`
      : `${n.toLocaleString('en-US')} ${unit}`
}

// `sample#haplotype`, which says which walk it is within one contig's window
const shortName = (name: string) => name.split('#').slice(0, 2).join('#')

// The label in gfa-to-tabix's ADR 0004: `HG00097#1: 140 k steps, 2.1 Mb off
// reference`
export function abridgedLabel({ name, steps, bp }: AbridgedWalk): string {
  return `${shortName(name)}: ${scaled(steps, 'steps', 'k steps', 'M steps')}, ${scaled(bp, 'bp', 'kb', 'Mb')} off reference`
}

interface AbridgedWalksPanelProps {
  abridged: AbridgedWalk[]
  expanded: string[]
  onExpandedChange: (names: string[]) => void
}

// The walks a walk file abridged in this window, each a block that reads it
// in full, and the walks read in full so far, each of which can go back.
function AbridgedWalksPanel({
  abridged,
  expanded,
  onExpandedChange,
}: AbridgedWalksPanelProps) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? abridged : abridged.slice(0, SHOWN_AT_FIRST)
  return (
    <div style={PANEL_STYLE}>
      {abridged.length > 0 ? (
        <div style={ROW_STYLE}>
          <span title="The walk file moved these walks' costliest stretch to detail records, which a window doesn't read.">
            Abridged walks, not drawn:
          </span>
          {shown.map(walk => (
            <button
              key={walk.name}
              type="button"
              style={BLOCK_STYLE}
              title={`Read ${walk.name} in full and draw it`}
              onClick={() => {
                onExpandedChange([...expanded, walk.name])
              }}
            >
              {abridgedLabel(walk)}
            </button>
          ))}
          {shown.length < abridged.length ? (
            <button
              type="button"
              onClick={() => {
                setShowAll(true)
              }}
            >
              +{abridged.length - shown.length} more…
            </button>
          ) : null}
        </div>
      ) : null}
      {expanded.length > 0 ? (
        <div style={{ ...ROW_STYLE, marginTop: abridged.length > 0 ? 6 : 0 }}>
          <span>Read in full:</span>
          {expanded.map(name => (
            <span key={name} style={{ ...BLOCK_STYLE, cursor: 'default' }}>
              {shortName(name)}
              <button
                type="button"
                style={REMOVE_STYLE}
                aria-label={`Abridge ${name} again`}
                title="Abridge it again"
                onClick={() => {
                  onExpandedChange(expanded.filter(n => n !== name))
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default AbridgedWalksPanel
