import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrackSettingsButton } from './TrackSettingsButton.tsx'

describe('TrackSettingsButton', () => {
  it('opens popup', async () => {
    render(
      <TrackSettingsButton
        fileType="graph"
        trackColorSettings={{
          mainPalette: 'blues',
          auxPalette: 'reds',
        }}
        setTrackColorSetting={() => {}}
        label="graph.vg"
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Color settings for graph.vg' }),
    )

    expect(
      screen.getByRole('dialog', { name: 'graph.vg colors' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading')).toBeTruthy()

    await userEvent.click(screen.getByTestId('PopupDialogCloseButton'))

    await waitFor(() => {
      expect(screen.queryByRole('heading')).toBeFalsy()
    })
  })
})
