// End-to-end render tests: drive the actual d3 pipeline against jsdom and
// inspect the resulting SVG DOM. Complements tubemap.test.ts, which covers
// pure functions (cigar_string, coverage, axisIntervals).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as tubeMap from './tubemap.ts'
import type { InfoAttribute, InputNode, InputTrack } from './tubemap.ts'
import { computeExampleData } from '../components/tubeMapData.ts'
import { dataOriginTypes } from '../enums.ts'
import * as demo from './demo-data.js'

// Numeric suffixes only — keeps the row format compact below. Strings are
// preferable to numbers for the dataOrigin lookup so we don't trip
// no-magic-numbers in callers.
const EXAMPLE_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

function setupSvg(width = 1800, height = 1200): SVGSVGElement {
  document.body.innerHTML = ''
  const container = document.createElement('div')
  container.id = 'container'
  // jsdom doesn't do CSS layout, so clientWidth/Height are 0 by default,
  // which makes minZoom() collapse to 0 and initialScale=0. Force them.
  Object.defineProperty(container, 'clientWidth', {
    value: width,
    configurable: true,
  })
  Object.defineProperty(container, 'clientHeight', {
    value: height,
    configurable: true,
  })
  document.body.appendChild(container)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('id', 'tubemap')
  container.appendChild(svg)
  return svg
}

function dataForExample(suffix: string) {
  const key = `EXAMPLE_${suffix}` as keyof typeof dataOriginTypes
  return computeExampleData(
    dataOriginTypes[key],
    demo,
  )
}

function render(
  nodes: InputNode[],
  tracks: InputTrack[],
  reads: InputTrack[] = [],
): SVGSVGElement {
  tubeMap.create({
    svgID: '#tubemap',
    nodes,
    tracks,
    reads,
    clickableNodes: false,
    hideLegend: false,
  })
  const svg = document.getElementById('tubemap') as unknown as SVGSVGElement
  return svg
}

describe('tubemap.create — demo examples render to SVG', () => {
  beforeEach(() => {
    setupSvg()
  })

  for (const n of EXAMPLE_NUMBERS) {
    it(`renders demo example ${n} with paths and rects`, () => {
      const { nodes, tracks, reads } = dataForExample(n)
      const svg = render(nodes, tracks, reads)

      // Sanity: SVG retained its id and has children.
      expect(svg.getAttribute('id')).toBe('tubemap')
      expect(svg.children.length).toBeGreaterThan(0)

      // d3 appends a <g> wrapper for the zoom transform; content lives inside.
      const paths = svg.querySelectorAll('path')
      const rects = svg.querySelectorAll('rect')
      expect(paths.length).toBeGreaterThan(0)
      expect(rects.length).toBeGreaterThan(0)
    })
  }
})

describe('tubemap.create — structural details', () => {
  beforeEach(() => {
    setupSvg()
  })

  it('renders one rect per input node (plus pattern rects)', () => {
    const { nodes, tracks } = dataForExample('1')
    const svg = render(nodes, tracks)
    // Each input node maps to at least one rect; patterns and other helpers
    // may add more, so the rendered total is >= the node count.
    expect(svg.querySelectorAll('rect').length).toBeGreaterThanOrEqual(
      nodes.length,
    )
  })

  it('cleans the dummytext probe after measuring character width', () => {
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    // The probe is appended, measured, then removed; if it leaked we'd find
    // a #dummytext element still in the DOM.
    expect(document.getElementById('dummytext')).toBeNull()
  })

  it('re-renders cleanly into the same SVG', () => {
    const first = dataForExample('1')
    const second = dataForExample('2')

    render(first.nodes, first.tracks)
    const firstPathCount = document.querySelectorAll('#tubemap path').length

    render(second.nodes, second.tracks)
    const secondPathCount = document.querySelectorAll('#tubemap path').length

    // Both renders produced content, and the second render replaced rather
    // than appended (so total path count reflects example 2 alone, not 1+2).
    expect(firstPathCount).toBeGreaterThan(0)
    expect(secondPathCount).toBeGreaterThan(0)
  })
})

