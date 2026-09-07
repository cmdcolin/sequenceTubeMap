// End to end tests that test the frontend against a backend over HTTP

// Use port 0 so the OS assigns a free port, avoiding conflicts with dev server.
process.env.SERVER_PORT = '0'

// Normal import doesn't work here; something to do with the multiple
// not-really-standard implementations of JS modules in play. So we import the
// server's start function and put it in an object pretendign to be a module.
import { start } from './server.mjs'
import fs from 'fs-extra'
import { vg_available } from './vg.mjs'
const server = { start }

import React from 'react'
// testing-library provides a render() that auto-cleans-up from the global DOM.
import {
  render,
  fireEvent,
  getByTestId,
  screen,
  waitFor,
  act,
} from '@testing-library/react'
import { setCopyCallback, writeToClipboard } from './components/CopyLink.tsx'
import userEvent from '@testing-library/user-event'
import App from './App.tsx'
import { selectMuiOption } from './testUtils.ts'

const getRegionInput = () => {
  // Helper function to select the Region input box
  return screen.getByRole('combobox', { name: /Region/i })
}

async function selectExample(name) {
  await act(async () => {
    fireEvent.click(screen.getByTestId('examplesMenuButton'))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name }))
  })
}
// This holds the running server for the duration of each test.
let serverState = undefined

// This holds the root element of the app
const root = undefined

// Mock clipboard (string)
let fakeClipboard = undefined

// This needs to be called by global and per-scope beforeEach
async function setUp() {
  setCopyCallback(value => (fakeClipboard = value))
  // Create the application.
  render(<App apiUrl={serverState.getApiUrl()} />)
}

// This needs to be called by global and per-scope afterEach
// Any mutations of the server (e.g. file uploads)
// or globals (e.g. the clipboard) should be undone here.
async function tearDown() {
  setCopyCallback(writeToClipboard)
}

beforeEach(async () => {
  await setUp()
})

afterEach(async () => {
  await tearDown()
})

// Starting the server once per test run will speed up tests
beforeAll(async () => {
  serverState = await server.start()
})

afterAll(async () => {
  try {
    // Shut down the server
    await serverState.close()
    serverState = undefined
  } catch (e) {
    console.error(e)
  }
})

// Wait for the loading throbber to appear
async function waitForLoadStart() {
  return new Promise((resolve, reject) => {
    function waitAround() {
      const loader = document.getElementById('loader')
      if (!loader) {
        setTimeout(waitAround, 100)
      } else {
        resolve()
      }
    }
    waitAround()
  })
}

// Wait for the loading throbber to disappear
async function waitForLoadEnd() {
  return new Promise((resolve, reject) => {
    function waitAround() {
      const loader = document.getElementById('loader')
      if (loader) {
        setTimeout(waitAround, 100)
      } else {
        resolve()
      }
    }
    waitAround()
  })
}

// Wait for the upload throbber to appear
async function waitForUploadStart() {
  return new Promise((resolve, reject) => {
    function waitAround() {
      const loaders = document.getElementsByClassName('upload-in-progress')
      if (loaders.length == 0) {
        setTimeout(waitAround, 100)
      } else {
        resolve()
      }
    }
    waitAround()
  })
}

// Wait for the upload throbber to disappear
async function waitForUploadEnd() {
  return new Promise((resolve, reject) => {
    function waitAround() {
      const loaders = document.getElementsByClassName('upload-in-progress')
      if (loaders.length > 0) {
        setTimeout(waitAround, 100)
      } else {
        resolve()
      }
    }
    waitAround()
  })
}

async function clickCopyLink() {
  // Click copy link button to test clipboard
  await act(async () => {
    const copyButton = document.getElementById('copyLinkButton')
    await userEvent.click(copyButton)
  })
}
function clickGoButton() {
  // Press go
  act(() => {
    const go = document.getElementById('goButton')
    userEvent.click(go)
  })
}

it('initially renders as loading', () => {
  const loader = document.getElementById('loader')
  expect(loader).toBeTruthy()
})

