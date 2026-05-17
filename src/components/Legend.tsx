import { PALETTES } from '../util/palettes.ts'
import type { PaletteInfo } from '../util/palettes.ts'
import type { ColorScheme, FileType, Palette, Tracks } from '../Types.ts'

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

function trackLabel(file: string | undefined, type: string): string {
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
// `main` covers the primary direction/role; `aux` is the secondary slot, only
// used by track types that distinguish two roles.
function paletteRoles(type: FileType): { main: string; aux?: string } {
  if (type === 'read') {
    return { main: 'Forward reads', aux: 'Reverse reads' }
  } else if (type === 'graph') {
    return { main: 'Reference path', aux: 'Non-reference paths' }
  } else if (type === 'haplotype') {
    return { main: 'Haplotypes' }
  } else {
    return { main: type }
  }
}

interface LegendProps {
  tracks: Tracks
  colorSchemes: ColorScheme[]
  title?: string
}

function Legend({ tracks, colorSchemes, title = 'Color legend' }: LegendProps) {
  if (tracks.length === 0) {
    return null
  }
  return (
    <div
      style={{
        display: 'inline-block',
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: 4,
        background: '#fafafa',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tracks.map((t, i) => {
          const scheme = colorSchemes[i]
          const roles = paletteRoles(t.trackType)
          return (
            <div key={`${i}-${t.trackFile ?? ''}`}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {trackLabel(t.trackFile, t.trackType)}{' '}
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
                  <span>{roles.main}</span>
                  <PaletteSwatch palette={scheme.mainPalette} />
                  {roles.aux !== undefined && (
                    <>
                      <span>{roles.aux}</span>
                      <PaletteSwatch palette={scheme.auxPalette} />
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
