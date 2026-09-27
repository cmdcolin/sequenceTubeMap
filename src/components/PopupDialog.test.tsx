import { render, screen } from '@testing-library/react'
import { PopupDialog } from './PopupDialog.tsx'

describe('PopupDialog', () => {
  it('is named by its title', () => {
    render(
      <PopupDialog open close={() => {}} title="Link to data">
        body
      </PopupDialog>,
    )
    expect(
      screen.getByRole('dialog', { name: 'Link to data' }),
    ).toBeInTheDocument()
  })
})
