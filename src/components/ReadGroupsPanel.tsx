import type { CSSProperties } from 'react'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

const PALETTE_OPTIONS = [
  { value: 'plainColors', label: 'Plain' },
  { value: 'reds', label: 'Reds' },
  { value: 'blues', label: 'Blues' },
  { value: 'greys', label: 'Greys' },
  { value: 'ygreys', label: 'Yellow-greys' },
  { value: 'lightColors', label: 'Light' },
]

const SOLID_SENTINEL = '__solid__'

const PANEL_STYLE: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d0d0d0',
  background: '#fafafa',
  borderRadius: '4px',
  margin: '8px 0',
  fontSize: '14px',
}

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '6px',
  fontWeight: 500,
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 0',
}

const SWATCH_STYLE: CSSProperties = {
  width: '24px',
  height: '20px',
  border: '1px solid #888',
  borderRadius: '3px',
  padding: 0,
  cursor: 'pointer',
}

const NAME_INPUT_STYLE: CSSProperties = {
  border: '1px solid transparent',
  background: 'transparent',
  fontSize: '14px',
  padding: '2px 4px',
  borderRadius: '3px',
  minWidth: '120px',
}

const COUNT_STYLE: CSSProperties = {
  color: '#666',
  fontSize: '13px',
}

const DELETE_STYLE: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  color: '#666',
  padding: '0 4px',
}

const OTHER_LABEL_STYLE: CSSProperties = {
  fontSize: '14px',
  padding: '2px 4px',
  color: '#444',
  fontStyle: 'italic',
  minWidth: '120px',
}

const OTHER_ROW_STYLE: CSSProperties = {
  ...ROW_STYLE,
  borderTop: '1px dashed #ccc',
  marginTop: '4px',
  paddingTop: '8px',
}

function isSolid(color: unknown): color is string {
  return typeof color === 'string' && color.startsWith('#')
}

interface PaletteChooserProps {
  value: string
  // Describes the *thing being colored* (e.g. 'group "foo"', 'other reads').
  // Used in aria-labels for both the palette dropdown and the solid swatch.
  subject: string
  title?: string
  solidDefault: string
  onChange: (value: string) => void
}

const PaletteChooser = ({
  value,
  subject,
  title,
  solidDefault,
  onChange,
}: PaletteChooserProps) => {
  const solid = isSolid(value)
  return (
    <>
      <Select<string>
        size="small"
        value={solid ? SOLID_SENTINEL : value}
        onChange={e => {
          const v = e.target.value
          onChange(v === SOLID_SENTINEL ? solidDefault : v)
        }}
        aria-label={`Palette for ${subject}`}
        title={title}
        sx={{ fontSize: '13px', minWidth: 120 }}
      >
        {PALETTE_OPTIONS.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
        <MenuItem value={SOLID_SENTINEL}>Solid color…</MenuItem>
      </Select>
      {solid ? (
        <input
          type="color"
          value={value}
          style={SWATCH_STYLE}
          onChange={e => { onChange(e.target.value); }}
          aria-label={`Solid color for ${subject}`}
        />
      ) : null}
    </>
  )
}

export interface ReadGroup {
  id: string
  name: string
  color: string
  reads: string[]
}

interface ReadGroupsPanelProps {
  groups: ReadGroup[]
  activeGroupId?: string | null
  otherReadsColor: string
  onSetActive: (id: string) => void
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: string) => void
  onDelete: (id: string) => void
  onRecolorOther: (color: string) => void
}

const ReadGroupsPanel = ({
  groups,
  activeGroupId,
  otherReadsColor,
  onSetActive,
  onRename,
  onRecolor,
  onDelete,
  onRecolorOther,
}: ReadGroupsPanelProps) => (
  <div style={PANEL_STYLE}>
    <div
      style={HEADER_STYLE}
      title="Reads in a named group use that group's palette. All ungrouped reads use the 'Other reads' palette below. Deleting every group restores the default strand-based coloring."
    >
      Read coloring
      <span style={COUNT_STYLE}>
        ({groups.length} group{groups.length === 1 ? '' : 's'} + other)
      </span>
    </div>
    {groups.map(group => {
      const isActive = group.id === activeGroupId
      return (
        <div key={group.id} style={ROW_STYLE}>
          <input
            type="radio"
            name="active-read-group"
            checked={isActive}
            onChange={() => { onSetActive(group.id); }}
            aria-label={`Set ${group.name} as active group`}
            title="Active group receives new selections"
          />
          <PaletteChooser
            value={group.color}
            subject={group.name}
            title="Choose a palette (reads cycle through it) or solid color"
            solidDefault="#ff7f00"
            onChange={c => { onRecolor(group.id, c); }}
          />
          <input
            type="text"
            value={group.name}
            style={{
              ...NAME_INPUT_STYLE,
              borderColor: isActive ? '#888' : 'transparent',
            }}
            onChange={e => { onRename(group.id, e.target.value); }}
            aria-label={`Name for ${group.name}`}
          />
          <span style={COUNT_STYLE}>
            {group.reads.length} read{group.reads.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            style={DELETE_STYLE}
            onClick={() => { onDelete(group.id); }}
            aria-label={`Delete group ${group.name}`}
            title="Delete group"
          >
            ×
          </button>
        </div>
      )
    })}
    <div style={OTHER_ROW_STYLE}>
      <span style={{ width: '16px' }} />
      <PaletteChooser
        value={otherReadsColor}
        subject="other reads"
        title="Color for reads not in any group"
        solidDefault="#888888"
        onChange={onRecolorOther}
      />
      <span style={OTHER_LABEL_STYLE}>Other reads (ungrouped)</span>
    </div>
  </div>
)

export default ReadGroupsPanel
