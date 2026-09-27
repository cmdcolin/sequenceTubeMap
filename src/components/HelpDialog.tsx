import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import { Icon, type IconDefinition } from './Icon.tsx'
import { faCircleInfo } from './icons.ts'

// A small text button reading `label`, or an icon button named after the
// dialog's title
type HelpTrigger = { label: string } | { icon: IconDefinition; small?: boolean }

interface HelpDialogProps {
  title: string
  trigger?: HelpTrigger
  children: ReactNode
}

const INFO_ICON: HelpTrigger = { icon: faCircleInfo, small: true }

export function HelpDialog({
  title,
  trigger = INFO_ICON,
  children,
}: HelpDialogProps) {
  const [open, setOpen] = useState(false)
  // Triggers sit inside menu items and clickable card headers, which must not
  // also act on the click.
  const openDialog = (e: MouseEvent) => {
    e.stopPropagation()
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
  }
  return (
    <>
      {'label' in trigger ? (
        <Button
          variant="text"
          sx={{ fontSize: '0.8em', p: 0, ml: 1, minWidth: 0 }}
          onClick={openDialog}
        >
          {trigger.label}
        </Button>
      ) : (
        <IconButton
          aria-label={`${title} help`}
          title={`${title} help`}
          onClick={openDialog}
        >
          <Icon icon={trigger.icon} size={trigger.small ? 'xs' : undefined} />
        </IconButton>
      )}
      <Dialog
        open={open}
        onClose={close}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ typography: 'body2' }}>{children}</DialogContent>
        <DialogActions>
          <Button onClick={close}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default HelpDialog
