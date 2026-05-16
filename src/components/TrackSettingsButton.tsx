import { useState } from 'react'
import PopupDialog from './PopupDialog'
import TrackSettings from './TrackSettings'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/free-solid-svg-icons'
import type {
  ColorPaletteName,
  ColorScheme,
  FileType,
  Palette,
} from '../Types'

interface TrackSettingsButtonProps {
  fileType?: FileType | 'nodeLabel'
  trackColorSettings?: Partial<ColorScheme>
  setTrackColorSetting: (key: string, value: Palette) => void
  label?: string
  availableColors?: ColorPaletteName[]
  testID?: string
}

const DEFAULT_AVAILABLE_COLORS: ColorPaletteName[] = [
  'greys',
  'ygreys',
  'blues',
  'reds',
  'plainColors',
  'lightColors',
]

export const TrackSettingsButton = ({
  fileType,
  trackColorSettings,
  setTrackColorSetting,
  label,
  availableColors = DEFAULT_AVAILABLE_COLORS,
  testID = 'settings-button-component',
}: TrackSettingsButtonProps) => {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <div>
      <Button aria-label="Settings" onClick={() => setOpen(!open)}>
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