it('populates the available example dropdown', async () => {
  // Default region reflects the default data source (snp1kg-BRCA1)
  expect(getRegionInput().value).toContain('17:1-100')
  // Opening the Examples menu reveals all data sources
  await act(async () => {
    fireEvent.click(screen.getByTestId('examplesMenuButton'))
  })
  expect(
    await screen.findByRole('menuitem', { name: 'cactus' }),
  ).toBeInTheDocument()
  // Close the menu
  fireEvent.keyDown(document.activeElement, { key: 'Escape' })
})

describe('When we wait for it to load', () => {
  beforeEach(async () => {
    // Wait for the loader to go away the new way.
    // See https://jasmine.github.io/2.0/upgrading.html#section-9
    // Note that Jest imposes a 5000 ms timeout for being done.
    await waitForLoadEnd()
  })

  it('eventually stops rendering as loading', () => {
    const loader = document.getElementById('loader')
    expect(loader).toBeFalsy()
  })

  it('does not reload if we click the go button without changing settings', () => {
    let loader = document.getElementById('loader')
    expect(loader).toBeFalsy()

    act(() => {
      const go = document.getElementById('goButton')
      userEvent.click(go)
    })

    loader = document.getElementById('loader')
    expect(loader).toBeFalsy()
  })

  it('the regions from the BED files are loaded', async () => {
    await act(async () => {
      await userEvent.click(getRegionInput())
    })
    // BED regions load asynchronously after the graph, so use findByText to poll
    await screen.findByText('17:1-100 17_1_100')
  })
  it('the region options in autocomplete are cleared after selecting new data', async () => {
    await selectExample('vg "small" example')
    const regionInput = getRegionInput()
    await act(async () => {
      userEvent.click(getRegionInput())
    })
    // Make sure that old option in RegionInput dropdown (17_...) is not visible
    expect(screen.queryByText('1-100 17_1_100')).not.toBeInTheDocument()
    await act(async () => {
      userEvent.click(regionInput)
    })
  })
  it('draws an SVG for synthetic data example 1', async () => {
    await selectExample('Synthetic examples')

    await act(async () => {
      const example1 = document.getElementById('example1')
      await userEvent.click(example1)
    })

    // We're agnostic as to whether we will see a loader when rendering the
    // example data.

    await waitForLoadEnd()

    const svg = document.getElementById('svg')
    expect(svg).toBeTruthy()
  })

  it.skipIf(!vg_available())('draws the right SVG for vg "small"', async () => {
    await selectExample('vg "small" example')
    const autocomplete = screen.getByTestId('autocomplete')
    const input = autocomplete.querySelector('input')

    await userEvent.clear(input)

    // Input region
    // using fireEvent because userEvent has no change
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'node:1+10' } })
    expect(input.value).toBe('node:1+10')
    fireEvent.keyDown(autocomplete, { key: 'Enter' })

    // Wait for rendered response
    await waitFor(() => screen.getByTestId('autocomplete'))

    // Click go
    const go = document.getElementById('goButton')
    await userEvent.click(go)

    const loader = document.getElementById('loader')
    expect(loader).toBeTruthy()

    await waitForLoadEnd()

    // See if correct svg rendered. The custom hover-tooltip replaced the
    // native <svg:title> elements that used to live on every node and track
    // shape, so count the rendered shapes directly: <path> nodes inside the
    // g.node group plus anything carrying a `trackID` attribute (track
    // rectangles, curves, and corners).
    const svg = document.getElementById('svg')
    expect(svg).toBeTruthy()
    const shapes =
      svg.querySelectorAll('g.node path').length +
      svg.querySelectorAll('[trackID]').length +
      svg.querySelectorAll('[nodeY]').length
    expect(shapes).toEqual(50)
  })

  it.skipIf(!vg_available())('draws the right SVG for cactus multiple reads', async () => {
    await selectExample('cactus multiple reads')
    const autocomplete = screen.getByTestId('autocomplete')
    const input = autocomplete.querySelector('input')

    await userEvent.clear(input)

    // Input region
    // using fireEvent because userEvent has no change
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'node:1+10' } })
    expect(input.value).toBe('node:1+10')
    fireEvent.keyDown(autocomplete, { key: 'Enter' })

    // Wait for rendered response
    await waitFor(() => screen.getByTestId('autocomplete'))

    // Click go
    const go = document.getElementById('goButton')
    await userEvent.click(go)

    const loader = document.getElementById('loader')
    expect(loader).toBeTruthy()

    await waitForLoadEnd()

    // See if correct svg rendered. The custom hover-tooltip replaced the
    // native <svg:title> elements that used to live on every node and track
    // shape, so count the rendered shapes directly.
    const svg = document.getElementById('svg')
    expect(svg).toBeTruthy()
    const shapes =
      svg.querySelectorAll('g.node path').length +
      svg.querySelectorAll('[trackID]').length +
      svg.querySelectorAll('[nodeY]').length
    expect(shapes).toEqual(22)
  })
})

