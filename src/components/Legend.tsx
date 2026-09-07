import { Fragment } from 'react'
import { PALETTES } from '../util/palettes.ts'
import type { PaletteInfo } from '../util/palettes.ts'
import { truncateMiddle } from '../util/text.ts'
import type { ColorScheme, FileType, Palette, Tracks } from '../Types.ts'
import type { ReadGroup } from './ReadGroupsPanel.tsx'

function gradientBackground(colors: readonly string[]): string {
  return `linear-gradient(to right, ${colors.join(', ')})`
}

type ResolvedPalette =
  | { kind: 'sequential'; info: PaletteInfo }
  | { kind: 'categorical'; info: PaletteInfo }
  | { kind: 'hex'; color: string }

function resolvePalette(p: Palette): ResolvedPalette {
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

function PaletteSwatch({ palette }: { palette: Palette }) {
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

function trackLabel(
  file: string | undefined,
  type: string,
  displayName: string | undefined,
): string {
  // displayName is set by UploadPanel to the original filename, since
  // `trackFile` for LocalAPI uploads is an opaque numeric registry id.
  if (displayName) {
    return displayName
  }
  if (!file) {
    return `(unset ${type})`
  }
  const last = file.split('/').pop()
  if (last) {
    return last
  }
  return file
}

// Labels for the two palette slots, which mean different things per track type.
// `main` covers the primary direction/role; `aux` is the secondary slot.
// For graph tracks the aux palette only renders when the graph actually
// contains non-reference paths (i.e. a haplotype track is loaded too), so we
// suppress that row otherwise to avoid showing colors the user won't see.
function paletteRoles(
  type: FileType,
  hasHaplotype: boolean,
  ignoreStrand: boolean,
): { main: string; aux?: string } {
  if (type === 'read') {
    // ignoreStrand collapses the aux/reverse palette; show one Reads row.
    if (ignoreStrand) return { main: 'Reads' }
    return { main: 'Forward reads', aux: 'Reverse reads' }
  } else if (type === 'graph') {
    if (hasHaplotype) {
      return { main: 'Reference path', aux: 'Non-reference paths' }
    } else {
      return { main: 'Reference path' }
    }
  } else if (type === 'haplotype') {
    return { main: 'Haplotypes' }
  } else {
    return { main: type }
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
  const hasHaplotype = tracks.some(t => t.trackType === 'haplotype')
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
        {tracks.map((t, i) => {
          const scheme = colorSchemes[i]
          const roles = paletteRoles(t.trackType, hasHaplotype, ignoreStrand)
          const fullLabel = trackLabel(
            t.trackFile,
            t.trackType,
            t.trackDisplayName,
          )
          return (
            <div key={`${i}-${t.trackFile ?? ''}`}>
              <div
                style={{ fontWeight: 600, marginBottom: 2 }}
                title={fullLabel}
              >
                {truncateMiddle(fullLabel, 40)}{' '}
                <span style={{ color: '#666', fontWeight: 400 }}>
                  ({t.trackType})
                </span>
              </div>
              {scheme ? (
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
                  {t.trackType === 'read' && readGroups && readGroups.length > 0 ? (
                    <>
                      {readGroups.map(g => (
                        <Fragment key={g.id}>
                          <span>{g.name}</span>
                          <PaletteSwatch palette={g.color} />
                        </Fragment>
                      ))}
                      <span>Other reads</span>
                      <PaletteSwatch palette={otherReadsColor ?? 'greys'} />
                    </>
                  ) : (
                    <>
                      <span>{roles.main}</span>
                      <PaletteSwatch palette={scheme.mainPalette} />
                      {roles.aux !== undefined && (
                        <>
                          <span>{roles.aux}</span>
                          <PaletteSwatch palette={scheme.auxPalette} />
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ color: '#999', paddingLeft: 8 }}>no color scheme</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Legend
