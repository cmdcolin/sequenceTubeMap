import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PathsPanel from './PathsPanel.tsx'
import type { PathInfo } from '../Types.ts'

const PATHS: PathInfo[] = [
  { name: 'short', length: 100, cyclic: false },
  { name: 'huge', length: 50_000, cyclic: false },
  { name: 'offset', start: 1000, length: 10, cyclic: true },
]

interface RenderOptions {
  isOpen?: boolean
  readCounts?: Record<string, number>
}

function renderPanel(options: RenderOptions = {}) {
  const onLoadPath = vi.fn()
  const onCopyToRegion = vi.fn()
  const onToggle = vi.fn()
  render(
    <PathsPanel
      pathInfo={PATHS}
      readCounts={options.readCounts}
      onLoadPath={onLoadPath}
      onCopyToRegion={onCopyToRegion}
      isOpen={options.isOpen ?? true}
      onToggle={onToggle}
    />,
  )
  return { onLoadPath, onCopyToRegion, onToggle }
}

function rowFor(name: string) {
  return screen.getByRole('cell', { name }).closest('tr')!
}

it('loads a short path straight away', async () => {
  const { onLoadPath } = renderPanel()

  await userEvent.click(
    within(rowFor('short')).getByRole('button', { name: 'Load' }),
  )

  expect(onLoadPath).toHaveBeenCalledWith('short:0-99')
})

it('copies a path into the region field without loading it', async () => {
  const { onCopyToRegion, onLoadPath } = renderPanel()

  await userEvent.click(
    within(rowFor('offset cyclic')).getByRole('button', {
      name: 'Copy to region',
    }),
  )

  // The path fragment starts at 1000, so the region does too.
  expect(onCopyToRegion).toHaveBeenCalledWith('offset:1000-1009')
  expect(onLoadPath).not.toHaveBeenCalled()
})

it('asks before loading a path big enough to freeze the browser', async () => {
  const { onLoadPath } = renderPanel()

  await userEvent.click(
    within(rowFor('huge')).getByRole('button', { name: 'Load' }),
  )

  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('50,000 bp')
  expect(onLoadPath).not.toHaveBeenCalled()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(onLoadPath).not.toHaveBeenCalled()
  // The dialog hides the table from the accessibility tree until it is gone.
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  await userEvent.click(
    within(rowFor('huge')).getByRole('button', { name: 'Load' }),
  )
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Load anyway',
    }),
  )

  expect(onLoadPath).toHaveBeenCalledWith('huge:0-49999')
})

it('marks the paths whose size or coverage will bite', () => {
  renderPanel({ readCounts: { short: 5000, huge: 1 } })

  expect(
    within(rowFor('huge')).getByText('slow to load whole path'),
  ).toBeInTheDocument()
  expect(within(rowFor('short')).getByText('heavy')).toBeInTheDocument()
  expect(within(rowFor('huge')).queryByText('heavy')).not.toBeInTheDocument()
})
