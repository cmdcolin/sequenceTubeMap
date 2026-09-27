import Button from '@mui/material/Button'
import { Icon, type IconDefinition } from './Icon.tsx'

interface IconOnlyButtonProps {
  label: string
  icon: IconDefinition
  onClick: () => void
  disabled?: boolean
  id?: string
  testid?: string
}

// The span gives the icon a line box, so the button matches the height of
// text buttons instead of shrinking to the bare svg.
export function IconOnlyButton({
  label,
  icon,
  onClick,
  disabled,
  id,
  testid,
}: IconOnlyButtonProps) {
  return (
    <Button
      variant="contained"
      size="small"
      id={id}
      aria-label={label}
      title={label}
      data-testid={testid}
      sx={{ minWidth: 0, px: 1.25 }}
      disabled={disabled}
      onClick={() => {
        onClick()
      }}
    >
      <span>
        <Icon icon={icon} />
      </span>
    </Button>
  )
}

export default IconOnlyButton
