import type { ComponentProps } from 'react'
import Button from '@mui/material/Button'
import { Icon } from './Icon.tsx'
import { faX } from './icons.ts'

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
      aria-label="Delete track"
      data-testid={testID}
      {...rest}
    >
      <Icon icon={faX} />
    </Button>
  )
}

export default TrackDeleteButton
