import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MuiButton from '@mui/material/Button'
import type { FileType, Track } from '../Types.ts'
import UploadPanel from './UploadPanel.tsx'

interface UploadDialogProps {
  open: boolean
  onClose: () => void
  onUploaded: (tracks: Track[]) => void
  handleFileUpload: (fileType: FileType, file: File) => Promise<string | undefined>
  isLocal: boolean
}

export function UploadDialog({
  open,
  onClose,
  onUploaded,
  handleFileUpload,
  isLocal,
}: UploadDialogProps) {
  return (
    <Dialog open={open} onClose={() => { onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle>Open custom files</DialogTitle>
      <DialogContent>
        <UploadPanel
          onUploaded={(uploadedTracks) => {
            onUploaded(uploadedTracks)
            onClose()
          }}
          handleFileUpload={handleFileUpload}
          isLocal={isLocal}
        />
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={() => { onClose(); }}>Close</MuiButton>
      </DialogActions>
    </Dialog>
  )
}
