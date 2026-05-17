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
          colorReadsByMappingQuality: false,
          alphaReadsByMappingQuality: false,
        }}
        setTrackColorSetting={() => {}}
      />,
    )

    await userEvent.click(screen.getByTestId('settings-button-component'))

    expect(screen.getByRole('heading')).toBeTruthy()

    await userEvent.click(screen.getByTestId('PopupDialogCloseButton'))

    await waitFor(() => {
      expect(screen.queryByRole('heading')).toBeFalsy()
    })
  })
})
