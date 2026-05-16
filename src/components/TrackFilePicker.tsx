import { useRef } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { Input } from 'reactstrap'
import type { AvailableTrack, FileType } from '../Types'

interface TrackOption {
  label: string
  value: string | undefined
}

interface TrackFilePickerProps {
  tracks: AvailableTrack[]
  fileType?: FileType
  value?: string
  handleInputChange: (newValue: string | undefined) => void
  pickerType?: 'mounted' | 'upload'
  className?: string
  testID?: string
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
}

/*
 * A selection dropdown component that select files.
 * Expects a collection of track objects in the form of {"name": string, "type": string}
 *
 * The handleInputChange function expects to be passed a bare value.
 *
 * See demo and test file for examples of this component.
 */
export const TrackFilePicker = ({
  tracks,
  fileType = 'graph',
  value,
  handleInputChange,
  pickerType = 'mounted',
  className,
  testID = 'file-select-component',
  handleFileUpload,
}: TrackFilePickerProps) => {
  const uploadFileInput = useRef<HTMLInputElement>(null)
  const acceptedExtensions = config.fileTypeToExtensions[fileType]

  async function uploadOnChange() {
    // The ref's value can be null when the upload await finishes, so capture it.
    const uploadingInput = uploadFileInput.current
    if (!uploadingInput) return
    const file = uploadingInput.files?.[0]
    if (!file) return

    try {
      handleInputChange(await handleFileUpload(fileType, file))
    } catch (e) {
      console.error('TrackFilePicker could not upload: ', e)
      // TODO: Display error to user in a better way
      alert(String(e))
      uploadingInput.value = ''
    }
  }

  function mountedOnChange(option: TrackOption) {
    handleInputChange(option.value)
  }

  function getFilename(fullPath: string) {
    const segments = fullPath.split('/')
    return segments[segments.length - 1]
  }

  // Make the list of all options for the <Select>
  const allOptions: TrackOption[] = []
  // And the currently selected one
  let currentOption: TrackOption | null = null
  for (const track of tracks) {
    if (track.trackType === fileType && track.trackFile !== undefined) {
      const trackOption: TrackOption = {
        label: getFilename(track.trackFile),
        value: track.trackFile,
      }
      if (track.trackIsImplied) {
        // Make this file look different because it's not actually in the API
        trackOption.label = '(?) ' + trackOption.label
      }
      allOptions.push(trackOption)
      if (trackOption.value === value) {
        currentOption = trackOption
      }
    }
  }
  if (currentOption === null) {
    if (value === undefined) {
      // Special "nothing-is-selected" state. Make a placeholder.
      currentOption = { label: 'Select a file', value: undefined }
    } else {
      console.warn('Value ' + value + ' not found in available tracks:', tracks)
      currentOption = { label: '(!) ' + getFilename(value), value: value }
    }
  }

  if (pickerType === 'mounted') {
    const placeholderActive = value === undefined
    return (
      <div data-testid={testID}>
        <Autocomplete<TrackOption, false, true>
          options={allOptions}
          value={currentOption}
          size="small"
          disableClearable
          isOptionEqualToValue={(o, v) => o.value === v.value}
          getOptionLabel={o => o.label}
          onChange={(_event, newValue) => {
            mountedOnChange(newValue)
          }}
          className={className}
          sx={{ minWidth: 240 }}
          renderInput={params => (
            <TextField
              {...params}
              placeholder={placeholderActive ? 'Select a file' : undefined}
            />
          )}
        />
      </div>
    )
  } else {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 5,
        }}
      >
        <Input
          data-testid={testID}
          type="file"
          className="customDataUpload form-control-file"
          accept={acceptedExtensions}
          innerRef={uploadFileInput}
          onChange={() => uploadOnChange()}
        />
      </div>
    )
  }
}

export default TrackFilePicker
