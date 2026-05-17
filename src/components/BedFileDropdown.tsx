import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'

function getFilename(fullPath: string | null | undefined) {
  if (!fullPath || fullPath === 'none') {
    return ''
  }
  const segments = fullPath.split('/')
  return segments.at(-1) ?? ''
}

interface BedFileDropdownChangeEvent {
  target: { id: string; value: string }
}

interface BedFileDropdownProps {
  id: string
  inputId: string
  className?: string
  value?: string | null
  onChange: (event: BedFileDropdownChangeEvent) => void
  options: string[]
}

export function BedFileDropdown({
  id,
  inputId,
  className,
  value,
  onChange,
  options,
}: BedFileDropdownProps) {
  return (
    <Autocomplete<string, false, true, true>
      id={id}
      className={className}
      size="small"
      freeSolo
      disableClearable
      value={value ?? ''}
      options={options}
      getOptionLabel={option => getFilename(option)}
      onChange={(_event, newValue) => {
        onChange({ target: { id, value: newValue } })
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
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, id: inputId },
          }}
        />
      )}
      fullWidth
      sx={{ minWidth: 200 }}
    />
  )
}

export default BedFileDropdown
