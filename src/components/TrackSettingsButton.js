import React, { useState } from 'react'
import PopupDialog from './PopupDialog.js'
import TrackSettings from './TrackSettings.js'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/free-solid-svg-icons'

export const TrackSettingsButton = ({
  fileType,
  trackColorSettings,
  setTrackColorSetting,
  label,
  availableColors = [
    'greys',
    'ygreys',
    'blues',
    'reds',
    'plainColors',
    'lightColors',
  ],
  testID = 'settings-button-component',
}) => {
  // based off of https://react-popup.elazizi.com/controlled-popup/#using-open-prop
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
