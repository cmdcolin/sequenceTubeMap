import React from 'react'
import {
  render,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { TrackPicker } from './TrackPicker'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { defaultTrackColors } from '../common.mjs'

function selectOption(container, value) {
  fireEvent.change(within(container).getByRole('combobox'), { target: { value } })
}

function openAutocomplete(container) {
  const input = within(container).getByRole('combobox')
  input.focus()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
}

describe('TrackPicker', () => {
  const tracks = {
    1: config.defaultTrackProps,
    2: config.defaultTrackProps,
    3: config.defaultTrackProps,
  }
  const availableColors = [
    'greys',
    'ygreys',
    'reds',
    'plainColors',
    'lightColors',
  ]
  const availableTracks = [
    { trackFile: 'fileA1.vg', trackType: 'graph' },
    { trackFile: 'fileA2.gbwt', trackType: 'haplotype' },
    { trackFile: 'fileB1.gbwt', trackType: 'haplotype' },
    { trackFile: 'fileB2.gam', trackType: 'read' },
    { trackFile: 'fileC1.xg', trackType: 'graph' },
  ]

  it('should render without errors', async () => {
    const fakeOnChange = vi.fn()
    const { queryByTestId } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
      />,
    )

    const trackPickerButton = queryByTestId('TrackPickerButton')

    expect(trackPickerButton).toBeTruthy()

    fireEvent.click(trackPickerButton)

    expect(queryByTestId('file-type-select-component1')).toBeTruthy()

    expect(queryByTestId('file-type-select-component2')).toBeTruthy()

    expect(queryByTestId('file-select-component1')).toBeTruthy()

    expect(queryByTestId('settings-button-component1')).toBeTruthy()

    expect(queryByTestId('delete-button-component1')).toBeTruthy()

    expect(queryByTestId('track-add-button-component')).toBeTruthy()
  })

  it('should add track items when the add button is pressed', async () => {
    const fakeOnChange = vi.fn()
    const { queryByTestId } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
      />,
    )

    fireEvent.click(queryByTestId('TrackPickerButton'))

    expect(queryByTestId('file-type-select-component4')).toBeFalsy()

    const addButtonComponent = queryByTestId('track-add-button-component')
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
    const { queryByTestId, getByText, rerender } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
      />,
    )

    fireEvent.click(queryByTestId('TrackPickerButton'))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    // select a file for all three track items

    // first track item
    openAutocomplete(queryByTestId('file-select-component1'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileA1.vg' }))

    // onChange should not be called
    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    // second track item
    selectOption(queryByTestId('file-type-select-component2'), 'haplotype')

    openAutocomplete(queryByTestId('file-select-component2'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileB1.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(0)

    // third track item
    openAutocomplete(queryByTestId('file-select-component3'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileC1.xg' }))

    let newTracks = JSON.parse(JSON.stringify(tracks))

    newTracks[1].trackFile = 'fileA1.vg'
    newTracks[1].trackType = 'graph'
    newTracks[1].trackColorSettings = defaultTrackColors('graph')
    newTracks[2].trackFile = 'fileB1.gbwt'
    newTracks[2].trackType = 'haplotype'
    newTracks[2].trackColorSettings = defaultTrackColors('haplotype')
    newTracks[3].trackFile = 'fileC1.xg'
    newTracks[3].trackType = 'graph'
    newTracks[3].trackColorSettings = defaultTrackColors('graph')

    expect(fakeOnChange).toHaveBeenCalledTimes(1)
    expect(fakeOnChange).toHaveBeenCalledWith(newTracks)

    // add a track item and select a file
    const addButtonComponent = queryByTestId('track-add-button-component')
    fireEvent.click(addButtonComponent)

    newTracks[4] = config.defaultTrackProps
    rerender(
      <TrackPicker
        tracks={newTracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
      />,
    )

    selectOption(queryByTestId('file-type-select-component4'), 'read')

    openAutocomplete(queryByTestId('file-select-component4'))
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
    const { queryByTestId, getByText, rerender } = render(
      <TrackPicker
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
      />,
    )

    // open popup
    fireEvent.click(queryByTestId('TrackPickerButton'))

    expect(queryByTestId('file-type-select-component1')).toBeTruthy()

    expect(queryByTestId('file-select-component1')).toBeTruthy()

    expect(queryByTestId('settings-button-component1')).toBeTruthy()

    // close popup
    fireEvent.click(queryByTestId('TrackPickerCloseButton'))

    await waitFor(() => {
      expect(queryByTestId('file-type-select-component1')).toBeFalsy()
    })
    expect(queryByTestId('file-select-component1')).toBeFalsy()
    expect(queryByTestId('settings-button-component1')).toBeFalsy()
  })
})
