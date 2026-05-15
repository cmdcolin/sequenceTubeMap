import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

interface TrackTypeDropdownProps {
  id?: string
  className?: string
  value?: string
  onChange: (value: string) => void
  testID?: string
  options?: string[]
}

export function TrackTypeDropdown({
  id,
  className,
  value = 'graph',
  onChange,
  testID = 'file-type-select-component',
  options = ['graph', 'haplotype', 'read', 'node'],
}: TrackTypeDropdownProps) {
  return (
    <div data-testid={testID}>
      <Select
        id={id}
        className={className}
        size="small"
        value={value}
        onChange={e => onChange(e.target.value as string)}
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
