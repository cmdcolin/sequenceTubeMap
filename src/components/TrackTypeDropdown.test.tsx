import { render } from '@testing-library/react'
import { TrackTypeDropdown } from './TrackTypeDropdown.tsx'
import { selectMuiOption } from '../testUtils.ts'

describe('TrackTypeDropdown', () => {
  it('calls the onChange callback handler', async () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <TrackTypeDropdown value="haplotype" onChange={onChange} />,
    )
    await selectMuiOption(getByTestId('file-type-select-component'), 'graph')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('graph')
  })
})
