// Tests functionality without server

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import App from './App.tsx'
import type { APIInterface } from './api/APIInterface.ts'

// A backend that answers everything with empty results, so nothing but the
// behavior under test moves. Individual tests override single methods.
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

// SWR caches by key across renders; without a fresh provider per test, an
// errored fetch in one test leaks into the next and the new fake is never
// consulted. Each renderApp() call gets an isolated cache.
const renderApp = (api: APIInterface = fakeAPI()) =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <App api={api} />
    </SWRConfig>,
  )

const getRegionInput = () =>
  screen.getByRole<HTMLInputElement>('combobox', { name: /Region/i })

it('renders without crashing', () => {
  renderApp()
  expect(screen.getByAltText('seqTubeMaps')).toBeInTheDocument()
})

it('renders with error when api call to server throws', async () => {
  renderApp(
    fakeAPI({
      getFilenames: () => {
        throw new Error('Mock Server Error')
      },
    }),
  )
  await waitFor(() => {
    expect(screen.getAllByText(/Mock Server Error/i)[0]).toBeInTheDocument()
  })
})

it('renders without crashing when sent bad fetch data from server', async () => {
  renderApp(fakeAPI({ getFilenames: async () => ({}) }))

  await waitFor(() => {
    expect(screen.getAllByText(/Server did not/i)[0]).toBeInTheDocument()
  })
  await waitFor(() => {
    screen.getByText('Fetching remote data returned error')
  })
})

it('offers a retry when the tube map data fails to load', async () => {
  let calls = 0
  renderApp(
    fakeAPI({
      getChunkedData: async () => {
        calls += 1
        throw new Error('Mock Chunk Error')
      },
    }),
  )

  await waitFor(() => {
    expect(screen.getByText(/Mock Chunk Error/i)).toBeInTheDocument()
  })
  expect(calls).toBe(1)

  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => {
    expect(calls).toBe(2)
  })
})

it('allows the data source to be changed', async () => {
  renderApp()
  expect(getRegionInput().value).toEqual('17:1-100')

  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))
  expect(getRegionInput().value).toEqual('ref:1-100')

  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'vg "small" example' }),
  )
  expect(getRegionInput().value).toEqual('x:1-100')
})

it('re-seeds the form when the backend is switched', async () => {
  renderApp()
  expect(getRegionInput().value).toEqual('17:1-100')

  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))
  expect(getRegionInput().value).toEqual('ref:1-100')

  // The backend selector switches the API mode, which resets the form to the
  // view target of the newly-selected backend.
  await userEvent.click(screen.getByText('Backend configuration'))
  await userEvent.click(screen.getByLabelText('Extract tube map data'))
  await userEvent.click(
    screen.getByRole('option', { name: /vgteam server/i }),
  )

  await waitFor(() => {
    expect(getRegionInput().value).toEqual('17:1-100')
  })
})

it('allows the start to be cleared', async () => {
  renderApp()
  expect(getRegionInput().value).toEqual('17:1-100')
  await userEvent.clear(getRegionInput())
  expect(getRegionInput().value).toEqual('')
})

it('allows the start to be changed', async () => {
  renderApp()
  expect(getRegionInput().value).toEqual('17:1-100')
  // TODO: {selectall} fake keystroke is glitchy and sometimes gets dropped or
  // eats the next keystroke. So we clear the field first.
  await userEvent.clear(getRegionInput())
  await userEvent.type(getRegionInput(), '17:200-300')
  expect(getRegionInput().value).toEqual('17:200-300')
})

it('enables "Manage tracks…" for a built-in dataset', async () => {
  renderApp()

  await userEvent.click(screen.getByTestId('fileMenuButton'))

  expect(screen.getByTestId('manageTracks')).not.toHaveAttribute(
    'aria-disabled',
  )
  await userEvent.click(screen.getByTestId('manageTracks'))
  expect(screen.getByTestId('TrackPicker')).toBeInTheDocument()
})

it('puts the committed view in the address bar', async () => {
  window.history.replaceState(null, '', '/')
  renderApp()

  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))

  await waitFor(() => {
    expect(window.location.search).toContain('region=ref%3A1-100')
  })
  expect(window.location.search).toContain('tracks[0][trackType]=graph')
})

describe('remembered preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes the legend and view options as they change', async () => {
    renderApp()
    expect(screen.getByText('Color legend')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('viewMenuButton'))
    await userEvent.click(screen.getByTestId('legendToggleMenuItem'))

    expect(localStorage.getItem('sequenceTubeMap.legendVisible')).toEqual(
      'false',
    )
    await waitFor(() => {
      expect(screen.queryByText('Color legend')).not.toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('menuitem', { name: /node labels/ }))
    expect(
      JSON.parse(localStorage.getItem('sequenceTubeMap.visOptions') ?? '{}'),
    ).toMatchObject({ showNodeLabels: true })
  })

  it('starts from what was written last time', () => {
    localStorage.setItem('sequenceTubeMap.legendVisible', 'false')
    localStorage.setItem(
      'sequenceTubeMap.visOptions',
      JSON.stringify({ showNodeLabels: true, removeRedundantNodes: false }),
    )
    renderApp()

    expect(screen.queryByText('Color legend')).not.toBeInTheDocument()
  })

  it('ignores a stored value it cannot use', () => {
    localStorage.setItem('sequenceTubeMap.legendVisible', 'not-a-boolean')
    localStorage.setItem('sequenceTubeMap.visOptions', '{"showReads": 7}')
    renderApp()

    // Falls back to the defaults rather than rendering nothing.
    expect(screen.getByText('Color legend')).toBeInTheDocument()
  })
})
