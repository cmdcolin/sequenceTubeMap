import { useState } from 'react'
import type { ReactNode } from 'react'
import Menu from '@mui/material/Menu'
import MuiButton from '@mui/material/Button'

interface AppBarMenuProps {
  label: string
  testid?: string
  dense?: boolean
  // Rendered inside the menu. Called with a callback that closes the menu, for
  // items that should dismiss it once they've acted.
  children: (close: () => void) => ReactNode
}

// A labelled button in the app bar that owns the anchor state of the menu it
// opens. MUI's Menu already blocks and closes on clicks outside itself, so
// nothing here needs a click-away layer of its own.
export function AppBarMenu({ label, testid, dense, children }: AppBarMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const close = () => { setAnchorEl(null) }
  return (
    <>
      <MuiButton
        color="inherit"
        data-testid={testid}
        onClick={e => { setAnchorEl(e.currentTarget); }}
      >
        {label}
      </MuiButton>
      <Menu
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={() => { close(); }}
        slotProps={dense ? { list: { dense: true } } : undefined}
      >
        {children(close)}
      </Menu>
    </>
  )
}
