// Tests functionality without server

import React from 'react'
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

import { fetchAndParse } from './fetchAndParse'

// We want to be able to replace the `fetchAndParse` that *other* files see,
// and we want to use *different* implementations for different tests in this
// file. We can mock it with Jest, but Jest will move this call before the
// imports when running the tests, so we can't access any file-level variables
// in it. So we need to do some sneaky global trickery.

// Register the given replacement function to be called instead of fetchAndParse.
function setFetchAndParseMock(replacement) {
  globalThis['__App.test.js_fetchAndParse_mock'] = replacement
}

// Remove any replacement function and go back to the real fetchAndParse.
function clearFetchAndParseMock() {
  globalThis['__App.test.js_fetchAndParse_mock'] = undefined
}

vi.mock('./fetchAndParse', async () => {
  const actual = await vi.importActual('./fetchAndParse')
  function fetchAndParseDispatcher(...args) {
    const { fetchAndParse } = actual
    const functionToUse =
      globalThis['__App.test.js_fetchAndParse_mock'] ?? fetchAndParse
    return functionToUse.apply(this, args)
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

const getRegionInput = () => {
  // Helper function to select the Region input box
  return screen.getByRole('combobox', { name: /Region/i })
}
it('renders without crashing', () => {
  render(<App />)
  expect(screen.getByAltText(/Logo/i)).toBeInTheDocument()
})

it('renders with error when api call to server throws', async () => {
  setFetchAndParseMock(() => {
    throw new Error('Mock Server Error')
  })
  render(<App />)
  await waitFor(() => {
    expect(screen.getAllByText(/Mock Server Error/i)[0]).toBeInTheDocument()
  })
})

it('renders without crashing when sent bad fetch data from server', async () => {
  setFetchAndParseMock(() => ({}))
  render(<App />)

  await waitFor(() => {
    // TODO: display multiple errors in HeaderForm.js if there are more than one.
    // All of the default errors should start with "Server did not..." so we look for that.
    expect(screen.getAllByText(/Server did not/i)[0]).toBeInTheDocument()
  })
  await waitFor(() => {
    // TubeMapContainer will display this error as default.
    screen.getByText('Fetching remote data returned error')
  })
})

it('allows the data source to be changed', async () => {
  render(<App />)
  const dataSelect = within(screen.getByTestId('dataSourceSelect')).getByRole(
    'combobox',
  )
  expect(dataSelect.textContent).toEqual('snp1kg-BRCA1')

  fireEvent.mouseDown(dataSelect)
  fireEvent.click(await screen.findByRole('option', { name: 'cactus' }))
  expect(dataSelect.textContent).toEqual('cactus')

  fireEvent.mouseDown(dataSelect)
  fireEvent.click(
    await screen.findByRole('option', { name: 'vg "small" example' }),
  )
  expect(dataSelect.textContent).toEqual('vg "small" example')
})

it('allows the start to be cleared', async () => {
  render(<App />)
  expect(getRegionInput().value).toEqual('17:1-100')
  await userEvent.clear(getRegionInput())
  expect(getRegionInput().value).toEqual('')
})

it('allows the start to be changed', async () => {
  // Test that after inputting a value not in the bed regions, it still updates
  render(<App />)
  expect(getRegionInput().value).toEqual('17:1-100')
  // TODO: {selectall} fake keystroke is glitchy and sometimes gets dropped or
  // eats the next keystroke. So we clear the field first.
  await userEvent.clear(getRegionInput())
  await userEvent.type(getRegionInput(), '17:200-300')
  expect(getRegionInput().value).toEqual('17:200-300')
})
