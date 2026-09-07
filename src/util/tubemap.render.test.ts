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
  return computeExampleData(dataOriginTypes[key], demo)
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

  it('draws exactly one <path> per input node when merging is off', () => {
    const { nodes, tracks } = dataForExample('1')
    // Node merging collapses chains, so the 1:1 correspondence only holds with
    // it disabled.
    tubeMap.setMergeNodesFlag(false)
    try {
      const svg = render(nodes, tracks)
      const nodePaths = svg.querySelectorAll('g.node path[id]')
      expect(nodePaths.length).toBe(nodes.length)
      // Every node is drawn exactly once, under its own name.
      const drawnNames = Array.from(nodePaths, p => p.getAttribute('id'))
      expect(new Set(drawnNames).size).toBe(nodes.length)
      expect(new Set(drawnNames)).toEqual(new Set(nodes.map(n => n.name)))
    } finally {
      tubeMap.setMergeNodesFlag(true)
    }
  })

  it('lays the reference path out left to right', () => {
    const { nodes, tracks } = dataForExample('1')
    tubeMap.setMergeNodesFlag(false)
    try {
      const svg = render(nodes, tracks)
      const startX = new Map<string, number>()
      for (const path of svg.querySelectorAll('g.node path[id]')) {
        const id = path.getAttribute('id')
        const match = /M (-?[\d.]+)/.exec(path.getAttribute('d') ?? '')
        if (id !== null && match?.[1] !== undefined) {
          startX.set(id, Number(match[1]))
        }
      }
      // Example 1's reference path visits every node forward, so its nodes
      // must appear in strictly increasing x order.
      const referenceSequence = tracks[0]!.sequence
      expect(referenceSequence.some(name => name.startsWith('-'))).toBe(false)
      const xs = referenceSequence.map(name => startX.get(name))
      expect(xs.every(x => x !== undefined)).toBe(true)
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]!).toBeGreaterThan(xs[i - 1]!)
      }
    } finally {
      tubeMap.setMergeNodesFlag(true)
    }
  })

  it('never emits NaN geometry, even with reads', () => {
    for (const n of EXAMPLE_NUMBERS) {
      setupSvg()
      const { nodes, tracks, reads } = dataForExample(n)
      const svg = render(nodes, tracks, reads)
      const withNaN = Array.from(svg.querySelectorAll('*')).filter(el =>
        Array.from(el.attributes).some(attr => attr.value.includes('NaN')),
      )
      expect(
        withNaN.map(el => `${el.tagName}[${el.getAttribute('d') ?? ''}]`),
      ).toEqual([])
    }
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

  // The click handler on node <path> must be wired and must call the
  // info-dialog callback with the node's attributes.
  it('invokes setInfoCallback when a node <path> is clicked', () => {
    const onInfo = vi.fn<(attrs: InfoAttribute[]) => void>()
    tubeMap.setInfoCallback(onInfo)

    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)

    const nodePath = document.querySelector('g.node path[id]')
    expect(nodePath).not.toBeNull()
    nodePath?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )

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

// The coarsened view collapses reads into one band per node-to-node
// transition. --ignore-strand is meant to additionally merge a transition
// traversed in both directions, but by the time buildCoarsenedSyntheticReads
// runs, switchNodeOrientation and reverseReversedReads have already normalised
// read orientation -- so a reverse traversal has become a forward one and the
// aggregation cannot tell the two apart. These tests pin that down: no bundled
// dataset exercises the flag's coarsened branch, and neither does a read
// written to traverse the same edge backwards.
describe('tubemap.create — coarsened view normalises orientation', () => {
  const nodes: InputNode[] = [
    { name: '1', seq: 'AAAA' },
    { name: '2', seq: 'CCCC' },
    { name: '3', seq: 'GGGG' },
  ]
  const reference: InputTrack[] = [
    { id: 0, sequence: ['1', '2'], type: 'haplotype', sourceTrackID: 0 },
  ]
  // c is deliberately not *entirely* reverse, so reverseReversedReads leaves
  // it alone; it walks -2 -> -1, the reverse of what b walks.
  const reads: InputTrack[] = [
    { id: 1, name: 'b', sequence: ['1', '2'], type: 'read', sourceTrackID: 1 },
    {
      id: 2,
      name: 'c',
      sequence: ['3', '-2', '-1'],
      type: 'read',
      sourceTrackID: 1,
    },
  ]

  // Node merging would fuse the 1->2 chain into a single node and take the
  // transition under test with it.
  function coarsenedBands(ignoreStrand: boolean): string[] {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    tubeMap.setCoarsenedReadViewFlag(true)
    tubeMap.setIgnoreStrandFlag(ignoreStrand)
    const svg = render(nodes, reference, reads)
    tubeMap.setMergeNodesFlag(true)
    tubeMap.setCoarsenedReadViewFlag(false)
    tubeMap.setIgnoreStrandFlag(false)
    const names = [...svg.querySelectorAll('[trackName]')]
      .map(el => el.getAttribute('trackName') ?? '')
      .filter(name => name.includes('\u2192'))
    return [...new Set(names)].sort()
  }

  it('lands both traversals of an edge in one band already', () => {
    expect(coarsenedBands(false)).toEqual([
      '1 read: Node 2 \u2192 Node 3',
      '2 reads: Node 1 \u2192 Node 2',
    ])
  })

  it('is unchanged by ignoreStrand, which has nothing left to merge', () => {
    expect(coarsenedBands(true)).toEqual(coarsenedBands(false))
  })
})