it('produces correct link when data source is changed', async () => {
  // Selecting a data source auto-commits; copy link updates immediately.
  const expectedLinkBRCA1 =
    'http://localhost/?name=snp1kg-BRCA1&tracks[0][trackFile]=exampleData%2Finternal%2Fsnp1kg-BRCA1.vg.xg&tracks[0][trackType]=graph&tracks[0][trackColorSettings][mainPalette]=greys&tracks[0][trackColorSettings][auxPalette]=ygreys&tracks[1][trackFile]=exampleData%2Finternal%2FNA12878-BRCA1.sorted.gam&tracks[1][trackType]=read&region=17%3A1-100&bedFile=exampleData%2Finternal%2Fsnp1kg-BRCA1.bed&dataType=built-in&simplify=false&removeSequences=false'
  await selectExample('snp1kg-BRCA1')
  await waitForLoadEnd()
  await clickCopyLink()
  expect(fakeClipboard).toEqual(expectedLinkBRCA1)

  const expectedLinkCactus =
    'http://localhost/?tracks[0][trackFile]=exampleData%2Fcactus.vg.xg&tracks[0][trackType]=graph&tracks[1][trackFile]=exampleData%2Fcactus-NA12879.sorted.gam&tracks[1][trackType]=read&bedFile=exampleData%2Fcactus.bed&name=cactus&region=ref%3A1-100&dataType=built-in&simplify=false&removeSequences=false'
  await selectExample('cactus')
  await waitForLoadEnd()
  await clickCopyLink()
  expect(fakeClipboard).toEqual(expectedLinkCactus)
}, 20000)

it('can retrieve the list of mounted graph files', async () => {
  // Wait for everything to settle so we don't stop the server while it is thinking
  await waitForLoadEnd()

  // Swap over to the custom files mode via the File menu
  await act(async () => {
    fireEvent.click(screen.getByTestId('fileMenuButton'))
  })
  await act(async () => {
    fireEvent.click(screen.getByTestId('openCustomFiles'))
  })

  // Open "Manage tracks…" from the File menu (the former AppBar "Tracks" button)
  await act(async () => {
    fireEvent.click(screen.getByTestId('fileMenuButton'))
  })
  await act(async () => {
    fireEvent.click(screen.getByTestId('manageTracks'))
  })

  // add a new track
  await waitFor(() => {
    fireEvent.click(screen.queryByTestId('track-add-button-component'))
  })

  // We shouldn't see the option before we open the dropdown
  expect(screen.queryByText('cactus.vg.xg')).not.toBeInTheDocument()

  // Make sure the right entry eventually shows up (since we could be racing
  // the initial load from the component mounting)
  await waitFor(() => {
    // try to select a graph file
    fireEvent.keyDown(
      screen.queryByTestId('file-select-component0').firstChild,
      { key: 'ArrowDown' },
    )
  })

  expect(screen.queryByText('cactus.vg.xg')).toBeTruthy()
})

