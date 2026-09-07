import { useState } from 'react'
import type { ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'

interface HelpDialogProps {
  title: string
  children: ReactNode
}

function HelpDialog({ title, children }: HelpDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn-link btn-sm p-0 ms-2 align-baseline"
        style={{ fontSize: '0.8em' }}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
      >
        What is this?
      </button>
      <Dialog open={open} onClose={() => { setOpen(false); }} onClick={(e) => { e.stopPropagation(); }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>{children}</DialogContent>
      </Dialog>
    </>
  )
}

export default HelpDialog
