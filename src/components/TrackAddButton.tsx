import Button from '@mui/material/Button'
import { Icon } from './Icon.tsx'
import { faPlus } from './icons.ts'

interface TrackAddButtonProps {
  onChange: () => void
  testID?: string
}

// Component in TrackListDisplay, adds new track item into TrackList when pressed
export const TrackAddButton = ({
  onChange,
  testID = 'track-add-button-component',
}: TrackAddButtonProps) => {
  return (
    <Button
      variant="contained"
      aria-label="Add track"
      onClick={() => {
        onChange()
      }}
      data-testid={testID}
      sx={{ ml: 3, mt: 1 }}
    >
      <Icon icon={faPlus} />
    </Button>
  )
}

export default TrackAddButton
