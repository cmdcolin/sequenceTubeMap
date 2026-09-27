// Tests functionality without server

import { render, screen, waitFor, within } from '@testing-library/react'
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

it('leaves a failed fetch failed when the window regains focus', async () => {
  let calls = 0
  // SWR also holds off a focus refetch for a while after mount and after the
  // last fetch, which would hide the one this is looking for.
  render(
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        focusThrottleInterval: 0,
      }}
    >
      <App
        api={fakeAPI({
          getPathInfo: async () => {
            calls += 1
            throw new Error('Mock Path Error')
          },
        })}
      />
    </SWRConfig>,
  )
  await waitFor(() => {
    expect(screen.getByText(/Mock Path Error/)).toBeInTheDocument()
  })

  window.dispatchEvent(new Event('focus'))
  await new Promise(resolve => setTimeout(resolve, 50))

  expect(calls).toBe(1)
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
  await userEvent.click(screen.getByRole('option', { name: /vgteam server/i }))

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
    expect(window.location.search).toContain('region=ref:1-100')
  })
  expect(window.location.search).toContain('tracks=graph:')
})

// App reads the URL once, at module scope, so a URL-driven start needs the
// module re-imported after the address bar is set.
it('starts from the view options in the URL', async () => {
  window.history.replaceState(null, '', '/?vis=compressedView')
  vi.resetModules()
  const { default: UrlApp } = await import('./App.tsx')
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <UrlApp api={fakeAPI()} />
    </SWRConfig>,
  )

  await userEvent.click(screen.getByTestId('viewMenuButton'))
  const compressed = screen.getByRole('menuitem', { name: /Compressed view/ })

  expect(compressed.querySelector('input[type=checkbox]')).toBeChecked()
})

it('has nothing for Go to apply on a view read from the URL', async () => {
  window.history.replaceState(null, '', '/?region=x:1-100&tracks=graph:x.vg')
  vi.resetModules()
  const { default: UrlApp } = await import('./App.tsx')
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <UrlApp api={fakeAPI()} />
    </SWRConfig>,
  )

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute(
      'title',
      'No changes to apply; view is up to date.',
    )
  })
})

it('links a hosted graph to BandageJS from the View menu', async () => {
  window.history.replaceState(
    null,
    '',
    '/?name=HPRC%20v2.1%20whole%20genome%20(gbz-base%2C%20URL-hosted)&region=GRCh38%23chr20:48000600-48001000',
  )
  vi.resetModules()
  const { default: UrlApp } = await import('./App.tsx')
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <UrlApp api={fakeAPI()} />
    </SWRConfig>,
  )

  await userEvent.click(screen.getByTestId('viewMenuButton'))
  const href = screen
    .getByTestId('openInBandageJsMenuItem')
    .getAttribute('href')

  expect(Object.fromEntries(new URL(href!).searchParams)).toMatchObject({
    gbz: expect.stringMatching(/hprc-v2\.1-mc-grch38\.gbz\.db$/),
    index: expect.stringMatching(/haplotype-index\.anchored\.db$/),
    loc: 'chr20:48000600-48001000',
    ref: 'GRCh38',
  })
})

