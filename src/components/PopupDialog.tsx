import type { ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faX } from '@fortawesome/free-solid-svg-icons'

interface PopupDialogProps {
  open: boolean
  children?: ReactNode
  close: () => void
  closeOnDocumentClick?: boolean
  width?: string | null
  testID?: string
}

export const PopupDialog = ({
  open,
  children,
  close,
  closeOnDocumentClick = false,
  width = '760px',
  testID = 'PopupDialog',
}: PopupDialogProps) => {
  return (
    <Dialog
      open={open}
      onClose={() => close()}
      onBackdropClick={closeOnDocumentClick ? () => close() : undefined}
      data-testid={testID}
      maxWidth={width === null ? false : undefined}
      disableEscapeKeyDown={!closeOnDocumentClick}
      slotProps={{
        paper: {
          sx: width !== null ? { width, maxWidth: 'none' } : { maxWidth: 'none' },
        },
      }}
    >
      <IconButton
        onClick={() => close()}
        data-testid={testID.concat('CloseButton')}
        size="small"
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <FontAwesomeIcon icon={faX} />
      </IconButton>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  )
}

export default PopupDialog
