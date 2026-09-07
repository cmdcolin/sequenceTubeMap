import { useState } from 'react'
import type { ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'

interface HelpDialogProps {
  title: string
  // Text of the button that opens the dialog.
  label?: string
  children: ReactNode
}

function HelpDialog({ title, label = 'What is this?', children }: HelpDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="text"
        size="small"
        sx={{ fontSize: '0.8em', p: 0, ml: 1, minWidth: 0 }}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
      >
        {label}
      </Button>
      <Dialog open={open} onClose={() => { setOpen(false); }} onClick={(e) => { e.stopPropagation(); }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>{children}</DialogContent>
      </Dialog>
    </>
  )
}

export default HelpDialog
