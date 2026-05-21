import Checkbox from '@mui/material/Checkbox'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import { HelpIcon } from './HelpIcon.tsx'

export function CheckboxMenuItem({
  label,
  checked,
  onToggle,
  disabled,
  testid,
  helpText,
}: {
  label: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  testid?: string
  helpText?: string
}) {
  return (
    <MenuItem dense data-testid={testid} disabled={disabled} onClick={() => { onToggle(); }}>
      <ListItemIcon>
        <Checkbox
          edge="start"
          size="small"
          checked={checked}
          disabled={disabled}
          tabIndex={-1}
          disableRipple
        />
      </ListItemIcon>
      <ListItemText primary={label} />
      {helpText && <HelpIcon label={label} helpText={helpText} />}
    </MenuItem>
  )
}
