import type { CSSProperties, ReactNode } from 'react'

const BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 999,
}

const MENU_WIDTH = 260
const HEADER_HEIGHT = 26
const ITEM_HEIGHT = 31
const VIEWPORT_MARGIN = 8

const MENU_STYLE: CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  background: 'white',
  border: '1px solid #888',
  borderRadius: '4px',
  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  padding: '4px 0',
  minWidth: `${MENU_WIDTH - 20}px`,
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
  display: 'block',
  width: '100%',
  textAlign: 'left',
  font: 'inherit',
  border: 'none',
  background: 'transparent',
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
  label: string
  disabled?: boolean
  onClick?: () => void
}

interface MenuItemProps {
  label: string
  disabled?: boolean
  autoFocus?: boolean
  onClick?: () => void
}

const MenuItem = ({ label, disabled, autoFocus, onClick }: MenuItemProps) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    autoFocus={autoFocus}
    style={disabled ? DISABLED_ITEM_STYLE : ITEM_STYLE}
    onClick={() => onClick?.()}
    onMouseEnter={e => (e.currentTarget.style.background = '#eef')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
  >
    {label}
  </button>
)

// The click position can be close enough to an edge that a menu placed there
// would hang off-screen, so pull it back inside. The size is estimated from
// the item count rather than measured, which is enough to keep every item
// reachable.
function clampToViewport(x: number, y: number, itemCount: number) {
  const height = HEADER_HEIGHT + itemCount * ITEM_HEIGHT
  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(x, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
    ),
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN),
    ),
  }
}

function moveFocus(menu: HTMLElement, delta: number) {
  const entries = [
    ...menu.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not([disabled])',
    ),
  ]
  const current = entries.findIndex(entry => entry === document.activeElement)
  const next = current === -1 ? 0 : current + delta
  entries.at(next % entries.length)?.focus()
}

interface ContextMenuProps {
  header: ReactNode
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

const ContextMenu = ({ header, items, x, y, onClose }: ContextMenuProps) => {
  const { left, top } = clampToViewport(x, y, items.length)
  const firstEnabled = items.find(item => !item.disabled)
  return (
    <>
      <div
        style={BACKDROP_STYLE}
        onMouseDown={() => { onClose(); }}
        onContextMenu={e => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        style={{ ...MENU_STYLE, left, top }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            moveFocus(e.currentTarget, 1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            moveFocus(e.currentTarget, -1)
          }
        }}
      >
        <div style={HEADER_STYLE}>{header}</div>
        {items.map(item => (
          <MenuItem
            key={item.label}
            label={item.label}
            disabled={item.disabled}
            autoFocus={item === firstEnabled}
            onClick={item.onClick}
          />
        ))}
      </div>
    </>
  )
}

export default ContextMenu
