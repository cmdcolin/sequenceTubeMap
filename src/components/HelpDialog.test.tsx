import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpDialog } from './HelpDialog.tsx'

describe('HelpDialog', () => {
  it('opens from a text button and closes again', async () => {
    render(
      <HelpDialog title="Keyboard shortcuts" trigger={{ label: 'Shortcuts' }}>
        Press / to search
      </HelpDialog>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shortcuts' }))
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).toHaveTextContent('Press / to search')

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  // The info icon sits inside menu items, which act on any click they see
  it('opens from an info icon without clicking what contains it', async () => {
    const onParentClick = vi.fn()
    render(
      <div onClick={onParentClick}>
        <HelpDialog title="Compressed view">Squeezes the map</HelpDialog>
      </div>,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Compressed view help' }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Compressed view' }),
    ).toBeInTheDocument()
    expect(onParentClick).not.toHaveBeenCalled()
  })
})
