import { useState } from 'react'
import PopupDialog from './PopupDialog.tsx'
import TrackSettings from './TrackSettings.tsx'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/free-solid-svg-icons'
import {
  DEFAULT_AVAILABLE_COLORS,
  type ColorPaletteName,
  type ColorScheme,
  type FileType,
  type Palette,
} from '../Types.ts'

interface TrackSettingsButtonProps {
  fileType?: FileType | 'nodeLabel'
  trackColorSettings?: Partial<ColorScheme>
  setTrackColorSetting: (key: keyof ColorScheme, value: Palette) => void
  label?: string
  availableColors?: ColorPaletteName[]
  testID?: string
}

export const TrackSettingsButton = ({
  fileType,
  trackColorSettings,
  setTrackColorSetting,
  label,
  availableColors = DEFAULT_AVAILABLE_COLORS,
  testID = 'settings-button-component',
}: TrackSettingsButtonProps) => {
  const [open, setOpen] = useState(false)
  const close = () => { setOpen(false); }
  return (
    <div>
      <Button aria-label="Settings" onClick={() => { setOpen(!open); }}>
        <FontAwesomeIcon icon={faGear} data-testid={testID} />
      </Button>
      <PopupDialog open={open} close={close}>
        <TrackSettings
          fileType={fileType}
          trackColorSettings={trackColorSettings}
          availableColors={availableColors}
          setTrackColorSetting={setTrackColorSetting}
          label={label}
        />
      </PopupDialog>
    </div>
  )
}

export default TrackSettingsButton
