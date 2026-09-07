import { useState } from 'react'
import MuiButton from '@mui/material/Button'
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import TrackVisibilityPanel from './TrackVisibilityPanel.tsx'

export function VisibilityMenu() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  return (
    <>
      <MuiButton
        color="inherit"
        data-testid="visibilityMenuButton"
        onClick={e => { setAnchorEl(e.currentTarget); }}
      >
        Visibility
      </MuiButton>
      <Popover
        keepMounted
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={() => { setAnchorEl(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1 }}>
          <TrackVisibilityPanel />
        </Box>
      </Popover>
    </>
  )
}
