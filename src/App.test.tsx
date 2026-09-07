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
