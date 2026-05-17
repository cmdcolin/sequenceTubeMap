import { Container, Row, Col } from 'reactstrap'
import { TrackFilePicker } from './TrackFilePicker.tsx'
import { TrackTypeDropdown } from './TrackTypeDropdown.tsx'
import { TrackDeleteButton } from './TrackDeleteButton.tsx'
import { TrackSettingsButton } from './TrackSettingsButton.tsx'
import { useState } from 'react'
import { defaultTrackColors } from '../common.ts'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  ColorScheme,
  FileType,
  Track,
} from '../Types.ts'

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

type PickerType = 'mounted' | 'upload'

export const TrackListItem = ({
  trackProps,
  availableTracks,
  availableColors,
  onChange,
  onDelete,
  trackID,
  handleFileUpload,
}: TrackListItemProps) => {
  const [pickerType, setPickerType] = useState<PickerType>('mounted')

  const updateTrack = (changes: Partial<Track>) => {
    onChange(trackID, { ...trackProps, ...changes })
  }

  return (
    <Container
      key={trackID}
      style={{ width: '900px', marginLeft: 0, marginRight: 15 }}
    >
      <Row className="g-0">
        <Col sm="2" className="tracklist-dropdown type">
          <TrackTypeDropdown
            value={trackProps.trackType}
            onChange={(newType) => {
              const fileType = newType as FileType
              updateTrack({
                trackType: fileType,
                trackFile: undefined,
                trackColorSettings: defaultTrackColors(fileType),
              })
            }}
            testID={`file-type-select-component${trackID}`}
            options={['graph', 'haplotype', 'read', 'node', 'translation']}
          />
        </Col>
        <Col sm="2" className="tracklist-dropdown source">
          <TrackTypeDropdown
            value={pickerType}
            onChange={(v) => { setPickerType(v as PickerType); }}
            testID={`picker-type-select-component${trackID}`}
            options={config.pickerTypeOptions}
          />
        </Col>

        <Col className="tracklist-dropdown">
          <TrackFilePicker
            tracks={availableTracks}
            fileType={trackProps.trackType}
            value={trackProps.trackFile}
            pickerType={pickerType}
            handleInputChange={(trackFile) => { updateTrack({ trackFile }); }}
            testID={`file-select-component${trackID}`}
            handleFileUpload={handleFileUpload}
          />
        </Col>
        <Col className="tracklist-button" md="1">
          <TrackSettingsButton
            fileType={trackProps.trackType}
            trackColorSettings={trackProps.trackColorSettings}
            setTrackColorSetting={(key, value) =>
              { updateTrack({
                trackColorSettings: {
                  ...trackProps.trackColorSettings,
                  [key]: value,
                } as ColorScheme,
              }); }
            }
            availableColors={availableColors}
            testID={`settings-button-component${trackID}`}
          />
          <TrackDeleteButton
            onClick={() => { onDelete(trackID); }}
            testID={`delete-button-component${trackID}`}
          />
        </Col>
      </Row>
    </Container>
  )
}

export default TrackListItem
