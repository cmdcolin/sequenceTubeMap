import { useState } from 'react'
import TrackPickerDisplay from './TrackPickerDisplay.tsx'
import MuiButton from '@mui/material/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faList } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog.tsx'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  FileType,
  Tracks,
} from '../Types.ts'

interface TrackPickerProps {
  tracks?: Tracks
  availableTracks: AvailableTrack[]
  availableColors?: ColorPaletteName[]
  onChange?: (newTracks: Tracks) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
}

export const TrackPicker = ({
  tracks = [config.defaultTrackProps],
  availableTracks,
  availableColors,
  onChange = () => {},
  handleFileUpload,
}: TrackPickerProps) => {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <MuiButton
        color="inherit"
        aria-label="Track Picker"
        data-testid={'TrackPickerButton'}
        onClick={() => { setOpen(!open); }}
        startIcon={<FontAwesomeIcon icon={faList} />}
      >
        Tracks
      </MuiButton>
      {/* width=null because the default fixed width is too small for the track list items */}
      <PopupDialog
        open={open}
        close={() => { setOpen(false); }}
        closeOnDocumentClick={false}
        width={null}
        testID="TrackPicker"
      >
        <TrackPickerDisplay
          tracks={tracks}
          availableTracks={availableTracks}
          availableColors={availableColors}
          onChange={onChange}
          handleFileUpload={handleFileUpload}
        />
      </PopupDialog>
    </div>
  )
}

export default TrackPicker
