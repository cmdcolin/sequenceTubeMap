import type { CSSProperties, ReactNode } from 'react'

const BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 999,
}

const MENU_STYLE: CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  background: 'white',
  border: '1px solid #888',
  borderRadius: '4px',
  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  padding: '4px 0',
  minWidth: '240px',
  fontSize: '14px',
}

const HEADER_STYLE: CSSProperties = {
  padding: '4px 12px',
  color: '#666',
  fontSize: '12px',
  borderBottom: '1px solid #eee',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '320px',
}

const ITEM_STYLE: CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
  userSelect: 'none',
}

const DISABLED_ITEM_STYLE: CSSProperties = {
  ...ITEM_STYLE,
  color: '#aaa',
  cursor: 'default',
}

export interface ContextMenuItem {
  label: ReactNode
  disabled?: boolean
  onClick?: () => void
}

interface MenuItemProps {
  label: ReactNode
  disabled?: boolean
  onClick?: () => void
}

const MenuItem = ({ label, disabled, onClick }: MenuItemProps) =>
  disabled ? (
    <div style={DISABLED_ITEM_STYLE}>{label}</div>
  ) : (
    <div
      style={ITEM_STYLE}
      onClick={() => onClick?.()}
      onMouseEnter={e => (e.currentTarget.style.background = '#eef')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </div>
  )

interface ContextMenuProps {
  header: ReactNode
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

const ContextMenu = ({ header, items, x, y, onClose }: ContextMenuProps) => (
  <>
    <div
      style={BACKDROP_STYLE}
      onMouseDown={() => onClose()}
      onContextMenu={e => {
        e.preventDefault()
        onClose()
      }}
    />
    <div style={{ ...MENU_STYLE, left: x, top: y }}>
      <div style={HEADER_STYLE}>{header}</div>
      {items.map((item, idx) => (
        <MenuItem
          key={idx}
          label={item.label}
          disabled={item.disabled}
          onClick={item.onClick}
        />
      ))}
    </div>
  </>
)

export default ContextMenu
