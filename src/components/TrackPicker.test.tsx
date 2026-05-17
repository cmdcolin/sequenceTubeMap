import {
  render,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { TrackPicker } from './TrackPicker.tsx'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { defaultTrackColors } from '../common.mjs'
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

describe('TrackPicker', () => {
  const tracks: Tracks = {
    1: config.defaultTrackProps,
    2: config.defaultTrackProps,
    3: config.defaultTrackProps,
  }
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
    const { getByTestId, queryByTestId } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    const trackPickerButton = getByTestId('TrackPickerButton')
    fireEvent.click(trackPickerButton)

    expect(queryByTestId('file-type-select-component1')).toBeTruthy()
    expect(queryByTestId('file-type-select-component2')).toBeTruthy()
    expect(queryByTestId('file-select-component1')).toBeTruthy()
    expect(queryByTestId('settings-button-component1')).toBeTruthy()
    expect(queryByTestId('delete-button-component1')).toBeTruthy()
    expect(queryByTestId('track-add-button-component')).toBeTruthy()
  })

  it('should add track items when the add button is pressed', () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, queryByTestId } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    fireEvent.click(getByTestId('TrackPickerButton'))

    expect(queryByTestId('file-type-select-component4')).toBeFalsy()

    const addButtonComponent = getByTestId('track-add-button-component')
    fireEvent.click(addButtonComponent)

    expect(queryByTestId('file-type-select-component4')).toBeTruthy()
    expect(queryByTestId('file-select-component4')).toBeTruthy()
    expect(queryByTestId('settings-button-component4')).toBeTruthy()

    fireEvent.click(addButtonComponent)

    expect(queryByTestId('file-type-select-component5')).toBeTruthy()
    expect(queryByTestId('file-select-component5')).toBeTruthy()
    expect(queryByTestId('settings-button-component5')).toBeTruthy()
  })

  it('should call onChange when all files are selected', async () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, rerender } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    fireEvent.click(getByTestId('TrackPickerButton'))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    openAutocomplete(getByTestId('file-select-component1'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileA1.vg' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    await selectMuiOption(
      getByTestId('file-type-select-component2'),
      'haplotype',
    )

    openAutocomplete(getByTestId('file-select-component2'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileB1.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    openAutocomplete(getByTestId('file-select-component3'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileC1.xg' }))

    const newTracks: Tracks = JSON.parse(JSON.stringify(tracks))

    newTracks[1]!.trackFile = 'fileA1.vg'
    newTracks[1]!.trackType = 'graph'
    newTracks[1]!.trackColorSettings = defaultTrackColors('graph')
    newTracks[2]!.trackFile = 'fileB1.gbwt'
    newTracks[2]!.trackType = 'haplotype'
    newTracks[2]!.trackColorSettings = defaultTrackColors('haplotype')
    newTracks[3]!.trackFile = 'fileC1.xg'
    newTracks[3]!.trackType = 'graph'
    newTracks[3]!.trackColorSettings = defaultTrackColors('graph')

    expect(fakeOnChange).toHaveBeenCalledTimes(1)
    expect(fakeOnChange).toHaveBeenCalledWith(newTracks)

    const addButtonComponent = getByTestId('track-add-button-component')
    fireEvent.click(addButtonComponent)

    newTracks[4] = config.defaultTrackProps
    rerender(
      <TrackPicker
        tracks={newTracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    await selectMuiOption(getByTestId('file-type-select-component4'), 'read')

    openAutocomplete(getByTestId('file-select-component4'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileB2.gam' }))

    newTracks[4] = {
      trackFile: 'fileB2.gam',
      trackType: 'read',
      trackColorSettings: defaultTrackColors('read'),
    }

    expect(fakeOnChange).toHaveBeenCalledTimes(2)
    expect(fakeOnChange).toHaveBeenCalledWith(newTracks)
  }, 50000)

  it('should close when the exit button is pressed', async () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, queryByTestId } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    fireEvent.click(getByTestId('TrackPickerButton'))

    expect(queryByTestId('file-type-select-component1')).toBeTruthy()
    expect(queryByTestId('file-select-component1')).toBeTruthy()
    expect(queryByTestId('settings-button-component1')).toBeTruthy()

    fireEvent.click(getByTestId('TrackPickerCloseButton'))

    await waitFor(() => {
      expect(queryByTestId('file-type-select-component1')).toBeFalsy()
    })
    expect(queryByTestId('file-select-component1')).toBeFalsy()
    expect(queryByTestId('settings-button-component1')).toBeFalsy()
  })
})
