import type { ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import { Icon } from './Icon.tsx'
import { faX } from './icons.ts'

interface PopupDialogProps {
  open: boolean
  // Heads the dialog and names it for assistive technology
  title?: string
  children?: ReactNode
  close: () => void
  width?: string | null
  testID?: string
}

export const PopupDialog = ({
  open,
  title,
  children,
  close,
  width = '760px',
  testID = 'PopupDialog',
}: PopupDialogProps) => {
  return (
    <Dialog
      open={open}
      onClose={() => {
        close()
      }}
      onClick={e => {
        e.stopPropagation()
      }}
      data-testid={testID}
      maxWidth={width === null ? false : undefined}
      slotProps={{
        paper: {
          sx:
            width !== null ? { width, maxWidth: 'none' } : { maxWidth: 'none' },
        },
      }}
    >
      <IconButton
        onClick={() => {
          close()
        }}
        data-testid={testID.concat('CloseButton')}
        aria-label="Close"
        title="Close"
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <Icon icon={faX} />
      </IconButton>
      {title === undefined ? null : (
        <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
      )}
      <DialogContent>{children}</DialogContent>
    </Dialog>
  )
}

export default PopupDialog
