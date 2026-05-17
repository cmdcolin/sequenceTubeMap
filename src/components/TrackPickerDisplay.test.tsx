import { render, fireEvent, screen, within } from '@testing-library/react'
import { TrackPickerDisplay } from './TrackPickerDisplay.tsx'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { defaultTrackColors } from '../common.ts'
import { selectMuiOption } from '../testUtils.ts'
import type {
  AvailableTrack,
  ColorPaletteName,
  Tracks,
} from '../Types.ts'

function openAutocomplete(container: HTMLElement) {
  const input = within(container).getByRole('combobox')
  input.focus()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
}

describe('TrackPickerDisplay', () => {
  const tracks: Tracks = [
    config.defaultTrackProps,
    config.defaultTrackProps,
    config.defaultTrackProps,
  ]
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

  it('should render without errors', () => {
    const fakeOnChange = vi.fn()
    const { queryByTestId } = render(
      <TrackPickerDisplay
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(queryByTestId('file-type-select-component0')).toBeTruthy()
    expect(queryByTestId('file-type-select-component1')).toBeTruthy()
    expect(queryByTestId('file-select-component0')).toBeTruthy()
    expect(queryByTestId('settings-button-component0')).toBeTruthy()
    expect(queryByTestId('delete-button-component0')).toBeTruthy()
    expect(queryByTestId('track-add-button-component')).toBeTruthy()
  })

  it('should add track items when the add button is pressed', () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, queryByTestId } = render(
      <TrackPickerDisplay
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(queryByTestId('file-type-select-component3')).toBeFalsy()

    const addButtonComponent = getByTestId('track-add-button-component')
    fireEvent.click(addButtonComponent)

    expect(queryByTestId('file-type-select-component3')).toBeTruthy()
    expect(queryByTestId('file-select-component3')).toBeTruthy()
    expect(queryByTestId('settings-button-component3')).toBeTruthy()

    fireEvent.click(addButtonComponent)

    expect(queryByTestId('file-type-select-component4')).toBeTruthy()
    expect(queryByTestId('file-select-component4')).toBeTruthy()
    expect(queryByTestId('settings-button-component4')).toBeTruthy()
  })

  it('should call onChange when all files are selected', async () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, rerender } = render(
      <TrackPickerDisplay
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    openAutocomplete(getByTestId('file-select-component0'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileA1.vg' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    await selectMuiOption(
      getByTestId('file-type-select-component1'),
      'haplotype',
    )

    openAutocomplete(getByTestId('file-select-component1'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileB1.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    openAutocomplete(getByTestId('file-select-component2'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileC1.xg' }))

    const newTracks: Tracks = JSON.parse(JSON.stringify(tracks))

    newTracks[0]!.trackFile = 'fileA1.vg'
    newTracks[0]!.trackType = 'graph'
    newTracks[0]!.trackColorSettings = defaultTrackColors('graph')
    newTracks[1]!.trackFile = 'fileB1.gbwt'
    newTracks[1]!.trackType = 'haplotype'
    newTracks[1]!.trackColorSettings = defaultTrackColors('haplotype')
    newTracks[2]!.trackFile = 'fileC1.xg'
    newTracks[2]!.trackType = 'graph'
    newTracks[2]!.trackColorSettings = defaultTrackColors('graph')

    expect(fakeOnChange).toHaveBeenCalledTimes(1)

    const addButtonComponent = getByTestId('track-add-button-component')
    fireEvent.click(addButtonComponent)

    newTracks[3] = config.defaultTrackProps
    rerender(
      <TrackPickerDisplay
        tracks={newTracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    await selectMuiOption(getByTestId('file-type-select-component3'), 'read')

    openAutocomplete(getByTestId('file-select-component3'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileB2.gam' }))

    newTracks[3] = {
      trackFile: 'fileB2.gam',
      trackType: 'read',
      trackColorSettings: {
        mainPalette: 'blues',
        auxPalette: 'reds',
        colorReadsByMappingQuality: false,
        alphaReadsByMappingQuality: false,
      },
    }

    expect(fakeOnChange).toHaveBeenCalledTimes(2)
    expect(fakeOnChange).toHaveBeenCalledWith(newTracks)
  })

  it('should delete a trackitem when the delete button is pressed', () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, queryByTestId } = render(
      <TrackPickerDisplay
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    // After deleting index 0, remaining tracks shift: original [0,1,2] -> [1,2] -> rendered as [0,1]
    fireEvent.click(getByTestId('delete-button-component0'))
    expect(queryByTestId('file-type-select-component2')).toBeFalsy()
    expect(queryByTestId('file-select-component2')).toBeFalsy()

    // After deleting index 1 (the last remaining), only one track left
    fireEvent.click(getByTestId('delete-button-component1'))
    expect(queryByTestId('file-type-select-component1')).toBeFalsy()
    expect(queryByTestId('file-select-component1')).toBeFalsy()
  })
})
