import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrackDeleteButton } from './TrackDeleteButton'

describe('TrackDeleteButton', () => {
  it('calls onClick', async () => {
    const onClick = vi.fn()
    render(<TrackDeleteButton onClick={onClick} />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
