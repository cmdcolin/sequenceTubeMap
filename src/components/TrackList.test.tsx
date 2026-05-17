import {
  render,
  fireEvent,
  waitFor,
  within,
  screen,
} from '@testing-library/react'
import { TrackList } from './TrackList.tsx'
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

describe('TrackList', () => {
  const tracks: Tracks = [
    {
      trackFile: undefined,
      trackType: 'graph',
      trackColorSettings: {
        mainPalette: 'blues',
        auxPalette: 'reds',
        colorReadsByMappingQuality: false,
        alphaReadsByMappingQuality: false,
      },
    },
    {
      trackFile: undefined,
      trackType: 'graph',
      trackColorSettings: {
        mainPalette: 'blues',
        auxPalette: 'reds',
        colorReadsByMappingQuality: false,
        alphaReadsByMappingQuality: false,
      },
    },
    {
      trackFile: undefined,
      trackType: 'graph',
      trackColorSettings: {
        mainPalette: 'blues',
        auxPalette: 'reds',
        colorReadsByMappingQuality: false,
        alphaReadsByMappingQuality: false,
      },
    },
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

  function rerenderTrackList(
    rerender: (ui: React.ReactElement) => void,
    newTracks: Tracks,
    fakeOnChange: (trackID: number, newTrack: import('../Types.ts').Track) => void,
    fakeOnDelete: (trackID: number) => void,
  ) {
    rerender(
      <TrackList
        tracks={newTracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        handleFileUpload={vi.fn()}
      />,
    )
  }

  it('should render without errors', () => {
    const fakeOnChange = vi.fn()
    const fakeOnDelete = vi.fn()
    const { getByTestId } = render(
      <TrackList
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(getByTestId('file-type-select-component0')).toBeTruthy()
    expect(getByTestId('file-type-select-component1')).toBeTruthy()
    expect(getByTestId('file-select-component0')).toBeTruthy()
    expect(getByTestId('settings-button-component0')).toBeTruthy()
    expect(getByTestId('delete-button-component0')).toBeTruthy()
  })

  it('should call onChange when a track is changed', async () => {
    const fakeOnChange = vi.fn()
    const fakeOnDelete = vi.fn()
    const { getByTestId, getByText, rerender } = render(
      <TrackList
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange}
        onDelete={fakeOnDelete}
        handleFileUpload={vi.fn()}
      />,
    )

    await selectMuiOption(
      getByTestId('file-type-select-component0'),
      'haplotype',
    )

    expect(fakeOnChange).toHaveBeenCalledTimes(1)
    // onChange is now (trackID, newTrack), so we check the call args
    expect(fakeOnChange).toHaveBeenCalledWith(0, expect.objectContaining({ trackType: 'haplotype' }))

    const newTracks: Tracks = JSON.parse(JSON.stringify(tracks))
    newTracks[0]!.trackType = 'haplotype'
    rerenderTrackList(rerender, newTracks, fakeOnChange, fakeOnDelete)

    openAutocomplete(getByTestId('file-select-component0'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileB1.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(2)
    expect(fakeOnChange).toHaveBeenCalledWith(0, expect.objectContaining({ trackFile: 'fileB1.gbwt', trackType: 'haplotype' }))

    newTracks[0]!.trackFile = 'fileB1.gbwt'
    rerenderTrackList(rerender, newTracks, fakeOnChange, fakeOnDelete)

    fireEvent.click(getByTestId('settings-button-component0'))
    await waitFor(() => getByText('reds'))
    fireEvent.click(getByText('reds'))
    fireEvent.click(document)

    expect(fakeOnChange).toHaveBeenCalledTimes(3)
    expect(fakeOnChange).toHaveBeenCalledWith(0, expect.objectContaining({ trackColorSettings: expect.objectContaining({ mainPalette: 'reds' }) }))
  })

  it('should use a new event handler when passed', async () => {
    const fakeOnChange1 = vi.fn()
    const fakeOnChange2 = vi.fn()
    const fakeOnDelete = vi.fn()
    const { getByTestId, rerender } = render(
      <TrackList
        tracks={tracks}
        availableTracks={availableTracks}
        availableColors={availableColors}
        onChange={fakeOnChange1}
        onDelete={fakeOnDelete}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(fakeOnChange1).toHaveBeenCalledTimes(0)

    rerenderTrackList(rerender, tracks, fakeOnChange2, fakeOnDelete)

    openAutocomplete(getByTestId('file-select-component0'))
    fireEvent.click(await screen.findByRole('option', { name: 'fileA1.vg' }))

    expect(fakeOnChange1).toHaveBeenCalledTimes(0)
    expect(fakeOnChange2).toHaveBeenCalledTimes(1)
  })
})
