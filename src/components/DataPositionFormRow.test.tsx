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

// The map the button serializes, drawn for real so the key has tracks to
// describe: one reference path and one read from each file
function drawSomething() {
  document.body.innerHTML = ''
  const container = document.createElement('div')
  // jsdom lays nothing out, so give the drawing a viewport to fit
  Object.defineProperty(container, 'clientWidth', { value: 800 })
  Object.defineProperty(container, 'clientHeight', { value: 600 })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('id', 'svg')
  container.appendChild(svg)
  document.body.appendChild(container)
  tubeMap.create({
    svgID: '#svg',
    nodes: [
      { name: '1', seq: 'AAAA' },
      { name: '2', seq: 'CCCC' },
    ],
    tracks: [{ id: 0, name: 'ref', sequence: ['1', '2'], sourceTrackID: 0 }],
    reads: [
      {
        id: 1,
        name: 'r1',
        type: 'read',
        sequence: ['1', '2'],
        sourceTrackID: 1,
      },
    ],
  })
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
  expect(xml).toContain('Reads')
})

it('describes read groups once the user has made some', async () => {
  tubeMap.setReadGroups([{ name: 'Carriers', color: 'reds', reads: ['r1'] }])
  // The app redraws when groups change, and the key describes the drawing
  drawSomething()
  const saved = captureDownload()
  renderRow(TRACKS)

  await userEvent.click(screen.getByRole('button', { name: /Download Image/ }))

  const xml = await saved.text
  // Every read is drawn in a group color while a group exists, so naming the
  // strand palettes here would name colors the picture does not use.
  expect(xml).toContain('Carriers')
  expect(xml).not.toContain('Reads')
})

it('leaves the key out when the legend is hidden', async () => {
  const saved = captureDownload()
  renderRow(undefined)

  await userEvent.click(screen.getByRole('button', { name: /Download Image/ }))

  expect(await saved.text).not.toContain('Color legend')
})
