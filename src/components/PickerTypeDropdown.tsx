import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

interface PickerTypeDropdownProps {
  value?: string
  handleInputChange: (value: string) => void
  pickerOptions?: string[]
  testID?: string
}

export const PickerTypeDropdown = ({
  value = 'mounted',
  handleInputChange,
  pickerOptions = ['upload', 'mounted'],
  testID = 'picker-type-component',
}: PickerTypeDropdownProps) => {
  return (
    <div data-testid={testID}>
      <Select
        size="small"
        value={value}
        onChange={e => { handleInputChange(e.target.value); }}
      >
        {pickerOptions.map(option => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </div>
  )
}

export default PickerTypeDropdown
