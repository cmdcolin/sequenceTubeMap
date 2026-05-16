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
      <select
        value={value}
        onChange={e => handleInputChange(e.target.value)}
      >
        {pickerOptions.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

export default PickerTypeDropdown
