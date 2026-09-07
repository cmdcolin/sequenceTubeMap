import {
  render,
  fireEvent,
  waitFor,
  within,
  screen,
} from '@testing-library/react'
import { TrackListItem } from './TrackListItem.tsx'
import { selectMuiOption } from '../testUtils.ts'
import type {
  AvailableTrack,
  ColorPaletteName,
  ColorScheme,
} from '../Types.ts'

describe('TrackListItem', () => {
  const trackFile = undefined
  const trackType = 'graph'
  const availableColors: ColorPaletteName[] = [
    'greys',
    'ygreys',
    'reds',
    'plainColors',
    'lightColors',
  ]
  const availableTracks: AvailableTrack[] = [
    { trackFile: 'fileA1.vg', trackType: 'graph' },
    { trackFile: 'fileA2.gbwt', trackType: 'haplotype' },
    { trackFile: 'fileB1.gbwt', trackType: 'haplotype' },
    { trackFile: 'fileB2.gam', trackType: 'read' },
    { trackFile: 'fileC1.xg', trackType: 'graph' },
  ]
  const trackColorSettings: ColorScheme = {
    mainPalette: 'blues',
    auxPalette: 'reds',
    colorReadsByMappingQuality: false,
    alphaReadsByMappingQuality: false,
  }

  it('should render without errors', () => {
    const fakeOnChange = vi.fn()
    const fakeOnDelete = vi.fn()
    const { getByText, getByRole } = render(
      <TrackListItem apiMode="server"
        trackProps={{
          trackFile,
          trackType,
          trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(getByRole('button', { name: /Settings/i })).toBeTruthy()
    expect(getByText('graph')).toBeTruthy()
    expect(screen.getByPlaceholderText('Select a file')).toBeTruthy()
  })

  it('should call onChange correctly', async () => {
    const fakeOnChange = vi.fn()
    const fakeOnDelete = vi.fn()

    const { getByText, getByTestId, rerender } = render(
      <TrackListItem apiMode="server"
        trackProps={{
          trackFile,
          trackType,
          trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    await selectMuiOption(
      getByTestId('file-type-select-component1'),
      'haplotype',
    )

    expect(fakeOnChange).toHaveBeenCalledTimes(1)

    rerender(
      <TrackListItem apiMode="server"
        trackProps={{
          trackFile,
          trackType: 'haplotype',
          trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
        handleFileUpload={vi.fn()}
      />,
    )

    const fileSelectComponent = getByTestId('file-select-component1')
    const fileInput = within(fileSelectComponent).getByRole('combobox')
    fileInput.focus()
    fireEvent.keyDown(fileInput, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: 'fileB1.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(2)
    expect(fakeOnChange).toHaveBeenCalledWith(1, {
      trackFile: 'fileB1.gbwt',
      trackType: 'haplotype',
      trackColorSettings,
    })

    rerender(
      <TrackListItem apiMode="server"
        trackProps={{
          trackFile: 'fileB1.gbwt',
          trackType: 'haplotype',
          trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
        handleFileUpload={vi.fn()}
      />,
    )

    fireEvent.click(getByTestId('settings-button-component1'))
    await waitFor(() => getByText('reds'))
    fireEvent.click(getByText('reds'))
    fireEvent.click(document)

    expect(fakeOnChange).toHaveBeenCalledTimes(3)
  })

  it('should call onDelete correctly', () => {
    const fakeOnChange = vi.fn()
    const fakeOnDelete = vi.fn()
    const { getByTestId } = render(
      <TrackListItem apiMode="server"
        trackProps={{
          trackFile,
          trackType,
          trackColorSettings,
        }}
        availableColors={availableColors}
        availableTracks={availableTracks}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        trackID={1}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(fakeOnDelete).toHaveBeenCalledTimes(0)

    fireEvent.click(getByTestId('delete-button-component1'))
    expect(fakeOnDelete).toHaveBeenCalledTimes(1)
  })
})
