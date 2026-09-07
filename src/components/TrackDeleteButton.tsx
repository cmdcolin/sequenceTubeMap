import type { ComponentProps } from 'react'
import Button from '@mui/material/Button'
import { faX } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

type TrackDeleteButtonProps = ComponentProps<typeof Button> & {
  testID?: string
}

/**
 * A track delete button component.
 * When clicked, calls a function to delete the track.
 */
export function TrackDeleteButton({
  testID = 'delete-button-component',
  ...rest
}: TrackDeleteButtonProps) {
  return (
    <Button
      variant="contained"
      size="small"
      aria-label="Delete track"
      data-testid={testID}
      {...rest}
    >
      <FontAwesomeIcon icon={faX} />
    </Button>
  )
}

export default TrackDeleteButton
