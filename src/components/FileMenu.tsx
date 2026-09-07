import { useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import type { AvailableTrack, FileType, Track, Tracks } from '../Types.ts'
import { AppBarMenu } from './AppBarMenu.tsx'
import PopupDialog from './PopupDialog.tsx'
import TrackPickerDisplay from './TrackPickerDisplay.tsx'
import { UploadDialog } from './UploadDialog.tsx'

interface FileMenuProps {
  customFilesFlag: boolean
  tracks: Tracks
  availableTracks: AvailableTrack[]
  onTracksChange: (tracks: Tracks) => void
  handleFileUpload: (fileType: FileType, file: File) => Promise<string | undefined>
  onUploaded: (tracks: Track[]) => void
  onOpenCustomFiles: () => void
  apiMode: 'local' | 'server' | 'upstream'
  serverModeId: 'server' | 'upstream'
  onDestChange: (mode: string) => void
}

export function FileMenu({
  customFilesFlag,
  tracks,
  availableTracks,
  onTracksChange,
  handleFileUpload,
  onUploaded,
  onOpenCustomFiles,
  apiMode,
  serverModeId,
  onDestChange,
}: FileMenuProps) {
  const [tracksDialogOpen, setTracksDialogOpen] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  return (
    <>
      <AppBarMenu label="File" testid="fileMenuButton">
        {close => (
          <>
            <MenuItem
              data-testid="openCustomFiles"
              selected={customFilesFlag}
              onClick={() => {
                if (!customFilesFlag) {
                  onOpenCustomFiles()
                }
                setUploadDialogOpen(true)
                close()
              }}
            >
              Open…
            </MenuItem>
            <MenuItem
              data-testid="manageTracks"
              onClick={() => {
                setTracksDialogOpen(true)
                close()
              }}
            >
              Manage tracks…
            </MenuItem>
          </>
        )}
      </AppBarMenu>
      <PopupDialog
        open={tracksDialogOpen}
        close={() => { setTracksDialogOpen(false); }}
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
      <UploadDialog
        open={uploadDialogOpen}
        onClose={() => { setUploadDialogOpen(false); }}
        onUploaded={onUploaded}
        handleFileUpload={handleFileUpload}
        apiMode={apiMode}
        serverModeId={serverModeId}
        onDestChange={onDestChange}
      />
    </>
  )
}
