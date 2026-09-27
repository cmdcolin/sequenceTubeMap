import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReadGroupsPanel, { type ReadGroup } from './ReadGroupsPanel.tsx'

const GROUP: ReadGroup = {
  id: 'g1',
  name: 'Group 1',
  color: 'reds',
  reads: ['r1'],
}

function renderPanel(onRename: (id: string, name: string) => void) {
  const noop = () => {}
  return render(
    <ReadGroupsPanel
      groups={[GROUP]}
      otherReadsColor="greys"
      onSetActive={noop}
      onRename={onRename}
      onRecolor={noop}
      onDelete={noop}
      onRecolorOther={noop}
    />,
  )
}

describe('ReadGroupsPanel', () => {
  it('renames a group once, on blur, rather than per keystroke', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    renderPanel(onRename)
    const input = screen.getByRole('textbox', { name: 'Name for Group 1' })
    await user.clear(input)
    await user.type(input, 'Carriers')
    expect(onRename).not.toHaveBeenCalled()
    await user.tab()
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('g1', 'Carriers')
  })

  it('renames on Enter, and keeps the old name for a blank one', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    renderPanel(onRename)
    const input = screen.getByRole('textbox', { name: 'Name for Group 1' })
    await user.clear(input)
    await user.keyboard('{Enter}')
    expect(input).toHaveValue('Group 1')
    await user.type(input, 's{Enter}')
    expect(onRename).toHaveBeenCalledExactlyOnceWith('g1', 'Group 1s')
  })
})
