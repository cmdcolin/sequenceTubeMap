// Tests functionality without server

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import App from './App'
import { selectMuiOption, muiSelectValue } from './testUtils'
import type { fetchAndParse as FetchAndParse } from './fetchAndParse'
import type * as FetchAndParseModule from './fetchAndParse'

// SWR caches by key across renders; without a fresh provider per test, an
// errored fetch in one test leaks into the next and the new mock is never
// consulted. Each renderApp() call gets an isolated cache.
const renderApp = () =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <App />
    </SWRConfig>,
  )

type FetchAndParseFn = typeof FetchAndParse
type FetchAndParseArgs = Parameters<FetchAndParseFn>
type FetchAndParseReturn = ReturnType<FetchAndParseFn>

const MOCK_KEY = '__App.test.js_fetchAndParse_mock'
type GlobalWithMock = typeof globalThis & {
  [MOCK_KEY]?: (...args: FetchAndParseArgs) => FetchAndParseReturn
}

// We want to be able to replace the `fetchAndParse` that *other* files see,
// and we want to use *different* implementations for different tests in this
// file. We can mock it with vi.mock, but vi will move this call before the
// imports when running the tests, so we can't access any file-level variables
// in it. So we need to do some sneaky global trickery.
function setFetchAndParseMock(
  replacement: (...args: FetchAndParseArgs) => FetchAndParseReturn,
) {
  ;(globalThis as GlobalWithMock)[MOCK_KEY] = replacement
}

function clearFetchAndParseMock() {
  ;(globalThis as GlobalWithMock)[MOCK_KEY] = undefined
}

vi.mock('./fetchAndParse', async () => {
  const actual =
    await vi.importActual<typeof FetchAndParseModule>('./fetchAndParse')
  const fetchAndParseDispatcher = (
    ...args: FetchAndParseArgs
  ): FetchAndParseReturn => {
    const functionToUse =
      (globalThis as GlobalWithMock)[MOCK_KEY] ?? actual.fetchAndParse
    return functionToUse(...args)
  }
  return {
    __esModule: true,
    fetchAndParse: fetchAndParseDispatcher,
  }
})

// TODO: We won't need to do *any* of this if we actually get the ability to pass an API implementation into the app.

beforeEach(() => {
  vi.resetAllMocks()
  clearFetchAndParseMock()
})

const getRegionInput = () =>
  screen.getByRole<HTMLInputElement>('combobox', { name: /Region/i })

it('renders without crashing', () => {
  renderApp()
  expect(screen.getByAltText(/Logo/i)).toBeInTheDocument()
})

it('renders with error when api call to server throws', async () => {
  setFetchAndParseMock(() => {
    throw new Error('Mock Server Error')
  })
  renderApp()
  await waitFor(() => {
    expect(screen.getAllByText(/Mock Server Error/i)[0]).toBeInTheDocument()
  })
})

it('renders without crashing when sent bad fetch data from server', async () => {
  setFetchAndParseMock(async () => ({}))
  renderApp()

  await waitFor(() => {
    expect(screen.getAllByText(/Server did not/i)[0]).toBeInTheDocument()
  })
  await waitFor(() => {
    screen.getByText('Fetching remote data returned error')
  })
})

it('allows the data source to be changed', async () => {
  renderApp()
  const dataSelect = screen.getByTestId('dataSourceSelect')
  expect(muiSelectValue(dataSelect)).toEqual('snp1kg-BRCA1')

  await selectMuiOption(dataSelect, 'cactus')
  expect(muiSelectValue(dataSelect)).toEqual('cactus')

  await selectMuiOption(dataSelect, 'vg "small" example')
  expect(muiSelectValue(dataSelect)).toEqual('vg "small" example')
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
