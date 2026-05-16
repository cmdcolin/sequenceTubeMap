import { useState } from 'react'
import TrackPickerDisplay from './TrackPickerDisplay'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faList } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  FileType,
  Tracks,
} from '../Types'

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
  tracks = { 1: config.defaultTrackProps },
  availableTracks,
  availableColors,
  onChange = () => {},
  handleFileUpload,
}: TrackPickerProps) => {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div>
      <Button
        aria-label="Track Picker"
        data-testid={'TrackPickerButton'}
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={faList} /> Configure Tracks
      </Button>
      {/* width=null because the default fixed width is too small for the track list items */}
      <PopupDialog
        open={open}
        close={close}
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
