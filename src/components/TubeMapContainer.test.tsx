import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TubeMapContainer, { subsampleReads } from './TubeMapContainer.tsx'
import type { TubeMapData } from './tubeMapData.ts'
import type { InputTrack } from '../util/tubemap.ts'
import type { ViewTarget, VisOptions } from '../Types.ts'

interface ReadMenu {
  readName: string
  x: number
  y: number
}

interface NodeMenu {
  nodeName: string
  readNames: string[]
  x: number
  y: number
}

interface CapturedMenus {
  read?: (menu: ReadMenu | null) => void
  node?: (menu: NodeMenu | null) => void
}

// The tube map hands the container its context menus through module-level
// callbacks, so the mock keeps the last ones registered and the tests fire
// them like the SVG would.
const mocks = vi.hoisted(() => {
  const menus: CapturedMenus = {}
  return { menus }
})

vi.mock('./TubeMap.tsx', () => ({
  default: () => <div data-testid="tubeMap" />,
}))

// The container only reaches for these four, and a full replacement keeps the
// 5,000-line drawing module out of the test.
vi.mock('../util/tubemap.ts', () => ({
  setInfoCallback: () => {},
  setReadContextMenuCallback: (cb: (menu: ReadMenu | null) => void) => {
    mocks.menus.read = cb
  },
  setNodeContextMenuCallback: (cb: (menu: NodeMenu | null) => void) => {
    mocks.menus.node = cb
  },
  getReadNamesThroughNodes: () => ['read1', 'read2'],
}))

const VIS_OPTIONS: VisOptions = {
  removeRedundantNodes: true,
  compressedView: false,
  transparentNodes: false,
  showNodeLabels: false,
  showReads: true,
  showSoftClips: true,
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
  colorSchemes: [],
  mappingQualityCutoff: 0,
  coarsenedReadView: false,
  ignoreStrand: false,
}

const VIEW_TARGET: ViewTarget = {
  region: 'x:1-100',
  tracks: [{ trackType: 'graph', trackFile: 'graph.vg' }],
}

function makeRead(index: number): InputTrack {
  return {
    id: index,
    name: `read${index}`,
    sequence: ['1'],
    sourceTrackID: 1,
  }
}

function makeData(readCount: number): TubeMapData {
  return {
    nodes: [{ name: '1', seq: 'ACGT' }],
    tracks: [],
    reads: Array.from({ length: readCount }, (_, i) => makeRead(i)),
    region: undefined,
    coloredNodes: undefined,
  }
}

interface RenderOptions {
  data?: TubeMapData
  error?: Error
  isValidating?: boolean
  viewTarget?: ViewTarget
  readRenderLimit?: number | null
  onRetry?: () => void
  onReadRenderLimitChange?: (limit: number | null) => void
}

function renderContainer(options: RenderOptions = {}) {
  const props = {
    viewTarget: options.viewTarget ?? VIEW_TARGET,
    dataOrigin: 'API',
    visOptions: VIS_OPTIONS,
    data: options.data,
    error: options.error,
    isValidating: options.isValidating ?? false,
    onRetry: options.onRetry ?? (() => {}),
    readRenderLimit:
      options.readRenderLimit === undefined ? 100 : options.readRenderLimit,
    onReadRenderLimitChange: options.onReadRenderLimitChange ?? (() => {}),
    legendVisible: false,
    onLegendClose: () => {},
  }
  const result = render(<TubeMapContainer {...props} />)
  return {
    ...result,
    rerenderWith: (next: Partial<RenderOptions>) => {
      result.rerender(
        <TubeMapContainer
          {...props}
          {...{
            ...next,
            viewTarget: next.viewTarget ?? props.viewTarget,
          }}
        />,
      )
    },
  }
}

describe('subsampleReads', () => {
  it('returns the input when it already fits', () => {
    expect(subsampleReads([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  it('takes a spread-out sample of the requested size', () => {
    const reads = Array.from({ length: 10 }, (_, i) => i)
    const sample = subsampleReads(reads, 5)
    expect(sample).toHaveLength(5)
    // Evenly strided rather than the first N, so the sample covers the region.
    expect(sample).toEqual([0, 2, 4, 6, 8])
  })

  it('never returns more than the limit', () => {
    expect(subsampleReads(Array.from({ length: 999 }, (_, i) => i), 7))
      .toHaveLength(7)
  })
})

describe('TubeMapContainer', () => {
  it('reports how many reads it is showing and lets the cap be changed', async () => {
    const onReadRenderLimitChange = vi.fn()
    renderContainer({ data: makeData(150), onReadRenderLimitChange })

    expect(screen.getByText(/Showing 100 of 150 reads/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '500' }))

    expect(onReadRenderLimitChange).toHaveBeenCalledWith(500)
    expect(screen.getByText(/Showing 150 of 150 reads/)).toBeInTheDocument()
  })

  it('hides the banner when every read is rendered anyway', () => {
    renderContainer({ data: makeData(10) })
    expect(screen.queryByText(/of 10 reads/)).not.toBeInTheDocument()
  })

  it('stages a read from its context menu and saves it as a group', async () => {
    renderContainer({ data: makeData(3) })

    act(() => {
      mocks.menus.read?.({ readName: 'read1', x: 20, y: 20 })
    })
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Read: read1')).toBeInTheDocument()

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Add to set' }),
    )

    expect(screen.getByText('Read set (1):')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Save as group/ }))

    expect(screen.getByText('Read coloring')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Group 1')).toBeInTheDocument()
    expect(screen.queryByText('Read set (1):')).not.toBeInTheDocument()
  })

  it('stages every read through a node from the node context menu', async () => {
    renderContainer({ data: makeData(3) })

    act(() => {
      mocks.menus.node?.({
        nodeName: '1',
        readNames: ['read1', 'read2'],
        x: 20,
        y: 20,
      })
    })
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: 'Add 2 reads through this node to read set',
      }),
    )

    expect(screen.getByText('Read set (2):')).toBeInTheDocument()
  })

  it('drops the per-region state when a different dataset is shown', async () => {
    const { rerenderWith } = renderContainer({ data: makeData(3) })

    act(() => {
      mocks.menus.read?.({ readName: 'read1', x: 20, y: 20 })
    })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add to set' }))
    expect(screen.getByText('Read set (1):')).toBeInTheDocument()

    rerenderWith({
      data: makeData(3),
      viewTarget: { ...VIEW_TARGET, region: 'x:200-300' },
    })

    expect(screen.queryByText('Read set (1):')).not.toBeInTheDocument()
  })

  it('offers a retry for a failed fetch', async () => {
    const onRetry = vi.fn()
    renderContainer({ error: new Error('Boom'), onRetry })

    expect(screen.getByText('Boom')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous map on screen behind a spinner while reloading', () => {
    renderContainer({ data: makeData(3), isValidating: true })

    expect(screen.getByTestId('tubeMap')).toBeInTheDocument()
    expect(screen.getByTestId('tubeMapLoadingOverlay')).toBeInTheDocument()
  })

  it('shows the loader in place of the map when nothing has loaded yet', () => {
    renderContainer({ isValidating: true })

    expect(screen.queryByTestId('tubeMap')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tubeMapLoadingOverlay')).not.toBeInTheDocument()
    expect(document.getElementById('loader')).not.toBeNull()
  })
})
