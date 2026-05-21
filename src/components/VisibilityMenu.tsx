import MuiButton from '@mui/material/Button'
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import TrackVisibilityPanel from './TrackVisibilityPanel.tsx'

interface VisibilityMenuProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  onOpen: (el: HTMLElement) => void
}

export function VisibilityMenu({
  anchorEl,
  open,
  onClose,
  onOpen,
}: VisibilityMenuProps) {
  return (
    <>
      <MuiButton
        color="inherit"
        onClick={(e) => { onOpen(e.currentTarget); }}
      >
        Visibility
      </MuiButton>
      <Popover
        keepMounted
        anchorEl={anchorEl}
        open={open}
        onClose={() => { onClose(); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1 }}>
          <TrackVisibilityPanel />
        </Box>
      </Popover>
    </>
  )
}