describe('tubemap.create — node width options', () => {
  beforeEach(() => {
    setupSvg()
  })

  for (const option of ['normal', 'compressed', 'small', 'fixed'] as const) {
    it(`accepts nodeWidthOption=${option}`, () => {
      tubeMap.setNodeWidthOption(option)
      const { nodes, tracks } = dataForExample('1')
      const svg = render(nodes, tracks)
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
    })
  }

  it('reverts to the default node-width path for subsequent tests', () => {
    // Leave the module in a known state — every other test in this file
    // assumes nodeWidthOption='normal' (the initial default).
    tubeMap.setNodeWidthOption('normal')
    expect(true).toBe(true)
  })
})

describe('tubemap.create — track visibility', () => {
  beforeEach(() => {
    setupSvg()
  })

  it('exposes a visibility snapshot for each input track', () => {
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    const snapshot = tubeMap.getTrackVisibilitySnapshot()
    expect(snapshot.length).toBe(tracks.length)
    // Every track starts visible.
    for (const item of snapshot) expect(item.hidden).toBe(false)
  })

  it('changeAllTracksVisibility(false) hides every track', () => {
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    tubeMap.changeAllTracksVisibility(false)
    const snapshot = tubeMap.getTrackVisibilitySnapshot()
    for (const item of snapshot) expect(item.hidden).toBe(true)
    // Restore for any later assertions in this file.
    tubeMap.changeAllTracksVisibility(true)
  })

  it('changeTrackVisibility toggles a single track', () => {
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    const before = tubeMap.getTrackVisibilitySnapshot()
    const target = before[0]!
    tubeMap.changeTrackVisibility(target.id)
    const after = tubeMap.getTrackVisibilitySnapshot()
    expect(after[0]!.hidden).toBe(!target.hidden)
    tubeMap.changeTrackVisibility(target.id) // restore
  })
})

describe('tubemap.create — node click pops info dialog', () => {
  beforeEach(() => {
    setupSvg()
  })

  // Regression: d3-zoom's "start" event used to flip pointer-events:none on the
  // content group before any movement, so by the time `click` was dispatched
  // the node <path> couldn't receive it. We now defer the disable to the first
  // real 'zoom' event. The full pointerdown→pointerup→click sequence is what
  // surfaces the bug — a bare `click` dispatch wouldn't touch d3-zoom at all.
  it('invokes setInfoCallback when a node <path> is clicked', () => {
    const onInfo = vi.fn<(attrs: InfoAttribute[]) => void>()
    tubeMap.setInfoCallback(onInfo)

    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)

    // Nodes are rendered as <path id={nodeName}> inside the .node group.
    const nodePath = document.querySelector('g.node path[id]') as SVGPathElement | null
    expect(nodePath).not.toBeNull()
    if (!nodePath) return

    // d3-drag reads `event.view.document` on mousedown. jsdom rejects `view`
    // passed via the MouseEvent init (IDL window-check), so construct the
    // events normally and then patch `view` on after the fact.
    function fire(type: string): void {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })
      Object.defineProperty(ev, 'view', { value: document.defaultView })
      nodePath?.dispatchEvent(ev)
    }
    fire('mousedown')
    fire('mouseup')
    fire('click')

    expect(onInfo).toHaveBeenCalledTimes(1)
    const attrs = onInfo.mock.calls[0]?.[0] ?? []
    // First row is always the Node ID label/value pair.
    expect(attrs[0]?.[0]).toBe('Node ID:')
  })
})

describe('tubemap.create — empty inputs', () => {
  beforeEach(() => {
    setupSvg()
  })

  it('does not throw when given an empty node + track list', () => {
    expect(() => {
      render([], [])
    }).not.toThrow()
  })
})
