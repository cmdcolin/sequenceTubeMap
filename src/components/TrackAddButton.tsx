import { Button } from 'reactstrap'
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
      aria-label="Add track"
      onClick={() => { onChange(); }}
      data-testid={testID}
      style={{ marginLeft: '25px', marginTop: '5px' }}
    >
      <FontAwesomeIcon icon={faPlus} />
    </Button>
  )
}

export default TrackAddButton
