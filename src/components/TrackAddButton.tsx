import Button from '@mui/material/Button'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

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
      size="small"
      aria-label="Add track"
      onClick={() => { onChange(); }}
      data-testid={testID}
      sx={{ ml: 3, mt: 1 }}
    >
      <FontAwesomeIcon icon={faPlus} />
    </Button>
  )
}

export default TrackAddButton
