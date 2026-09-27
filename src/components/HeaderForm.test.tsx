import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { selectMuiOption } from '../testUtils.ts'
import HeaderForm from './HeaderForm.tsx'
import type { APIInterface } from '../api/APIInterface.ts'
import type { RegionInfo, Tracks, ViewTarget } from '../Types.ts'

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
  goBack?: () => void
}

function renderForm(options: RenderOptions = {}) {
  const setCurrentViewTarget = vi.fn()
  // App spells out both flags on every view it holds, and the form's
  // "anything to apply?" check compares against them.
  const viewTarget: ViewTarget = options.viewTarget ?? {
    region: 'x:100-200',
    tracks: TRACKS,
    name: 'test data',
    dataType: 'built-in',
    simplify: false,
    removeSequences: false,
  }
  const api = options.api ?? fakeAPI()
  // A fresh SWR cache per test, so one test's fetches can't answer another's.
  const form = (seedViewTarget: ViewTarget | null) => (
    <SWRConfig value={{ provider: () => new Map() }}>
      <HeaderForm
        showExample={() => {}}
        legendTracks={undefined}
        setCurrentViewTarget={setCurrentViewTarget}
        currentViewTarget={viewTarget}
        seedViewTarget={seedViewTarget}
        goBack={options.goBack}
        goForward={undefined}
        APIInterface={api}
        onAPIMode={() => {}}
        serverModeId="server"
        loading={options.loading ?? false}
        onEscape={options.onEscape ?? (() => {})}
        visMenus={null}
      />
    </SWRConfig>
  )
  const { rerender } = render(form(null))
  return {
    setCurrentViewTarget,
    // What App does after Back/Forward or a switch of backend.
    reseed: (target: ViewTarget) => {
      rerender(form(target))
    },
  }
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

it("loads a picked data source with its own flags, not the last view's", async () => {
  const { setCurrentViewTarget } = renderForm({
    viewTarget: {
      region: 'x:100-200',
      tracks: TRACKS,
      dataType: 'mounted files',
      simplify: true,
      removeSequences: true,
    },
  })

  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))

  expect(setCurrentViewTarget).toHaveBeenLastCalledWith(
    expect.objectContaining({ simplify: false, removeSequences: false }),
  )
})

// Which backend an example needs is not in its name, so the menu says it by
// grouping: `.gbz.db` examples the browser reads itself first, the ones a vg
// server has to chunk after.
it('groups the datasets menu by the backend that reads each example', async () => {
  renderForm()
  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  const items = screen.getAllByRole('menuitem').map(item => item.textContent)

  expect(screen.getByText('In-browser (gbz-base .gbz.db)')).toBeVisible()
  expect(screen.getByText('Needs a vg server (.xg, .vg, .gbz)')).toBeVisible()
  expect(items.indexOf('snp1kg-BRCA1 (gbz-base)')).toBeLessThan(
    items.indexOf('cactus'),
  )
})

