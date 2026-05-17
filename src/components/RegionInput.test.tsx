import { render, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegionInput } from './RegionInput.tsx'
import type { RegionInfo } from '../Types.ts'

const handleRegionChangeMock = vi.fn()
const MOCK_REGIONS: RegionInfo = {
  chr: ['pathy', 'anotherPath', 'node', 'chr600'],
  chunk: ['', '', '', ''],
  desc: ['desc1', 'desc2', 'desc3', 'desc4'],
  start: ['1', '2', '3', '4'],
  end: ['10', '20', '30', '40'],
}
const INIT_REGION = ''
const makeRegionInput = (region: string) => (
  <RegionInput
    region={region}
    regionInfo={MOCK_REGIONS}
    handleRegionChange={handleRegionChangeMock}
  />
)
const renderMockRegion = () => render(makeRegionInput(INIT_REGION))

test('it renders expected options for given props', () => {
  renderMockRegion()

  const autocomplete = screen.getByTestId('autocomplete')
  const input = autocomplete.querySelector('input')!

  autocomplete.focus()
  fireEvent.click(input)
  fireEvent.keyDown(autocomplete, { key: 'ArrowDown' })

  expect(screen.getAllByRole('option')).toHaveLength(MOCK_REGIONS.chr!.length)
})

test('it calls handleRegionChange when region is changed with new region', async () => {
  const { rerender } = renderMockRegion()

  handleRegionChangeMock.mockImplementation((region: string) => {
    rerender(makeRegionInput(region))
  })

  const input = screen.getByRole<HTMLInputElement>('combobox', {
    name: /Region/i,
  })

  fireEvent.click(input)
  expect(input.value).toEqual(INIT_REGION)

  const NEW_REGION = 'newPath:0-10'
  await userEvent.clear(input)
  await userEvent.type(input, NEW_REGION)

  expect(handleRegionChangeMock).toHaveBeenLastCalledWith(NEW_REGION)
})
