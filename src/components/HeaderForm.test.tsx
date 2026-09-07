import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import HeaderForm from './HeaderForm.tsx'
import type { APIInterface } from '../api/APIInterface.ts'
import type { RegionInfo, ViewTarget } from '../Types.ts'

const TRACKS: ViewTarget['tracks'] = [
  { trackType: 'graph', trackFile: 'graph.vg' },
]

const BED_REGIONS: RegionInfo = {
  chr: ['x', 'x', 'y'],
  start: ['1', '500', '10'],
  end: ['100', '600', '20'],
  desc: ['first', 'second', 'third'],
  chunk: ['', '', ''],
}

function fakeAPI(overrides: Partial<APIInterface> = {}): APIInterface {
  return {
    mode: 'server',
    getChunkedData: async () => ({}),
    getFilenames: async () => ({ files: [], bedFiles: [] }),
    subscribeToFilenameChanges: () => () => {},
    putFile: async () => 'uploaded',
    getBedRegions: async () => ({}),
    getPathNames: async () => ({ pathNames: [] }),
    getPathInfo: async () => ({ pathInfo: [] }),
    getChunkTracks: async () => ({}),
    ...overrides,
  }
}

interface RenderOptions {
  api?: APIInterface
  viewTarget?: ViewTarget
  loading?: boolean
  onEscape?: () => void
}

function renderForm(options: RenderOptions = {}) {
  const setCurrentViewTarget = vi.fn()
  // Committed targets always go through makeViewTarget, so the flags are set
  // rather than undefined; the form's "anything to apply?" check compares
  // against them.
  const viewTarget: ViewTarget = options.viewTarget ?? {
    region: 'x:100-200',
    tracks: TRACKS,
    name: 'test data',
    dataType: 'built-in',
    simplify: false,
    removeSequences: false,
  }
  // A fresh SWR cache per test, so one test's fetches can't answer another's.
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <HeaderForm
        showExample={() => {}}
        setCurrentViewTarget={setCurrentViewTarget}
        currentViewTarget={viewTarget}
        APIInterface={options.api ?? fakeAPI()}
        onAPIMode={() => {}}
        serverModeId="server"
        loading={options.loading ?? false}
        onEscape={options.onEscape ?? (() => {})}
        visMenus={null}
      />
    </SWRConfig>,
  )
  return { setCurrentViewTarget }
}

const regionInput = () =>
  screen.getByRole<HTMLInputElement>('combobox', { name: /Region/i })

const lastRegion = (mock: ReturnType<typeof vi.fn>) => {
  const target = mock.mock.calls.at(-1)?.[0] as ViewTarget | undefined
  return target?.region
}

it('loads a data source picked from the datasets menu', async () => {
  const { setCurrentViewTarget } = renderForm()
  expect(regionInput().value).toEqual('x:100-200')

  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))

  expect(regionInput().value).toEqual('ref:1-100')
  expect(lastRegion(setCurrentViewTarget)).toEqual('ref:1-100')
})

it('derives the region from the first BED entry when the dataset has none', async () => {
  renderForm({
    viewTarget: { region: '', tracks: TRACKS, bedFile: 'regions.bed' },
    api: fakeAPI({ getBedRegions: async () => ({ bedRegions: BED_REGIONS }) }),
  })

  await waitFor(() => {
    expect(regionInput().value).toEqual('x:1-100')
  })
})

it('walks the BED regions with Prev and Next', async () => {
  const { setCurrentViewTarget } = renderForm({
    viewTarget: { region: '', tracks: TRACKS, bedFile: 'regions.bed' },
    api: fakeAPI({ getBedRegions: async () => ({ bedRegions: BED_REGIONS }) }),
  })

  const next = await screen.findByRole('button', { name: 'Next' })
  const prev = screen.getByRole('button', { name: 'Prev' })
  // The first region is showing, so there is nothing before it.
  expect(prev).toBeDisabled()

  await userEvent.click(next)
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:500-600')

  await waitFor(() => {
    expect(regionInput().value).toEqual('x:500-600')
  })
  expect(screen.getByRole('button', { name: 'Prev' })).toBeEnabled()
})