it('disables Open in BandageJS for a graph only the server can read', async () => {
  renderApp()

  await userEvent.click(screen.getByTestId('viewMenuButton'))

  expect(screen.getByTestId('openInBandageJsMenuItem')).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

it('puts the View menu settings in the address bar, and only the changed ones', async () => {
  window.history.replaceState(null, '', '/')
  renderApp()

  await userEvent.click(screen.getByTestId('viewMenuButton'))
  await userEvent.click(
    screen.getByRole('menuitem', { name: /Compressed view/ }),
  )

  await waitFor(() => {
    expect(window.location.search).toContain('vis=compressedView')
  })
  expect(window.location.search).not.toContain('showNodeLabels')
})

// The legend accompanies a drawn map, and the synthetic examples draw one
// without a backend behind them.
async function drawSyntheticExample() {
  await userEvent.click(screen.getByTestId('examplesMenuButton'))
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Synthetic examples' }),
  )
  await userEvent.click(screen.getByText('Inversions'))
  await waitFor(() => {
    expect(document.querySelector('#tubeMapSVG svg')).toBeTruthy()
  })
}

describe('remembered preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes the legend and view options as they change', async () => {
    renderApp()
    await drawSyntheticExample()
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

  it('starts from what was written last time', async () => {
    localStorage.setItem('sequenceTubeMap.legendVisible', 'false')
    localStorage.setItem(
      'sequenceTubeMap.visOptions',
      JSON.stringify({ showNodeLabels: true, removeRedundantNodes: false }),
    )
    renderApp()
    await drawSyntheticExample()

    expect(screen.queryByText('Color legend')).not.toBeInTheDocument()
  })

  it('ignores a stored value it cannot use', async () => {
    localStorage.setItem('sequenceTubeMap.legendVisible', 'not-a-boolean')
    localStorage.setItem('sequenceTubeMap.visOptions', '{"showReads": 7}')
    renderApp()
    await drawSyntheticExample()

    // Falls back to the defaults rather than rendering nothing.
    expect(screen.getByText('Color legend')).toBeInTheDocument()
  })
})

const openCustomFiles = async () => {
  await userEvent.click(screen.getByTestId('fileMenuButton'))
  await userEvent.click(screen.getByTestId('openCustomFiles'))
}

const stageFile = async (name: string) => {
  const panel = screen.getByTestId('UploadPanel')
  await userEvent.upload(
    panel.querySelector<HTMLInputElement>('input[type="file"]')!,
    new File(['data'], name),
  )
}

// What leaves the app with no view: new files are loaded, and no region in
// them is picked yet.
const uploadCustomFiles = async () => {
  await openCustomFiles()
  await stageFile('graph.vg')
  await userEvent.click(
    within(screen.getByTestId('UploadPanel')).getByRole('button', {
      name: /upload & use/i,
    }),
  )
}

describe('the address bar', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('keeps params the app does not own', async () => {
    window.history.replaceState(null, '', '/?utm_source=email')
    renderApp()

    await waitFor(() => {
      expect(window.location.search).toContain('region=17:1-100')
    })
    expect(window.location.search).toContain('utm_source=email')
  })

  it('clears the view when there is none, rather than writing empty params', async () => {
    renderApp()
    await waitFor(() => {
      expect(window.location.search).toContain('region=17:1-100')
    })

    await uploadCustomFiles()

    await waitFor(() => {
      expect(window.location.search).toBe('')
    })
  })

  it('gives each view its own history entry, and Back walks them', async () => {
    renderApp()
    await waitFor(() => {
      expect(window.location.search).toContain('region=17:1-100')
    })

    await userEvent.click(screen.getByTestId('examplesMenuButton'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))
    await waitFor(() => {
      expect(window.location.search).toContain('region=ref:1-100')
    })

    window.history.back()

    await waitFor(() => {
      expect(window.location.search).toContain('region=17:1-100')
    })
    // The form follows the restored view, not just the address bar.
    await waitFor(() => {
      expect(getRegionInput().value).toEqual('17:1-100')
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute(
        'title',
        'No changes to apply; view is up to date.',
      )
    })
  })

  it("walks the browser's history with its own Back and Forward", async () => {
    renderApp()
    const back = () => screen.getByTestId('regionHistoryBack')
    const forward = () => screen.getByTestId('regionHistoryForward')
    expect(back()).toBeDisabled()

    await userEvent.click(screen.getByTestId('examplesMenuButton'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))
    await waitFor(() => {
      expect(window.location.search).toContain('region=ref:1-100')
    })
    const entries = window.history.length
    expect(forward()).toBeDisabled()

    await userEvent.click(back())
    await waitFor(() => {
      expect(getRegionInput().value).toEqual('17:1-100')
    })
    expect(window.location.search).toContain('region=17:1-100')
    expect(back()).toBeDisabled()

    await userEvent.click(forward())
    await waitFor(() => {
      expect(getRegionInput().value).toEqual('ref:1-100')
    })
    expect(window.location.search).toContain('region=ref:1-100')
    expect(window.history.length).toBe(entries)
  })

  it('turns a View setting back off when Back returns to a view without it', async () => {
    localStorage.clear()
    renderApp()
    await userEvent.click(screen.getByTestId('examplesMenuButton'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'cactus' }))
    await userEvent.click(screen.getByTestId('viewMenuButton'))
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Compressed view/ }),
    )
    await waitFor(() => {
      expect(window.location.search).toContain('vis=compressedView')
    })

    window.history.back()

    await waitFor(() => {
      expect(window.location.search).toContain('region=17:1-100')
    })
    const compressed = screen.getByRole('menuitem', { name: /Compressed view/ })
    expect(compressed.querySelector('input[type=checkbox]')).not.toBeChecked()
    localStorage.clear()
  })
})

describe('the Open dialog', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('stays open across a switch of upload mode', async () => {
    renderApp(fakeAPI({ mode: 'local' }))
    await openCustomFiles()

    await userEvent.click(screen.getByTestId('mode-server'))

    expect(screen.getByTestId('UploadPanel')).toBeVisible()
    expect(screen.getByTestId('mode-server')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('leaves the view on screen until files are loaded', async () => {
    renderApp()
    await waitFor(() => {
      expect(window.location.search).toContain('region=17:1-100')
    })

    await openCustomFiles()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByTestId('UploadPanel')).not.toBeInTheDocument()
    })

    expect(window.location.search).toContain('region=17:1-100')
    expect(screen.queryByText(/Nothing loaded/)).not.toBeInTheDocument()
  })
})

describe('loading and empty states', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('says what it is waiting for while the view loads', async () => {
    renderApp(fakeAPI({ getChunkedData: () => new Promise(() => {}) }))

    expect(await screen.findByText('Loading 17:1-100…')).toBeInTheDocument()
  })

  it('says there is nothing to show once no view is selected', async () => {
    renderApp()
    await uploadCustomFiles()

    expect(await screen.findByText(/Nothing loaded/)).toBeInTheDocument()
  })

  it('clears the drawn map when the view goes away', async () => {
    renderApp()
    await drawSyntheticExample()

    await uploadCustomFiles()

    await waitFor(() => {
      expect(document.querySelector('#tubeMapSVG svg')).toBeNull()
    })
  })
})