// In-browser mode hides the examples it cannot open, which leaves one group —
// and the heading is then what says why the list is short, so it stays.
it('labels the in-browser group when it is the only one', async () => {
  renderForm({ api: fakeAPI({ mode: 'local' }) })
  await userEvent.click(screen.getByTestId('examplesMenuButton'))

  expect(screen.getByText('In-browser (gbz-base .gbz.db)')).toBeVisible()
  expect(
    screen.queryByText('Needs a vg server (.xg, .vg, .gbz)'),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('menuitem', { name: 'cactus' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('menuitem', { name: 'cactus (gbz-base)' }),
  ).toBeInTheDocument()
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

describe('a BED chunk still loading', () => {
  const chunkTracks: Tracks = [{ trackType: 'graph', trackFile: 'chunk.vg' }]

  // The second BED region's tracks come from a chunk the backend has to cut
  // first, and each request waits until the test answers it.
  function renderChunkedForm() {
    const requests: { signal: AbortSignal | null; answer: () => void }[] = []
    const form = renderForm({
      viewTarget: { region: '', tracks: TRACKS, bedFile: 'regions.bed' },
      api: fakeAPI({
        getBedRegions: async () => ({
          bedRegions: { ...BED_REGIONS, chunk: ['', 'chunk-1', ''] },
        }),
        getChunkTracks: (_bed, _chunk, signal) =>
          new Promise(resolve => {
            requests.push({
              signal,
              answer: () => {
                resolve({ tracks: chunkTracks })
              },
            })
          }),
      }),
    })
    return { ...form, requests }
  }

  it('is dropped when the user picks another data source', async () => {
    const { setCurrentViewTarget, requests } = renderChunkedForm()
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await userEvent.click(screen.getByTestId('examplesMenuButton'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))

    await act(async () => {
      requests[0]!.answer()
    })

    expect(requests[0]!.signal?.aborted).toBe(true)
    expect(lastRegion(setCurrentViewTarget)).toEqual('ref:1-100')
  })

  it('is dropped when a view arrives from outside the form', async () => {
    const { setCurrentViewTarget, reseed, requests } = renderChunkedForm()
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    reseed({ region: 'y:10-20', tracks: TRACKS, bedFile: 'regions.bed' })

    await act(async () => {
      requests[0]!.answer()
    })

    expect(requests[0]!.signal?.aborted).toBe(true)
    expect(setCurrentViewTarget).not.toHaveBeenCalled()
  })
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

it('hands Back and Forward to the app, and disables the one it has no use for', async () => {
  const goBack = vi.fn()
  const { setCurrentViewTarget } = renderForm({ goBack })

  expect(screen.getByTestId('regionHistoryForward')).toBeDisabled()
  await userEvent.click(screen.getByTestId('regionHistoryBack'))

  expect(goBack).toHaveBeenCalledTimes(1)
  expect(setCurrentViewTarget).not.toHaveBeenCalled()
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

it('says inside Manage tracks when an upload is over the size limit', async () => {
  const putFile = vi.fn(async () => 'uploaded')
  renderForm({ api: fakeAPI({ putFile }) })
  await userEvent.click(screen.getByTestId('fileMenuButton'))
  await userEvent.click(screen.getByTestId('manageTracks'))
  const picker = screen.getByTestId('TrackPicker')
  await selectMuiOption(
    within(picker).getByTestId('picker-type-select-component0'),
    'upload',
  )
  const big = new File(['x'], 'big.vg')
  Object.defineProperty(big, 'size', { value: config.MAXUPLOADSIZE + 1 })

  await userEvent.upload(
    within(picker).getByLabelText('Upload a track file'),
    big,
  )

  expect(
    await within(picker).findByText(/big\.vg is larger than the 5 MB/),
  ).toBeInTheDocument()
  expect(putFile).not.toHaveBeenCalled()
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

  it('leaves shift+arrow alone while the synthetic examples show', async () => {
    const { setCurrentViewTarget } = renderForm()
    await userEvent.click(screen.getByTestId('examplesMenuButton'))
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Synthetic examples' }),
    )

    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')

    expect(setCurrentViewTarget).not.toHaveBeenCalled()
  })

  it('steps through BED regions with [ and ]', async () => {
    const { setCurrentViewTarget } = renderForm({
      viewTarget: { region: '', tracks: TRACKS, bedFile: 'regions.bed' },
      api: fakeAPI({
        getBedRegions: async () => ({ bedRegions: BED_REGIONS }),
      }),
    })
    await screen.findByRole('button', { name: 'Next' })

    await userEvent.keyboard(']')
    expect(lastRegion(setCurrentViewTarget)).toEqual('x:500-600')
  })

  it('stops [ and ] at the ends of the BED list', async () => {
    const { setCurrentViewTarget } = renderForm({
      viewTarget: { region: 'y:10-20', tracks: TRACKS, bedFile: 'regions.bed' },
      api: fakeAPI({
        getBedRegions: async () => ({ bedRegions: BED_REGIONS }),
      }),
    })
    await screen.findByRole('button', { name: 'Next' })

    await userEvent.keyboard(']')
    expect(setCurrentViewTarget).not.toHaveBeenCalled()

    // user-event reads a lone `[` as the start of a key descriptor.
    await userEvent.keyboard('[[')
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

describe('pending fetches', () => {
  it('names each control that is still waiting on its fetch', async () => {
    renderForm({
      viewTarget: {
        region: 'x:100-200',
        tracks: TRACKS,
        bedFile: 'regions.bed',
      },
      api: fakeAPI({
        getFilenames: () => new Promise(() => {}),
        getBedRegions: () => new Promise(() => {}),
        getPathInfo: () => new Promise(() => {}),
      }),
    })

    expect(await screen.findByText('Loading available files…')).toBeVisible()
    expect(screen.getByText('Loading regions from regions.bed…')).toBeVisible()
    expect(screen.getByText('Loading paths in graph.vg…')).toBeVisible()
  })

  it('says nothing once they have landed', async () => {
    renderForm()

    await waitFor(() => {
      expect(screen.queryByText(/^Loading /)).not.toBeInTheDocument()
    })
  })
})
