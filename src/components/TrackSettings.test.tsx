import { render, fireEvent } from '@testing-library/react'
import { TrackSettings } from './TrackSettings.tsx'
import type { ColorPaletteName, ColorScheme } from '../Types.ts'

describe('TrackSettings', () => {
  const availableColors: ColorPaletteName[] = [
    'greys',
    'ygreys',
    'blues',
    'reds',
    'plainColors',
    'lightColors',
  ]
  const trackColorSettings: ColorScheme = {
    mainPalette: 'blues',
    auxPalette: 'reds',
    colorReadsByMappingQuality: false,
    alphaReadsByMappingQuality: false,
  }

  it('should render without errors', () => {
    const fakeOnChange = vi.fn()
    const { getByText } = render(
      <TrackSettings
        fileType="haplotype"
        trackColorSettings={trackColorSettings}
        availableColors={availableColors}
        setTrackColorSetting={fakeOnChange}
      />,
    )

    expect(getByText('blues')).toBeTruthy()
  })

  it('should call onChange when an option is selected', () => {
    const fakeOnChange = vi.fn()
    const { getByLabelText } = render(
      <TrackSettings
        fileType="haplotype"
        trackColorSettings={trackColorSettings}
        availableColors={availableColors}
        setTrackColorSetting={fakeOnChange}
      />,
    )

    const redLabel = getByLabelText('reds')
    const greyLabel = getByLabelText('greyscale')

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    fireEvent.click(redLabel)
    expect(fakeOnChange).toHaveBeenCalledTimes(1)

    fireEvent.click(greyLabel)
    expect(fakeOnChange).toHaveBeenCalledTimes(2)
    expect(fakeOnChange).toHaveBeenCalledWith('mainPalette', 'greys')
  })

  it('should update the radio values when an option is selected', () => {
    const fakeOnChange = vi.fn()
    const { getByLabelText } = render(
      <TrackSettings
        fileType="haplotype"
        trackColorSettings={trackColorSettings}
        availableColors={availableColors}
        setTrackColorSetting={fakeOnChange}
      />,
    )

    const radio = getByLabelText('blues') as HTMLInputElement
    fireEvent.change(radio, { target: { value: 'reds' } })
    expect(radio.value).toBe('reds')
  })
})
