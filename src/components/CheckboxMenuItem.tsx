import Checkbox from '@mui/material/Checkbox'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import { HelpDialog } from './HelpDialog.tsx'

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
    <MenuItem
      data-testid={testid}
      disabled={disabled}
      onClick={() => {
        onToggle()
      }}
    >
      <ListItemIcon>
        <Checkbox
          sx={{ p: 0 }}
          checked={checked}
          disabled={disabled}
          tabIndex={-1}
          disableRipple
        />
      </ListItemIcon>
      <ListItemText primary={label} />
      {helpText && <HelpDialog title={label}>{helpText}</HelpDialog>}
    </MenuItem>
  )
}
