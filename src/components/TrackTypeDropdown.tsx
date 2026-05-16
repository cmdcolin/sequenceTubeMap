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
      <select
        id={id}
        className={`form-select form-select-sm${className ? ` ${className}` : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

export default TrackTypeDropdown
