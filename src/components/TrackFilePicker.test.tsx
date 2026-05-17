import { render, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrackFilePicker } from './TrackFilePicker.tsx'
import type { AvailableTrack } from '../Types.ts'

function openAutocomplete(component: HTMLElement) {
  const input = within(component).getByRole<HTMLInputElement>('combobox')
  input.focus()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  return input
}

describe('TrackFilePicker', () => {
  const testTracks: AvailableTrack[] = [
    { trackFile: 'fileA1.vg', trackType: 'graph' },
    { trackFile: 'fileA2.gbwt', trackType: 'haplotype' },
    { trackFile: 'fileB1.gbwt', trackType: 'haplotype' },
    { trackFile: 'fileB2.gam', trackType: 'read' },
    { trackFile: 'fileC1.xg', trackType: 'graph' },
  ]

  it('should render without errors', () => {
    const fakeOnChange = vi.fn()
    const { getByPlaceholderText } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType="graph"
        pickerType="mounted"
        handleInputChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(getByPlaceholderText('Select a file')).toBeTruthy()
  })

  it('should allow value to be controlled', () => {
    const fakeOnChange = vi.fn()
    const { getByDisplayValue, rerender } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType="graph"
        pickerType="mounted"
        value="fileA1.vg"
        handleInputChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(getByDisplayValue('fileA1.vg')).toBeTruthy()

    rerender(
      <TrackFilePicker
        tracks={testTracks}
        fileType="graph"
        pickerType="mounted"
        value="fileC1.xg"
        handleInputChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    expect(getByDisplayValue('fileC1.xg')).toBeTruthy()
  })

  it('should call onChange when an option is selected', async () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, findByRole } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType="haplotype"
        pickerType="mounted"
        handleInputChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    const fileSelectComponent = getByTestId('file-select-component')
    const input = openAutocomplete(fileSelectComponent)

    fireEvent.click(await findByRole('option', { name: 'fileB1.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(1)
    expect(fakeOnChange).toHaveBeenCalledWith('fileB1.gbwt')

    fireEvent.change(input, { target: { value: '' } })
    openAutocomplete(fileSelectComponent)
    fireEvent.click(await findByRole('option', { name: 'fileA2.gbwt' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(2)
    expect(fakeOnChange).toHaveBeenCalledWith('fileA2.gbwt')
  })

  it('should call onChange when queried by input value', async () => {
    const fakeOnChange = vi.fn()
    const { getByTestId, findByRole } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType="graph"
        pickerType="mounted"
        handleInputChange={fakeOnChange}
        handleFileUpload={vi.fn()}
      />,
    )

    const fileSelectComponent = getByTestId('file-select-component')
    const input = openAutocomplete(fileSelectComponent)

    fireEvent.change(input, { target: { value: 'fileC1' } })
    fireEvent.click(await findByRole('option', { name: 'fileC1.xg' }))

    expect(fakeOnChange).toHaveBeenCalledTimes(1)
    expect(fakeOnChange).toHaveBeenCalledWith('fileC1.xg')
  })

  it('should call handleFileUpload when a file is inputted', async () => {
    const fakeOnChange = vi.fn()
    const fakeHandleFileUpload = vi.fn()

    const { getByTestId } = render(
      <TrackFilePicker
        tracks={testTracks}
        fileType="graph"
        pickerType="upload"
        handleInputChange={fakeOnChange}
        handleFileUpload={fakeHandleFileUpload}
      />,
    )

    const fakeFile = new File(['example_data'], 'example.vg', {
      type: 'text/vg',
    })

    const fileSelectComponent = getByTestId(
      'file-select-component',
    ) as HTMLInputElement

    await userEvent.upload(fileSelectComponent, fakeFile)

    expect(fakeHandleFileUpload).toHaveBeenCalledTimes(1)
    expect(fileSelectComponent.files!.length).toBe(1)
    expect(fileSelectComponent.files![0]).toStrictEqual(fakeFile)
  })
})
