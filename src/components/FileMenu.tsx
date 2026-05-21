import { useState } from 'react'
import MuiButton from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import type { AvailableTrack, FileType, Track, Tracks } from '../Types.ts'
import PopupDialog from './PopupDialog.tsx'
import TrackPickerDisplay from './TrackPickerDisplay.tsx'
import { UploadDialog } from './UploadDialog.tsx'

interface FileMenuProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  onOpen: (el: HTMLElement) => void
  customFilesFlag: boolean
  tracks: Tracks
  availableTracks: AvailableTrack[]
  onTracksChange: (tracks: Tracks) => void
  handleFileUpload: (fileType: FileType, file: File) => Promise<string | undefined>
  onUploaded: (tracks: Track[]) => void
  onOpenCustomFiles: () => void
  apiMode: 'local' | 'server' | 'upstream'
  onDestChange?: (mode: string) => void
}

export function FileMenu({
  anchorEl,
  open,
  onClose,
  onOpen,
  customFilesFlag,
  tracks,
  availableTracks,
  onTracksChange,
  handleFileUpload,
  onUploaded,
  onOpenCustomFiles,
  apiMode,
  onDestChange,
}: FileMenuProps) {
  const [tracksDialogOpen, setTracksDialogOpen] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  return (
    <>
      <MuiButton
        color="inherit"
        data-testid="fileMenuButton"
        onClick={(e) => { onOpen(e.currentTarget); }}
      >
        File
      </MuiButton>
      <Menu anchorEl={anchorEl} open={open} onClose={() => { onClose(); }}>
        <MenuItem
          data-testid="openCustomFiles"
          selected={customFilesFlag}
          onClick={() => {
            if (!customFilesFlag) {
              onOpenCustomFiles()
            }
            // Default to vgteam server when opening from pure local (WASM) mode
            // so the primary upload path is front-and-centre.
            if (apiMode === 'local') {
              onDestChange?.('upstream')
            }
            setUploadDialogOpen(true)
            onClose()
          }}
        >
          Open…
        </MenuItem>
        <MenuItem
          data-testid="manageTracks"
          disabled={!customFilesFlag}
          onClick={() => {
            setTracksDialogOpen(true)
            onClose()
          }}
        >
          Manage tracks…
        </MenuItem>
      </Menu>
      {customFilesFlag && (
        <PopupDialog
          open={tracksDialogOpen}
          close={() => { setTracksDialogOpen(false); }}
          closeOnDocumentClick={false}
          width={null}
          testID="TrackPicker"
        >
          <TrackPickerDisplay
            tracks={tracks}
            availableTracks={availableTracks}
            onChange={(newTracks) => { onTracksChange(newTracks); }}
            handleFileUpload={handleFileUpload}
          />
        </PopupDialog>
      )}
      <UploadDialog
        open={uploadDialogOpen}
        onClose={() => { setUploadDialogOpen(false); }}
        onUploaded={onUploaded}
        handleFileUpload={handleFileUpload}
        apiMode={apiMode}
        onDestChange={onDestChange}
      />
    </>
  )
}