it('shifts and rescales the region, one commit per click', async () => {
  const { setCurrentViewTarget } = renderForm()

  await userEvent.click(screen.getByTestId('shiftRegionRight'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:150-250')

  // Widening keeps the window centred: 100 bp around 200 becomes 200 bp.
  await userEvent.click(screen.getByTestId('widenRegion'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:100-300')

  await userEvent.click(screen.getByTestId('narrowRegion'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:150-250')

  await userEvent.click(screen.getByTestId('shiftRegionRight'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:200-300')
})

it('clamps a shifted region at the start of the contig', async () => {
  const { setCurrentViewTarget } = renderForm({
    viewTarget: {
      region: 'x:20-120',
      tracks: TRACKS,
      dataType: 'built-in',
      simplify: false,
      removeSequences: false,
    },
  })

  await userEvent.click(screen.getByTestId('shiftRegionLeft'))

  expect(lastRegion(setCurrentViewTarget)).toEqual('x:0-100')
})

it('walks committed views with Back and Forward', async () => {
  const { setCurrentViewTarget } = renderForm()

  expect(screen.getByTestId('regionHistoryBack')).toBeDisabled()
  expect(screen.getByTestId('regionHistoryForward')).toBeDisabled()

  await userEvent.click(screen.getByTestId('shiftRegionRight'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:150-250')

  await userEvent.click(screen.getByTestId('regionHistoryBack'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:100-200')
  expect(screen.getByTestId('regionHistoryBack')).toBeDisabled()

  await userEvent.click(screen.getByTestId('regionHistoryForward'))
  expect(lastRegion(setCurrentViewTarget)).toEqual('x:150-250')
})

it('refuses to commit a malformed region', async () => {
  const { setCurrentViewTarget } = renderForm()

  await userEvent.clear(regionInput())
  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()

  // Go is disabled for an unusable region, so submit from the input instead
  // (Escape first, so Enter isn't taken by the autocomplete popup).
  await userEvent.type(regionInput(), 'nonsense{Escape}{Enter}')

  expect(setCurrentViewTarget).not.toHaveBeenCalled()
  expect(screen.getByText(/is missing or malformed/)).toBeInTheDocument()
})

it('disables Go until the form describes something new', async () => {
  renderForm()

  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()

  await userEvent.clear(regionInput())
  await userEvent.type(regionInput(), 'x:300-400')

  expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled()
})

it('shows a spinner on Go while the committed view loads', () => {
  renderForm({ loading: true })

  const go = screen.getByRole('button', { name: 'Go' })
  expect(go).toBeDisabled()
  expect(go).toHaveAttribute('title', 'Loading the current view…')
})

it('shows every live error at once', async () => {
  renderForm({
    viewTarget: { region: 'x:1-100', tracks: TRACKS, bedFile: 'regions.bed' },
    api: fakeAPI({
      getFilenames: () => {
        throw new Error('Filenames exploded')
      },
      getBedRegions: () => {
        throw new Error('BED exploded')
      },
    }),
  })

  await waitFor(() => {
    expect(screen.getByText('Filenames exploded')).toBeInTheDocument()
  })
  expect(screen.getByText('BED exploded')).toBeInTheDocument()
})

describe('keyboard shortcuts', () => {
  it('focuses the region input on /', async () => {
    renderForm()

    await userEvent.keyboard('/')

    expect(regionInput()).toHaveFocus()
  })

  it('shifts the region with shift+arrow', async () => {
    const { setCurrentViewTarget } = renderForm()

    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')

    expect(lastRegion(setCurrentViewTarget)).toEqual('x:150-250')
  })

  it('steps through BED regions with [ and ]', async () => {
    const { setCurrentViewTarget } = renderForm({
      viewTarget: { region: '', tracks: TRACKS, bedFile: 'regions.bed' },
      api: fakeAPI({ getBedRegions: async () => ({ bedRegions: BED_REGIONS }) }),
    })
    await screen.findByRole('button', { name: 'Next' })

    await userEvent.keyboard(']')
    expect(lastRegion(setCurrentViewTarget)).toEqual('x:500-600')
  })

  it('reports Escape to the app', async () => {
    const onEscape = vi.fn()
    renderForm({ onEscape })

    await userEvent.keyboard('{Escape}')

    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('leaves keystrokes aimed at a text field alone', async () => {
    const onEscape = vi.fn()
    const { setCurrentViewTarget } = renderForm({ onEscape })

    regionInput().focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')

    expect(setCurrentViewTarget).not.toHaveBeenCalled()
  })
})
