import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataPositionFormRow from './DataPositionFormRow.tsx'
import * as tubeMap from '../util/tubemap.ts'
import type { Tracks, ViewTarget } from '../Types.ts'

const VIEW_TARGET: ViewTarget = {
  region: 'x:1-100',
  tracks: [{ trackType: 'graph', trackFile: 'graph.gbz.db' }],
}

const TRACKS: Tracks = [
  { trackType: 'graph', trackFile: 'graph.gbz.db' },
  { trackType: 'read', trackFile: 'reads.gam' },
]

// jsdom has no object URLs and no downloads, so stand in for both and hand
// back whatever the button put in the blob.
function captureDownload() {
  const saved: { text: Promise<string> | undefined } = { text: undefined }
  Object.defineProperty(URL, 'createObjectURL', {
    value: (blob: Blob) => {
      saved.text = blob.text()
      return 'blob:stub'
    },
    configurable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => {},
    configurable: true,
  })
  return saved
}

function renderRow(legendTracks: Tracks | undefined) {
  render(
    <DataPositionFormRow
      handleGoButton={() => {}}
      currentViewTarget={VIEW_TARGET}
      viewTargetHasChange={false}
      canGo
      loading={false}
      legendTracks={legendTracks}
    />,
  )
}

// The map the button serializes. Its content does not matter here; that it is
// the element the export reaches for does.
function drawSomething() {
  document.body.innerHTML =
    '<svg id="svg" width="800" height="600"><g><rect x="0" y="0" width="10" height="10"/></g></svg>'
}

beforeEach(() => {
  drawSomething()
  tubeMap.setColorSet(0, { mainPalette: 'greys', auxPalette: 'ygreys' })
  tubeMap.setColorSet(1, { mainPalette: 'blues', auxPalette: 'reds' })
  tubeMap.setReadGroups(null)
})

it('saves the color key the render is actually using', async () => {
  const saved = captureDownload()
  renderRow(TRACKS)

  await userEvent.click(screen.getByRole('button', { name: /Download Image/ }))

  const xml = await saved.text
  expect(xml).toContain('Color legend')
  expect(xml).toContain('graph.gbz.db')
  expect(xml).toContain('Forward reads')
})

it('describes read groups once the user has made some', async () => {
  tubeMap.setReadGroups([{ name: 'Carriers', color: 'reds', reads: ['r1'] }])
  const saved = captureDownload()
  renderRow(TRACKS)

  await userEvent.click(screen.getByRole('button', { name: /Download Image/ }))

  const xml = await saved.text
  // Every read is drawn in a group color while a group exists, so naming the
  // strand palettes here would name colors the picture does not use.
  expect(xml).toContain('Carriers')
  expect(xml).not.toContain('Forward reads')
})

it('leaves the key out when the legend is hidden', async () => {
  const saved = captureDownload()
  renderRow(undefined)

  await userEvent.click(screen.getByRole('button', { name: /Download Image/ }))

  expect(await saved.text).not.toContain('Color legend')
})
