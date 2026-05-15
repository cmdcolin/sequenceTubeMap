import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

export const PickerTypeDropdown = ({
  value = 'mounted',
  handleInputChange,
  pickerOptions = ['upload, mounted'],
  testID = 'picker-type-component',
}) => {
  return (
    <div data-testid={testID}>
      <Select
        size="small"
        value={value}
        onChange={e => handleInputChange(e.target.value)}
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
