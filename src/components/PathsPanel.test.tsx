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
  paths?: PathInfo[]
}

function renderPanel(options: RenderOptions = {}) {
  const onLoadPath = vi.fn()
  const onCopyToRegion = vi.fn()
  const onToggle = vi.fn()
  render(
    <PathsPanel
      pathInfo={options.paths ?? PATHS}
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
    within(rowFor('offset cyclic from 1,000')).getByRole('button', {
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

// A contig split into fragments arrives as one row per fragment under the same
// name — HPRC v2.1's 292 indexed paths carry only 219 distinct names, eleven of
// them CHM13#chr2 — so the offset has to be on screen and each Load has to
// carry its own.
it('tells fragments of one contig apart by their offset', async () => {
  const { onLoadPath } = renderPanel({
    paths: [
      { name: 'CHM13#chr2', start: 0, length: 100, cyclic: false },
      { name: 'CHM13#chr2', start: 5000, length: 200, cyclic: false },
    ],
  })

  const rows = screen.getAllByRole('row')
  expect(rows).toHaveLength(3)

  await userEvent.click(
    within(rowFor('CHM13#chr2 from 5,000')).getByRole('button', {
      name: 'Load',
    }),
  )

  expect(onLoadPath).toHaveBeenCalledWith('CHM13#chr2:5000-5199')
})

it('marks the paths whose size or coverage will bite', () => {
  renderPanel({ readCounts: { short: 5000, huge: 1 } })

  expect(
    within(rowFor('huge')).getByText('slow to load whole path'),
  ).toBeInTheDocument()
  expect(within(rowFor('short')).getByText('heavy')).toBeInTheDocument()
  expect(within(rowFor('huge')).queryByText('heavy')).not.toBeInTheDocument()
})
