import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

interface TrackTypeDropdownProps<T extends string> {
  value: T
  onChange: (value: T) => void
  testID?: string
  options: readonly T[]
}

export function TrackTypeDropdown<T extends string>({
  value,
  onChange,
  testID = 'file-type-select-component',
  options,
}: TrackTypeDropdownProps<T>) {
  return (
    <div data-testid={testID}>
      <Select<T>
        size="small"
        value={value}
        // MUI types the change event's value as the union with a plain string,
        // so pick the matching option back out of the list we were given.
        onChange={e => {
          const picked = options.find(o => o === e.target.value)
          if (picked !== undefined) {
            onChange(picked)
          }
        }}
      >
        {options.map(o => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </Select>
    </div>
  )
}

export default TrackTypeDropdown
