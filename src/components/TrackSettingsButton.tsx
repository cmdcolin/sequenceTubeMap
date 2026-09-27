import { useState } from 'react'
import PopupDialog from './PopupDialog.tsx'
import TrackSettings from './TrackSettings.tsx'
import Button from '@mui/material/Button'
import { Icon } from './Icon.tsx'
import { faGear } from './icons.ts'
import {
  DEFAULT_AVAILABLE_COLORS,
  type ColorPaletteName,
  type ColorScheme,
  type FileType,
  type Palette,
  type PaletteField,
} from '../Types.ts'

interface TrackSettingsButtonProps {
  fileType?: FileType | 'nodeLabel'
  trackColorSettings?: Partial<ColorScheme>
  setTrackColorSetting: (key: PaletteField, value: Palette) => void
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
  const close = () => {
    setOpen(false)
  }
  return (
    <>
      <Button
        variant="contained"
        size="small"
        aria-label={
          label === undefined
            ? 'Track color settings'
            : `Color settings for ${label}`
        }
        onClick={() => {
          setOpen(!open)
        }}
      >
        <Icon icon={faGear} data-testid={testID} />
      </Button>
      <PopupDialog
        open={open}
        close={close}
        title={label === undefined ? 'Colors' : `${label} colors`}
      >
        <TrackSettings
          fileType={fileType}
          trackColorSettings={trackColorSettings}
          availableColors={availableColors}
          setTrackColorSetting={setTrackColorSetting}
        />
      </PopupDialog>
    </>
  )
}

export default TrackSettingsButton
