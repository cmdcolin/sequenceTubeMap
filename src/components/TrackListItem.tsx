import Box from '@mui/material/Box'
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

const TRACK_TYPE_OPTIONS: FileType[] = [
  'graph',
  'haplotype',
  'read',
  'node',
  'translation',
]

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
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 1,
        width: '900px',
        mr: '15px',
        mt: 0.5,
      }}
    >
      <Box sx={{ width: 140 }} data-track-field="type">
        <TrackTypeDropdown
          value={trackProps.trackType}
          onChange={(newType) => {
            updateTrack({
              trackType: newType,
              trackFile: undefined,
              trackColorSettings: defaultTrackColors(newType),
            })
          }}
          testID={`file-type-select-component${trackID}`}
          options={TRACK_TYPE_OPTIONS}
        />
      </Box>
      <Box sx={{ width: 140 }} data-track-field="source">
        <TrackTypeDropdown
          value={pickerType}
          onChange={(v) => { setPickerType(v); }}
          testID={`picker-type-select-component${trackID}`}
          options={config.pickerTypeOptions}
        />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 240 }}>
        <TrackFilePicker
          tracks={availableTracks}
          fileType={trackProps.trackType}
          value={trackProps.trackFile}
          pickerType={pickerType}
          handleInputChange={(trackFile) => { updateTrack({ trackFile }); }}
          testID={`file-select-component${trackID}`}
          handleFileUpload={handleFileUpload}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TrackSettingsButton
          fileType={trackProps.trackType}
          trackColorSettings={trackProps.trackColorSettings}
          setTrackColorSetting={(key, value) =>
            { updateTrack({
              trackColorSettings: {
                ...(trackProps.trackColorSettings ?? defaultTrackColors(trackProps.trackType)),
                [key]: value,
              },
            }); }
          }
          availableColors={availableColors}
          label={trackProps.trackType}
          testID={`settings-button-component${trackID}`}
        />
        <TrackDeleteButton
          onClick={() => { onDelete(trackID); }}
          testID={`delete-button-component${trackID}`}
        />
      </Box>
    </Box>
  )
}

export default TrackListItem