// uploads a cactus.vg file and renders the svg
it.skipIf(!vg_available())('can accept uploaded files', async () => {
  await waitForLoadEnd()

  // Swap over to the custom files mode via the File menu
  await act(async () => {
    fireEvent.click(screen.getByTestId('fileMenuButton'))
  })
  await act(async () => {
    fireEvent.click(screen.getByTestId('openCustomFiles'))
  })

  // Open "Manage tracks…" from the File menu (the former AppBar "Tracks" button)
  await act(async () => {
    fireEvent.click(screen.getByTestId('fileMenuButton'))
  })
  await act(async () => {
    fireEvent.click(screen.getByTestId('manageTracks'))
  })

  // add a new track
  await waitFor(() => {
    fireEvent.click(screen.queryByTestId('track-add-button-component'))
  })

  // select the upload option from the picker type dropdown
  await waitFor(() => screen.queryByTestId('picker-type-select-component0'))
  await selectMuiOption(
    screen.queryByTestId('picker-type-select-component0'),
    'upload',
  )

  await waitFor(() => screen.queryByTestId('file-select-component0'))

  const fileUploader = screen.queryByTestId('file-select-component0')

  // We need to make sure we make a jsdom File (which is a jsdom Blob), and not
  // a Node Blob, for our test file. Otherwise it doesn't work with jsdom's
  // upload machinery.
  // See for example <https://github.com/vitest-dev/vitest/issues/2078> for
  // background on the many flavors of Blob.
  const fileData = await fs.readFileSync('exampleData/cactus.vg')
  // Since a Node Buffer is an ArrayBuffer, we can use it to make a jsdom File.
  // We need to put the data block in an enclosing array, or else the block
  // will be iterated and each byte will be stringified and *those* bytes will
  // be uploaded.
  const file = new window.File([fileData], 'cactus.vg', {
    type: 'application/octet-stream',
  })

  await act(async () => {
    await userEvent.upload(fileUploader, file)

    // make sure the file is in the upload component
    expect(fileUploader.files.length).toBe(1)
    expect(fileUploader.files[0]).toStrictEqual(file)
  })

  // Wait for upload to finish. The spinner may appear and disappear very
  // quickly on a warm server, so we just wait for it to be gone (upload done
  // or errored). We already verified the file was set on the input inside
  // act, so if the spinner is absent the upload has completed.
  await waitFor(
    () =>
      expect(document.getElementsByClassName('upload-in-progress').length).toBe(
        0,
      ),
    { timeout: 30000 },
  )
  // exit the track picker
  fireEvent.click(screen.queryByTestId('TrackPickerCloseButton'))

  // try to compute the svg
  const autocomplete = screen.getByTestId('autocomplete')
  const input = autocomplete.querySelector('input')

  await userEvent.clear(input)

  // Input region
  // using fireEvent because userEvent has no change
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'node:1+10' } })
  expect(input.value).toBe('node:1+10')
  fireEvent.keyDown(autocomplete, { key: 'Enter' })

  // Wait for rendered response
  await waitFor(() => screen.getByTestId('autocomplete'))

  // Click go
  const go = document.getElementById('goButton')
  await userEvent.click(go)

  await waitForLoadEnd()

  // See if correct svg rendered. The custom hover-tooltip replaced the
  // native <svg:title> elements; count rendered shapes directly. With
  // remove-redundant-nodes on, we expect 3 nodes and 2 track shapes.
  const svg = document.getElementById('svg')
  expect(svg).toBeTruthy()
  const shapes =
    svg.querySelectorAll('g.node path').length +
    svg.querySelectorAll('[trackID]').length +
    svg.querySelectorAll('[nodeY]').length
  expect(shapes).toEqual(5)
}, 50000) // We need to allow a long time for the slow vg test machines.
// TODO: Is this slow because of unnecessary re-renders caused by the new color schemes taking effect and being rendered with the old data, before the new data downloads?
