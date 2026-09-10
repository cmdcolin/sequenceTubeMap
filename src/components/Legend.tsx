import { Fragment } from 'react'
import { PALETTES } from '../util/palettes.ts'
import type { PaletteInfo } from '../util/palettes.ts'
import { legendSections } from '../util/legend.ts'
import { truncateMiddle } from '../util/text.ts'
import type { ColorScheme, Palette, Tracks } from '../Types.ts'
import type { ReadGroup } from './ReadGroupsPanel.tsx'

function gradientBackground(colors: readonly string[]): string {
  return `linear-gradient(to right, ${colors.join(', ')})`
}

type ResolvedPalette =
  | { kind: 'sequential'; info: PaletteInfo }
  | { kind: 'categorical'; info: PaletteInfo }
  | { kind: 'hex'; color: string }

function resolvePalette(p: string): ResolvedPalette {
  if (p.startsWith('#')) {
    return { kind: 'hex', color: p }
  }
  const match = PALETTES.find(x => x.name === p)
  if (match) {
    if (match.kind === 'sequential') {
      return { kind: 'sequential', info: match }
    } else {
      return { kind: 'categorical', info: match }
    }
  }
  return { kind: 'hex', color: '#cccccc' }
}

function PaletteSwatch({ palette }: { palette: string }) {
  const resolved = resolvePalette(palette)
  if (resolved.kind === 'sequential') {
    return (
      <div
        title={`${palette} (sequential)`}
        style={{
          width: 80,
          height: 14,
          borderRadius: 2,
          border: '1px solid #ccc',
          background: gradientBackground(resolved.info.colors),
        }}
      />
    )
  } else if (resolved.kind === 'categorical') {
    return (
      <div title={`${palette} (categorical)`} style={{ display: 'flex', gap: 1 }}>
        {resolved.info.colors.map((c, i) => (
          <div
            key={`${palette}-${i}`}
            style={{
              width: 8,
              height: 14,
              border: '1px solid #ccc',
              background: c,
            }}
          />
        ))}
      </div>
    )
  } else {
    return (
      <div
        title={resolved.color}
        style={{
          width: 14,
          height: 14,
          borderRadius: 2,
          border: '1px solid #ccc',
          background: resolved.color,
        }}
      />
    )
  }
}

interface LegendProps {
  tracks: Tracks
  colorSchemes: ColorScheme[]
  readGroups?: ReadGroup[]
  otherReadsColor?: Palette
  ignoreStrand?: boolean
  title?: string
  onClose?: () => void
}

function Legend({ tracks, colorSchemes, readGroups, otherReadsColor, ignoreStrand = false, title = 'Color legend', onClose }: LegendProps) {
  if (tracks.length === 0) {
    return null
  }
  const sections = legendSections({
    tracks,
    colorSchemes,
    readGroups,
    otherReadsColor,
    ignoreStrand,
  })
  return (
    <div
      style={{
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: 4,
        background: 'rgba(250, 250, 250, 0.97)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ fontWeight: 600 }}>{title}</div>
        {onClose && (
          <button
            type="button"
            onClick={() => { onClose() }}
            aria-label="Hide legend"
            title="Hide legend"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 4px',
              color: '#666',
            }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map((section, i) => (
          <div key={`${i}-${section.label}`}>
            <div style={{ fontWeight: 600, marginBottom: 2 }} title={section.label}>
              {truncateMiddle(section.label, 40)}{' '}
              <span style={{ color: '#666', fontWeight: 400 }}>
                ({section.kind})
              </span>
            </div>
            {section.rows.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto auto',
                  columnGap: 8,
                  rowGap: 2,
                  alignItems: 'center',
                  paddingLeft: 8,
                }}
              >
                {section.rows.map((row, j) => (
                  <Fragment key={`${j}-${row.label}`}>
                    <span>{row.label}</span>
                    <PaletteSwatch palette={row.palette} />
                  </Fragment>
                ))}
              </div>
            ) : (
              <div style={{ color: '#999', paddingLeft: 8 }}>no color scheme</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Legend
