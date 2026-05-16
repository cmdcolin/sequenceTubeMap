import { Container, Row, Col } from 'reactstrap'
import { TrackFilePicker } from './TrackFilePicker'
import { TrackTypeDropdown } from './TrackTypeDropdown'
import { TrackDeleteButton } from './TrackDeleteButton'
import { TrackSettingsButton } from './TrackSettingsButton'
import { useEffect, useState } from 'react'
import { defaultTrackColors } from '../common.mjs'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  ColorScheme,
  FileType,
  Palette,
  Track,
} from '../Types'

interface TrackListItemProps {
  trackProps: Track
  availableTracks: AvailableTrack[]
  availableColors?: ColorPaletteName[]
  onChange: (trackID: number, newProps: Track) => void
  onDelete: (trackID: number) => void
  trackID: number
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
}

interface PropChanges {
  trackType?: FileType
  trackFile?: string
  trackColorSettings?: ColorScheme
}

export const TrackListItem = ({
  trackProps,
  availableTracks,
  availableColors,
  onChange,
  onDelete,
  trackID,
  handleFileUpload,
}: TrackListItemProps) => {
  // propChanges only stores new trackType, trackFile, and trackColorSettings changes;
  // reset after onChange is called.
  const [propChanges, setPropChanges] = useState<PropChanges>({})

  const [pickerType, setPickerType] = useState('mounted')

  const trackTypeOnChange = async (newTrackType: string) => {
    const fileType = newTrackType as FileType
    setPropChanges({
      ...propChanges,
      trackType: fileType,
      trackFile: undefined,
      trackColorSettings: defaultTrackColors(fileType),
    })
  }

  const trackFileOnChange = async (newFile: string | undefined) => {
    setPropChanges({ ...propChanges, trackFile: newFile })
  }

  const trackSettingsOnChange = async (key: string, value: Palette) => {
    const newTrackColorSettings: ColorScheme = {
      ...trackProps.trackColorSettings,
      [key]: value,
    } as ColorScheme
    setPropChanges({
      ...propChanges,
      trackColorSettings: newTrackColorSettings,
    })
  }

  // Calls onChange after state changes via useEffect (legitimate effect: runs the
  // parent callback once we've committed local state to the latest propChanges).
  useEffect(() => {
    const newTrackProps: Track = { ...trackProps }
    for (const key in propChanges) {
      const k = key as keyof PropChanges
      if (k === 'trackType' && propChanges.trackType !== undefined) {
        newTrackProps.trackType = propChanges.trackType
      } else if (k === 'trackFile') {
        newTrackProps.trackFile = propChanges.trackFile
      } else if (k === 'trackColorSettings') {
        newTrackProps.trackColorSettings = propChanges.trackColorSettings
      }
    }

    if (JSON.stringify(trackProps) !== JSON.stringify(newTrackProps)) {
      onChange(trackID, newTrackProps)
      setPropChanges({})
    }
  }, [propChanges, onChange, trackProps, trackID])

  // displayed elements use propChanges (local state) first, then fall back to trackProps.
  // Not just `||` because propChanges can set trackFile to undefined.
  const displayedFile =
    'trackFile' in propChanges ? propChanges.trackFile : trackProps.trackFile
  console.log(displayedFile)
  return (
    <Container
      key={trackID}
      style={{ width: '900px', marginLeft: 0, marginRight: 15 }}
    >
      <Row className="g-0">
        <Col sm="2" className="tracklist-dropdown type">
          <TrackTypeDropdown
            value={propChanges.trackType ?? trackProps.trackType}
            onChange={trackTypeOnChange}
            testID={'file-type-select-component'.concat(String(trackID))}
            options={['graph', 'haplotype', 'read', 'node', 'translation']}
          />
        </Col>
        <Col sm="2" className="tracklist-dropdown source">
          <TrackTypeDropdown
            value={pickerType}
            onChange={setPickerType}
            testID={'picker-type-select-component'.concat(String(trackID))}
            options={config.pickerTypeOptions}
          />
        </Col>

        <Col className="tracklist-dropdown">
          <TrackFilePicker
            tracks={availableTracks}
            fileType={propChanges.trackType ?? trackProps.trackType}
            value={displayedFile}
            pickerType={pickerType as 'mounted' | 'upload'}
            handleInputChange={trackFileOnChange}
            testID={'file-select-component'.concat(String(trackID))}
            handleFileUpload={handleFileUpload}
          />
        </Col>
        <Col className="tracklist-button" md="1">
          <TrackSettingsButton
            fileType={propChanges.trackType ?? trackProps.trackType}
            trackColorSettings={
              propChanges.trackColorSettings ?? trackProps.trackColorSettings
            }
            setTrackColorSetting={trackSettingsOnChange}
            availableColors={availableColors}
            testID={'settings-button-component'.concat(String(trackID))}
          />
          <TrackDeleteButton
            onClick={() => {
              onDelete(trackID)
            }}
            testID={'delete-button-component'.concat(String(trackID))}
          />
        </Col>
      </Row>
    </Container>
  )
}

export default TrackListItem
