import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'

function getFilename(fullPath) {
  if (!fullPath || fullPath === 'none') {
    return ''
  }
  const segments = fullPath.split('/')
  return segments[segments.length - 1]
}

export function BedFileDropdown({
  id,
  inputId,
  className,
  value,
  onChange,
  options,
}) {
  return (
    <Autocomplete
      id={id}
      className={className}
      size="small"
      freeSolo
      disableClearable
      value={value ?? ''}
      options={options}
      getOptionLabel={option => getFilename(option)}
      onChange={(_event, newValue) => {
        onChange({ target: { id, value: newValue ?? '' } })
      }}
      onInputChange={(_event, newInput, reason) => {
        if (reason === 'input') {
          onChange({ target: { id, value: newInput } })
        }
      }}
      renderInput={params => (
        <TextField
          {...params}
          size="small"
          placeholder="None"
          inputProps={{ ...params.inputProps, id: inputId }}
        />
      )}
      fullWidth
      sx={{ minWidth: 200 }}
    />
  )
}

export default BedFileDropdown
