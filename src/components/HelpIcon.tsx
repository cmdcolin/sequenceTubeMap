import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import MuiButton from '@mui/material/Button'
import Typography from '@mui/material/Typography'

export function HelpIcon({ label, helpText }: { label: string; helpText: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Help: ${label}`}
        title={`Help: ${label}`}
        sx={{ ml: 0.5, color: 'action.active' }}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <FontAwesomeIcon icon={faCircleInfo} size="xs" />
      </IconButton>
      <Dialog open={open} onClose={() => { setOpen(false); }} maxWidth="xs" fullWidth onClick={(e) => { e.stopPropagation(); }}>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{helpText}</Typography>
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => { setOpen(false); }}>Close</MuiButton>
        </DialogActions>
      </Dialog>
    </>
  )
}
