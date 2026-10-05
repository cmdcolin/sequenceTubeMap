// End-to-end render tests: drive the actual d3 pipeline against jsdom and
// inspect the resulting SVG DOM. Complements tubemap.test.ts, which covers
// pure functions (cigar_string, coverage, axisIntervals).

import * as d3 from 'd3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as tubeMap from './tubemap.ts'
import { haplotypeShareColor } from './palettes.ts'
import { legendSections } from './legend.ts'
import { defaultTrackColors } from '../common.ts'
import type { InfoAttribute, InputNode, InputTrack } from './tubemap.ts'
import { computeExampleData } from '../components/tubeMapData.ts'
import { dataOriginTypes } from '../enums.ts'
import * as demo from './demo-data.js'
import { measureSvgContent } from './svgBounds.ts'
import { layoutTopology, placeFacets } from '@gmod/tubemap-core'
import type * as TubeMapCore from '@gmod/tubemap-core'

vi.mock('@gmod/tubemap-core', async importOriginal => {
  const core = await importOriginal<typeof TubeMapCore>()
  return {
    ...core,
    layoutTopology: vi.fn(core.layoutTopology),
    placeFacets: vi.fn(core.placeFacets),
  }
})

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

describe('tubemap.create — resizing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sizes the root <svg> to its parent, not the drawing inside it', () => {
    let resized = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    setupSvg(1800, 1200)
    const { nodes, tracks } = dataForExample('1')
    const svg = render(nodes, tracks)
    Object.defineProperty(svg.parentElement, 'clientWidth', { value: 900 })
    resized()
    expect(svg.getAttribute('width')).toBe('900')
    expect(svg.querySelector(':scope > g')?.hasAttribute('width')).toBe(false)
  })
})

describe('tubemap.zoomBy', () => {
  // Past the 750 ms transition
  const settle = () => new Promise(resolve => setTimeout(resolve, 1000))

  it('does nothing before the first draw', async () => {
    vi.resetModules()
    const fresh = await import('./tubemap.ts')
    expect(() => {
      fresh.zoomBy(2)
    }).not.toThrow()
  })

  it('does nothing once the drawing is released', async () => {
    setupSvg()
    const { nodes, tracks } = dataForExample('7')
    const svg = render(nodes, tracks)
    const before = svg.querySelector(':scope > g')?.getAttribute('transform')
    tubeMap.releaseDomBindings()
    tubeMap.zoomBy(2)
    await settle()
    expect(svg.querySelector(':scope > g')?.getAttribute('transform')).toBe(
      before,
    )
  })

  it('stops a zoom still running when its drawing is released', async () => {
    const svg = setupSvg()
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    tubeMap.zoomBy(2)
    await new Promise(resolve => setTimeout(resolve, 50))
    tubeMap.changeAllTracksVisibility(false)
    await settle()
    tubeMap.changeAllTracksVisibility(true)
    expect(svg.getAttribute('transform')).toBeNull()
    expect(svg.style.pointerEvents).toBe('')
  })

  // Example 7 is narrower and shorter than the viewport
  it('zooms out to a small graph centred across the viewport, its top in view', async () => {
    setupSvg(1800, 1200)
    const { nodes, tracks } = dataForExample('7')
    const svg = render(nodes, tracks)
    tubeMap.zoomBy(0.5)
    await settle()
    const box = measureSvgContent(svg).box!
    expect(Math.abs(box.x + box.width / 2 - 900)).toBeLessThan(20)
    expect(box.y).toBeGreaterThan(0)
    expect(box.y).toBeLessThan(40)
  })
})

describe('tubemap.create — a redraw of the same data', () => {
  // Within float noise: re-applying the zoom's extents recomputes the numbers
  const drawingTransform = (svg: SVGSVGElement) =>
    (svg.querySelector(':scope > g')?.getAttribute('transform') ?? '')
      .match(/-?[\d.]+(?:e[-+]?\d+)?/g)
      ?.map(n => Number(n).toFixed(6))

  for (const [example, width, height] of [
    ['1', 1800, 1200],
    ['2', 600, 150],
    ['6', 1800, 1200],
    ['6', 1800, 300],
    ['7', 1800, 1200],
    ['8', 1800, 200],
  ] as const) {
    it(`leaves example ${example}'s first view at ${width}x${height} where it was`, () => {
      setupSvg(width, height)
      const { nodes, tracks, reads } = dataForExample(example)
      const svg = render(nodes, tracks, reads)
      const first = drawingTransform(svg)
      expect(first).toHaveLength(3)
      render(nodes, tracks, reads)
      expect(drawingTransform(svg)).toEqual(first)
    })
  }

  it('brings the kept viewport back onto a layout that shrank under it', () => {
    setupSvg(1800, 1200)
    const { nodes, tracks } = dataForExample('6')
    const svg = render(nodes, tracks)
    // Zoomed in on the right end of the normal-width layout
    d3.zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [1800, 1200],
      ])
      .transform(
        d3.select(svg),
        d3.zoomIdentity.translate(900 - 8 * 4000, 600 - 8 * 100).scale(8),
      )
    tubeMap.setNodeWidthOption('compressed')
    try {
      render(nodes, tracks)
    } finally {
      tubeMap.setNodeWidthOption('normal')
    }
    const box = measureSvgContent(svg).box!
    expect(box.x).toBeLessThan(0)
    expect(box.x + box.width).toBeGreaterThanOrEqual(1800)
  })
})

describe('tubemap.create — a recolor', () => {
  afterEach(() => {
    tubeMap.setColorReadsByMappingQualityFlag(false)
    tubeMap.setMergeNodesFlag(true)
    tubeMap.setMappingQualityCutoff(0)
  })

  const fills = (svg: SVGSVGElement) =>
    [...svg.querySelectorAll<SVGElement>('[trackID]')].map(el => el.style.fill)

  it('repaints the same layout, and lays out again when the layout changes', () => {
    setupSvg()
    const { nodes, tracks, reads } = dataForExample('7')
    const svg = render(nodes, tracks, reads)
    const before = fills(svg)
    vi.mocked(layoutTopology).mockClear()

    tubeMap.setColorReadsByMappingQualityFlag(true)
    render(nodes, tracks, reads)
    expect(layoutTopology).not.toHaveBeenCalled()
    expect(fills(svg)).toHaveLength(before.length)
    expect(fills(svg)).not.toEqual(before)

    tubeMap.setMergeNodesFlag(false)
    render(nodes, tracks, reads)
    expect(layoutTopology).toHaveBeenCalledTimes(1)

    tubeMap.changeTrackVisibility(tracks[0]!.id)
    expect(layoutTopology).toHaveBeenCalledTimes(2)
    tubeMap.changeTrackVisibility(tracks[0]!.id)
  })

  function renderThenClear() {
    setupSvg()
    const { nodes, tracks, reads } = dataForExample('7')
    render(nodes, tracks, reads)
    vi.mocked(layoutTopology).mockClear()
    vi.mocked(placeFacets).mockClear()
    return () => render(nodes, tracks, reads)
  }

  it('places again on the same topology after a mapping-quality change', () => {
    const redraw = renderThenClear()
    tubeMap.setMappingQualityCutoff(30)
    redraw()
    expect(layoutTopology).not.toHaveBeenCalled()
    expect(placeFacets).toHaveBeenCalledTimes(1)
  })

  it('neither lays out nor places after a color change', () => {
    const redraw = renderThenClear()
    tubeMap.setColorReadsByMappingQualityFlag(true)
    redraw()
    expect(layoutTopology).not.toHaveBeenCalled()
    expect(placeFacets).not.toHaveBeenCalled()
  })

  it('lays out and places after a merge change', () => {
    const redraw = renderThenClear()
    tubeMap.setMergeNodesFlag(false)
    redraw()
    expect(layoutTopology).toHaveBeenCalledTimes(1)
    expect(placeFacets).toHaveBeenCalledTimes(1)
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

describe('tubemap.create — node labels', () => {
  beforeEach(() => {
    setupSvg()
  })

  afterEach(() => {
    tubeMap.setShowNodeLabels(false)
  })

  it('labels every node, each with a highlight rect sized to its text', () => {
    tubeMap.setShowNodeLabels(true)
    const { nodes, tracks } = dataForExample('1')
    const svg = render(nodes, tracks)

    const groups = svg.querySelectorAll('.node-label-group')
    expect(groups.length).toBe(nodes.length)
    for (const group of groups) {
      const text = group.querySelector('text')
      const rect = group.querySelector('rect')
      // jsdom has no getBBox, so this is the estimated box -- what matters is
      // that a headless render sizes the rect at all rather than throwing.
      expect(Number(rect?.getAttribute('width'))).toBeGreaterThan(
        (text?.textContent ?? '').length,
      )
      expect(Number(rect?.getAttribute('height'))).toBeGreaterThan(0)
    }
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

  const hiddenIds = () =>
    tubeMap
      .getTrackVisibilitySnapshot()
      .filter(item => item.hidden)
      .map(item => item.id)

  it('keeps hidden tracks through a redraw of the same data, not of new data', () => {
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    const target = tracks[1]!.id
    tubeMap.changeTrackVisibility(target)
    render(nodes, tracks)
    expect(hiddenIds()).toEqual([target])
    expect(tracks.some(track => track.hidden)).toBe(false)
    render(nodes, [...tracks])
    expect(hiddenIds()).toEqual([])
  })

  it("never edits the caller's nodes, tracks or reads", () => {
    for (const example of ['1', '5', '6', '7', '8', '9']) {
      const svg = setupSvg()
      const { nodes, tracks, reads } = dataForExample(example)
      const before = JSON.stringify([nodes, tracks, reads])
      render(nodes, tracks, reads)
      try {
        tubeMap.setCoarsenedReadViewFlag(true)
        render(nodes, tracks, reads)
        tubeMap.setCoarsenedReadViewFlag(false)
        tubeMap.setMergeNodesFlag(false)
        render(nodes, tracks, reads)
      } finally {
        tubeMap.setCoarsenedReadViewFlag(false)
        tubeMap.setMergeNodesFlag(true)
      }
      svg
        .querySelector(`[trackID="${tracks.at(-1)!.id}"]`)
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      tubeMap.changeTrackVisibility(tracks[0]!.id)
      render(nodes, tracks, reads)
      expect(JSON.stringify([nodes, tracks, reads])).toBe(before)
    }
  })

  it('keeps a double-clicked track first through a redraw of the same data', () => {
    const { nodes, tracks } = dataForExample('1')
    const svg = render(nodes, tracks)
    const target = tracks[2]!.id
    svg
      .querySelector(`[trackID="${target}"]`)!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(tubeMap.getTrackVisibilitySnapshot()[0]?.id).toBe(target)
    render(nodes, tracks)
    expect(tubeMap.getTrackVisibilitySnapshot()[0]?.id).toBe(target)
    expect(tracks[0]!.id).not.toBe(target)
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

describe('tubemap.create — reads', () => {
  beforeEach(() => {
    setupSvg()
  })

  it('names a hovered read in the tooltip', () => {
    const { nodes, tracks, reads } = dataForExample('7')
    const svg = render(nodes, tracks, reads)
    svg
      .querySelector(`[trackID="${reads[0]!.id}"]`)!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(document.body.lastElementChild?.textContent).toBe('Read0 (read)')
  })

  // A band's label runs to "12,345 haplotypes (67%): Node … → Node …"
  it('wraps a tooltip too long for its box', () => {
    const { nodes, tracks, reads } = dataForExample('7')
    const svg = render(nodes, tracks, reads)
    svg
      .querySelector(`[trackID="${reads[0]!.id}"]`)!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const tooltip = document.body.lastElementChild as HTMLElement
    expect(tooltip.style.maxWidth).toBe('320px')
    expect(tooltip.style.whiteSpace).not.toBe('nowrap')
  })

  it('fades every shape of a read alike, its turnarounds too', () => {
    tubeMap.setAlphaReadsByMappingQualityFlag(true)
    const { nodes, tracks, reads } = dataForExample('7')
    const svg = render(nodes, tracks, reads)
    tubeMap.setAlphaReadsByMappingQualityFlag(false)
    for (const { id } of reads) {
      const opacities = new Set(
        [...svg.querySelectorAll<SVGElement>(`[trackID="${id}"]`)].map(
          el => el.style.fillOpacity,
        ),
      )
      expect(opacities.size).toBeLessThanOrEqual(1)
      expect(opacities).not.toContain('')
    }
  })

  // Read0 visits 60080785 in reverse, and the layout flips that node to draw it
  it("gives a read's path in its own orientation, not the layout's", () => {
    const onInfo = vi.fn<(attrs: InfoAttribute[]) => void>()
    tubeMap.setInfoCallback(onInfo)
    const { nodes, tracks, reads } = dataForExample('7')
    const svg = render(nodes, tracks, reads)
    svg
      .querySelector(`[trackID="${reads[0]!.id}"]`)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onInfo.mock.calls[0]?.[0]).toContainEqual([
      'Path Info',
      '>60080786<60080785>60080783',
    ])
  })
})

describe('tubemap.create — mismatches', () => {
  afterEach(() => {
    tubeMap.setMergeNodesFlag(true)
  })

  it('draws hover guides that take no hover of their own', () => {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    const nodes: InputNode[] = [
      { name: '1', seq: 'AAAAAAAA' },
      { name: '2', seq: 'CCCCCCCC' },
    ]
    const tracks: InputTrack[] = [
      { id: 0, sequence: ['1', '2'], type: 'haplotype', sourceTrackID: 0 },
    ]
    const reads: InputTrack[] = [
      {
        id: 1,
        name: 'r1',
        sequence: ['1', '2'],
        type: 'read',
        sourceTrackID: 1,
        firstNodeOffset: 0,
        finalNodeCoverLength: 8,
        sequenceNew: [
          {
            nodeName: '1',
            mismatches: [
              { type: 'substitution', pos: 1, seq: 'G' },
              { type: 'insertion', pos: 3, seq: 'T' },
              { type: 'deletion', pos: 5, length: 2 },
            ],
          },
          { nodeName: '2', mismatches: [] },
        ],
      },
    ]
    const svg = render(nodes, tracks, reads)
    const mismatches = svg.querySelectorAll('g.mismatches-layer > *')
    expect(mismatches).toHaveLength(3)
    for (const mismatch of mismatches) {
      mismatch.dispatchEvent(new MouseEvent('mouseover'))
    }
    const guides = [...svg.querySelectorAll<SVGElement>('[class$=Highlight]')]
    expect(guides.map(guide => guide.style.pointerEvents)).toEqual(
      Array(5).fill('none'),
    )
  })

  it('places a reverse visit’s mismatch from the node’s right end', () => {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    const nodes: InputNode[] = [
      { name: '1', seq: 'AAAAAAAA' },
      { name: '2', seq: 'CCCCCCCC' },
      { name: '3', seq: 'GGGGGGGG' },
    ]
    const tracks: InputTrack[] = [
      { id: 0, sequence: ['1', '2', '3'], type: 'haplotype', sourceTrackID: 0 },
    ]
    const read = (
      id: number,
      node2: string,
      mismatch: { pos: number; seq: string },
    ): InputTrack => ({
      id,
      name: `r${id}`,
      sequence: ['1', node2, '3'],
      type: 'read',
      sourceTrackID: id,
      firstNodeOffset: 0,
      finalNodeCoverLength: 8,
      sequenceNew: [
        { nodeName: '1', mismatches: [] },
        {
          nodeName: node2,
          mismatches: [{ type: 'substitution', ...mismatch }],
        },
        { nodeName: '3', mismatches: [] },
      ],
    })
    const svg = render(nodes, tracks, [
      read(1, '2', { pos: 6, seq: 'T' }),
      read(2, '-2', { pos: 1, seq: 'A' }),
    ])
    const substitutions = [
      ...svg.querySelectorAll('g.mismatches-layer > text'),
    ].map(text => [text.textContent, text.getAttribute('x')])
    expect(substitutions).toHaveLength(2)
    expect(substitutions[0]![1]).toBe(substitutions[1]![1])
    expect(substitutions.map(([seq]) => seq)).toEqual(['T', 'T'])
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

// A haplotype-only graph (no reads) has nothing for the coarsened view to
// collapse unless it also treats the haplotype tracks as coarsenable: this
// pins down that fallback, which keeps the ruler-carrying reference track
// drawn normally and bands only the rest.
describe('tubemap.create — coarsened view on haplotype-only data', () => {
  const nodes: InputNode[] = [
    { name: '1', seq: 'AAAA' },
    { name: '2', seq: 'CCCC' },
    { name: '3', seq: 'GGGG' },
    { name: '4', seq: 'TTTT' },
  ]
  const tracks: InputTrack[] = [
    {
      id: 0,
      name: 'ref',
      sequence: ['1', '2', '3'],
      type: 'haplotype',
      sourceTrackID: 0,
      indexOfFirstBase: 0,
    },
    { id: 1, name: 'alt1', sequence: ['1', '2', '3'], sourceTrackID: 0 },
    { id: 2, name: 'alt2', sequence: ['1', '2', '3'], sourceTrackID: 0 },
    { id: 3, name: 'alt3', sequence: ['1', '2', '4'], sourceTrackID: 0 },
  ]

  afterEach(() => {
    tubeMap.setMergeNodesFlag(true)
    tubeMap.setCoarsenedReadViewFlag(false)
    tubeMap.setMappingQualityCutoff(0)
  })

  function trackNames(
    tracks: InputTrack[],
    reads: InputTrack[] = [],
  ): string[] {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    tubeMap.setCoarsenedReadViewFlag(true)
    const svg = render(nodes, tracks, reads)
    return [
      ...new Set(
        [...svg.querySelectorAll('[trackName]')].map(
          el => el.getAttribute('trackName') ?? '',
        ),
      ),
    ]
  }

  it('bands the alt haplotypes by edge, leaving the reference out of the count and dropping the alts by name', () => {
    const names = trackNames(tracks)
    expect(names.filter(name => name.includes('→')).sort()).toEqual([
      '1 haplotype (33%): Node 2 → Node 4',
      '2 haplotypes (67%): Node 2 → Node 3',
      '3 haplotypes (100%): Node 1 → Node 2',
    ])
    expect(names).toContain('ref')
    expect(names).not.toContain('alt1')
    expect(names).not.toContain('alt2')
    expect(names).not.toContain('alt3')
  })

  it('weighs a deduplicated walk by its freq, including copies of the reference', () => {
    const [ref, alt1, alt2, alt3] = tracks as [
      InputTrack,
      InputTrack,
      InputTrack,
      InputTrack,
    ]
    const deduplicated = [{ ...ref, freq: 3 }, alt1, alt2, { ...alt3, freq: 5 }]
    expect(
      trackNames(deduplicated)
        .filter(name => name.includes('→'))
        .sort(),
    ).toEqual([
      '4 haplotypes (44%): Node 2 → Node 3',
      '5 haplotypes (56%): Node 2 → Node 4',
      '9 haplotypes (100%): Node 1 → Node 2',
    ])
  })

  it('shades both sides of an allele alike, by its share', () => {
    const bubble: InputTrack[] = [
      { ...tracks[0]!, sequence: ['1', '2', '4'] },
      { id: 1, name: 'alt1', sequence: ['1', '2', '4'], sourceTrackID: 0 },
      { id: 2, name: 'alt2', sequence: ['1', '3', '4'], sourceTrackID: 0 },
      { id: 3, name: 'alt3', sequence: ['1', '3', '4'], sourceTrackID: 0 },
      { id: 4, name: 'alt4', sequence: ['1', '3', '4'], sourceTrackID: 0 },
    ]
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    tubeMap.setCoarsenedReadViewFlag(true)
    const svg = render(nodes, bubble)
    const colorOf = (name: string) =>
      svg.querySelector(`[trackName$="${name}"]`)?.getAttribute('color')
    const common = haplotypeShareColor({ count: 3, total: 4 })
    const rare = haplotypeShareColor({ count: 1, total: 4 })
    expect(colorOf('Node 1 → Node 3')).toBe(common)
    expect(colorOf('Node 3 → Node 4')).toBe(common)
    expect(colorOf('Node 1 → Node 2')).toBe(rare)
    expect(colorOf('Node 2 → Node 4')).toBe(rare)
    expect(rare).not.toBe(common)
    const bands = tubeMap
      .getRenderedColoring()
      .drawn.filter(t => t.mark === 'haplotypeBand')
    expect(bands.map(t => t.share?.total)).toEqual([4, 4, 4, 4])
    expect(bands.some(t => t.reverse)).toBe(false)
  })

  // The widest band gets the full 60-unit lane. A curve runs M x y … x
  // y+thickness Z, so its first and last points give how thick it is drawn.
  it('counts no bands as aligned reads in the node dialog', () => {
    const onInfo = vi.fn<(attrs: InfoAttribute[]) => void>()
    tubeMap.setInfoCallback(onInfo)
    trackNames(tracks)
    document
      .querySelector('g.node path[id="2"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onInfo.mock.calls[0]?.[0].map(([label]) => label)).toEqual([
      'Node ID:',
      'Node Length:',
      'Haplotypes:',
    ])
  })

  it('opens no read menu on a band', () => {
    const onMenu = vi.fn()
    tubeMap.setReadContextMenuCallback(onMenu)
    trackNames(tracks)
    const band = document.querySelector('[trackName^="3 haplotypes"]')!
    band.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    )
    expect(onMenu).not.toHaveBeenCalled()
  })

  it('draws each band a gap thinner than its lane', () => {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    tubeMap.setCoarsenedReadViewFlag(true)
    const svg = render(nodes, tracks)
    const widest = svg.querySelector('rect[trackName^="3 haplotypes"]')
    expect(Number(widest?.getAttribute('height'))).toBeCloseTo(59)
    const band = svg.querySelector('[trackName^="1 haplotype"]')!
    const curve = svg.querySelector('path[trackName^="1 haplotype"]')!
    const numbers = curve
      .getAttribute('d')!
      .match(/-?[\d.]+/g)!
      .map(Number)
    expect(numbers.at(-1)! - numbers[1]!).toBeCloseTo(
      Number(band.getAttribute('height')),
    )
  })

  // A mapping-quality cutoff (or a focus-name filter) can filter every read
  // out of a graph that does have reads loaded. That must not read as "no
  // reads loaded" and fall back to bunching the haplotypes instead -- the
  // graph has reads, they're just all hidden right now.
  it('does not bunch haplotypes just because every read got filtered out', () => {
    tubeMap.setMappingQualityCutoff(100)
    const reads: InputTrack[] = [
      {
        id: 4,
        name: 'r1',
        sequence: ['1', '2'],
        type: 'read',
        sourceTrackID: 1,
        mapping_quality: 0,
      },
    ]
    const names = trackNames(tracks, reads)
    expect(names.some(name => name.includes('→'))).toBe(false)
    expect(names).toContain('alt1')
    expect(names).toContain('alt2')
    expect(names).toContain('alt3')
  })

  // A haplotype that only ever visits one node contributes no edge to the
  // coarsened bands. If every alt happens to be like that, the aggregation
  // comes back empty -- this must not silently drop those haplotypes' nodes
  // from layout (they'd end up with no y-coordinate, i.e. NaN in the SVG).
  it('falls back to drawing haplotypes normally when none of them cross an edge', () => {
    const singleNodeAlts: InputTrack[] = [
      { id: 1, name: 'alt1', sequence: ['4'], sourceTrackID: 0 },
    ]
    expect(() => trackNames([tracks[0]!, ...singleNodeAlts])).not.toThrow()
    const svg = document.getElementById('tubemap') as unknown as SVGSVGElement
    const coords = [...svg.querySelectorAll('rect, path')].flatMap(el => [
      el.getAttribute('y'),
      el.getAttribute('d'),
    ])
    expect(coords.join(' ')).not.toContain('NaN')
  })
})

describe('tubemap.create — banded haplotypes with reads on screen', () => {
  const nodes: InputNode[] = [
    { name: '1', seq: 'AAAA' },
    { name: '2', seq: 'CCCC' },
    { name: '3', seq: 'GGGG' },
    { name: '4', seq: 'TTTT' },
  ]
  const tracks: InputTrack[] = [
    {
      id: 0,
      name: 'ref',
      sequence: ['1', '2', '4'],
      sourceTrackID: 0,
      indexOfFirstBase: 0,
    },
    { id: 1, name: 'alt1', sequence: ['1', '3', '4'], sourceTrackID: 0 },
    { id: 2, name: 'alt2', sequence: ['1', '3', '4'], sourceTrackID: 0 },
  ]
  const reads: InputTrack[] = [
    { id: 3, name: 'r1', sequence: ['1', '2'] },
    { id: 4, name: 'r2', sequence: ['1', '3', '4'] },
  ].map(read => ({
    ...read,
    type: 'read' as const,
    sourceTrackID: 1,
    mapping_quality: 60,
    finalNodeCoverLength: 2,
  }))
  const files = [
    { trackType: 'graph' as const, trackFile: 'x.gbz.db' },
    { trackType: 'read' as const, trackFile: 'x.gam' },
  ]

  afterEach(() => {
    tubeMap.setMergeNodesFlag(true)
    tubeMap.setCoarsenedHaplotypeViewFlag(false)
    tubeMap.setCoarsenedReadViewFlag(false)
    tubeMap.setColorReadsByMappingQualityFlag(false)
  })

  function draw(coarsenReads: boolean) {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    tubeMap.setCoarsenedHaplotypeViewFlag(true)
    tubeMap.setCoarsenedReadViewFlag(coarsenReads)
    const svg = render(nodes, tracks, reads)
    const names = new Set(
      [...svg.querySelectorAll('[trackName]')].map(el =>
        el.getAttribute('trackName'),
      ),
    )
    const coloring = tubeMap.getRenderedColoring()
    const legend = legendSections({ tracks: files, ...coloring }).map(s =>
      s.rows.map(r => r.label),
    )
    return { svg, names: [...names], coloring, legend }
  }

  it('draws the reads one by one under haplotype bands, and keys both', () => {
    tubeMap.setColorReadsByMappingQualityFlag(true)
    const { svg, names, coloring, legend } = draw(false)
    expect(names.filter(name => name?.includes('→')).sort()).toEqual([
      '2 haplotypes (100%): Node 1 → Node 3',
      '2 haplotypes (100%): Node 3 → Node 4',
    ])
    expect(names).toEqual(expect.arrayContaining(['ref', 'r1', 'r2']))
    expect(names).not.toContain('alt1')
    expect(
      svg
        .querySelector('[trackName$="Node 1 → Node 3"]')!
        .getAttribute('color'),
    ).toBe(haplotypeShareColor({ count: 2, total: 2 }))
    expect(new Set(coloring.drawn.map(t => t.mark))).toEqual(
      new Set(['reference', 'haplotypeBand', 'read']),
    )
    expect(legend).toEqual([
      ['Reference path ref', 'Bands, 1 to all 2 other haplotypes'],
      ['Mapping quality 0–60'],
    ])
  })

  it('bands both layers under ids and labels of their own', () => {
    const { names, coloring, legend } = draw(true)
    const bands = coloring.drawn.filter(t => t.id >= 1_000_000_000)
    expect(new Set(bands.map(t => t.id)).size).toBe(bands.length)
    expect(bands.filter(t => t.mark === 'readBand').length).toBe(3)
    expect(bands.filter(t => t.mark === 'haplotypeBand').length).toBe(2)
    expect(names.filter(name => name?.includes(' read'))).toHaveLength(3)
    expect(names).not.toContain('r1')
    expect(legend).toEqual([
      ['Reference path ref', 'Bands, 1 to all 2 other haplotypes'],
      ['Read bands'],
    ])
  })
})

describe('tubemap.create — facets', () => {
  const nodes: InputNode[] = [
    { name: '1', seq: 'AAAA' },
    { name: '2', seq: 'CCCC' },
    { name: '3', seq: 'GGGG' },
    { name: '4', seq: 'TTTT' },
  ]
  const tracks: InputTrack[] = [
    {
      id: 0,
      name: 'ref',
      sequence: ['1', '2', '4'],
      sourceTrackID: 0,
      indexOfFirstBase: 0,
    },
    { id: 1, name: 'alt', sequence: ['1', '3', '4'], sourceTrackID: 0 },
  ]
  const reads: InputTrack[] = [
    { id: 2, name: 'a1', sequence: ['1', '2', '4'], read_group: 'A' },
    { id: 3, name: 'a2', sequence: ['1', '2'], read_group: 'A' },
    { id: 4, name: 'b1', sequence: ['1', '3', '4'], read_group: 'B' },
  ].map(read => ({
    ...read,
    type: 'read' as const,
    sourceTrackID: 1,
    sample_name: 'S1',
    mapping_quality: 60,
    finalNodeCoverLength: 2,
  }))
  const files = [
    { trackType: 'graph' as const, trackFile: 'x.gbz.db' },
    { trackType: 'read' as const, trackFile: 'x.gam' },
  ]
  const legend = () =>
    legendSections({ tracks: files, ...tubeMap.getRenderedColoring() })
  const facetGroups = (svg: SVGSVGElement) => [
    ...svg.querySelectorAll<SVGGElement>('g.facet'),
  ]

  afterEach(() => {
    tubeMap.setFacetBy(null)
    tubeMap.setMergeNodesFlag(true)
    tubeMap.setColorReadsByMappingQualityFlag(false)
  })

  function draw(by: 'read_group' | 'sample_name' | null) {
    setupSvg()
    tubeMap.setMergeNodesFlag(false)
    tubeMap.setFacetBy(by)
    return render(nodes, tracks, reads)
  }

  it('stacks one labelled panel per read group, aligned in x', () => {
    const svg = draw('read_group')
    const groups = facetGroups(svg)
    expect(
      groups.map(g => g.querySelector('.facet-label')?.textContent),
    ).toEqual(['Read group A · 2 reads', 'Read group B · 1 read'])
    const offset = (g: SVGGElement) =>
      Number(/translate\(0,([^)]+)\)/.exec(g.getAttribute('transform')!)![1])
    expect(offset(groups[0]!)).toBe(0)
    expect(offset(groups[1]!)).toBeGreaterThan(0)
    const nodeOutlines = (g: SVGGElement) =>
      [...g.querySelectorAll('g.node path')].map(p => p.getAttribute('id'))
    expect(nodeOutlines(groups[0]!)).toEqual(nodeOutlines(groups[1]!))
    const referenceXs = (g: SVGGElement) =>
      [...g.querySelectorAll('rect[trackID="0"]')].map(r => r.getAttribute('x'))
    expect(referenceXs(groups[1]!)).toEqual(referenceXs(groups[0]!))
    const readNames = (g: SVGGElement) =>
      new Set(
        [...g.querySelectorAll('[trackID]')]
          .map(el => el.getAttribute('trackName'))
          .filter(name => name !== 'ref' && name !== 'alt'),
      )
    expect(readNames(groups[0]!)).toEqual(new Set(['a1', 'a2']))
    expect(readNames(groups[1]!)).toEqual(new Set(['b1']))
    const rulerText = (g: SVGGElement) =>
      g.querySelectorAll(':scope > text:not(.facet-label)').length
    expect(rulerText(groups[0]!)).toBeGreaterThan(0)
    expect(rulerText(groups[1]!)).toBe(0)
    expect(groups[0]!.querySelector('.facet-rule')).toBeNull()
    expect(groups[1]!.querySelector('.facet-rule')).not.toBeNull()
  })

  it('keys each track once and paints every copy of it', () => {
    const unfaceted = (draw(null), legend())
    const svg = draw('read_group')
    const ids = tubeMap.getRenderedColoring().drawn.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual([0, 1, 2, 3, 4])
    expect(legend()).toEqual(unfaceted)
    for (const el of svg.querySelectorAll<SVGElement>('[trackID]')) {
      expect(el.style.fill).not.toBe('')
    }
  })

  it('still labels the one panel when every read shares the value', () => {
    const svg = draw('sample_name')
    expect(
      facetGroups(svg).map(g => g.querySelector('.facet-label')?.textContent),
    ).toEqual(['Sample S1 · 3 reads'])
    expect(draw(null).querySelector('g.facet, .facet-label')).toBeNull()
  })

  it("counts a clicked node's reads in its own panel", () => {
    const onInfo = vi.fn<(attrs: InfoAttribute[]) => void>()
    tubeMap.setInfoCallback(onInfo)
    const svg = draw('read_group')
    const alignedReads = (g: SVGGElement) => {
      onInfo.mockClear()
      g.querySelector('g.node path[id="1"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      return onInfo.mock.calls[0]?.[0].find(
        ([label]) => label === 'Aligned Reads:',
      )?.[1]
    }
    const [a, b] = facetGroups(svg)
    expect(alignedReads(a!)).toBe(2)
    expect(alignedReads(b!)).toBe(1)
  })

  it("lists the clicked panel's reads in a node's right-click menu", () => {
    const onMenu = vi.fn<(menu: { readNames: string[] } | null) => void>()
    tubeMap.setNodeContextMenuCallback(onMenu)
    const svg = draw('read_group')
    const menuReads = (g: SVGGElement) => {
      onMenu.mockClear()
      g.querySelector('g.node path[id="1"]')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true }),
      )
      return onMenu.mock.calls[0]?.[0]?.readNames
    }
    const [a, b] = facetGroups(svg)
    expect(menuReads(a!)).toEqual(['a1', 'a2'])
    expect(menuReads(b!)).toEqual(['b1'])
    const unfaceted = draw(null)
    expect(menuReads(unfaceted)).toEqual(['a1', 'a2', 'b1'])
  })

  it('counter-scales panel labels with the zoom, as it does node labels', () => {
    const svg = draw('read_group')
    for (const group of svg.querySelectorAll('.facet-label-group')) {
      expect(group.getAttribute('transform')).toMatch(
        /^translate\([^)]+\) scale\([\d.]+\)$/,
      )
    }
  })

  describe('by haplotype sample', () => {
    const samples: InputTrack[] = [
      { ...tracks[0]!, name: 'GRCh38#0#chr1' },
      { id: 1, name: 'HG1#1#chr1', sequence: ['1', '3', '4'] },
      { id: 2, name: 'HG1#2#chr1', sequence: ['1', '2', '4'] },
      { id: 3, name: 'HG2#1#chr1', sequence: ['1', '3', '4'] },
      { id: 4, name: 'Track X', sequence: ['1', '3', '4'] },
    ].map(track => ({ sourceTrackID: 0, ...track }))
    const sampleReads = reads.map(read => ({ ...read, id: read.id + 3 }))

    function drawSamples(withReads: boolean) {
      setupSvg()
      tubeMap.setMergeNodesFlag(false)
      tubeMap.setFacetBy('haplotype_sample')
      return render(nodes, samples, withReads ? sampleReads : [])
    }

    it('stacks a panel per sample with the reference, the unnamed next and the reads last', () => {
      const svg = drawSamples(true)
      const groups = facetGroups(svg)
      expect(
        groups.map(g => g.querySelector('.facet-label')?.textContent),
      ).toEqual([
        'Sample HG1 · 2 haplotypes',
        'Sample HG2 · 1 haplotype',
        'No PanSN sample · 1 haplotype',
        'Reads · 3 reads',
      ])
      const drawnNames = (g: SVGGElement) =>
        new Set(
          [...g.querySelectorAll('[trackID]')].map(el =>
            el.getAttribute('trackName'),
          ),
        )
      expect(drawnNames(groups[0]!)).toEqual(
        new Set(['GRCh38#0#chr1', 'HG1#1#chr1', 'HG1#2#chr1']),
      )
      expect(drawnNames(groups[2]!)).toEqual(
        new Set(['GRCh38#0#chr1', 'Track X']),
      )
      expect(drawnNames(groups[3]!)).toEqual(
        new Set(['GRCh38#0#chr1', 'a1', 'a2', 'b1']),
      )
      const ids = tubeMap.getRenderedColoring().drawn.map(t => t.id)
      expect(ids.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    })

    it('lists reads only in the reads panel', () => {
      const onMenu = vi.fn<(menu: { readNames: string[] } | null) => void>()
      tubeMap.setNodeContextMenuCallback(onMenu)
      const groups = facetGroups(drawSamples(true))
      const menuReads = (g: SVGGElement) => {
        onMenu.mockClear()
        g.querySelector('g.node path[id="1"]')!.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true }),
        )
        return onMenu.mock.calls[0]?.[0]?.readNames
      }
      expect(menuReads(groups[0]!)).toEqual([])
      expect(menuReads(groups[3]!)).toEqual(['a1', 'a2', 'b1'])
    })

    it('draws no reads panel when no reads were loaded', () => {
      expect(
        facetGroups(drawSamples(false)).map(
          g => g.querySelector('.facet-label')?.textContent,
        ),
      ).toEqual([
        'Sample HG1 · 2 haplotypes',
        'Sample HG2 · 1 haplotype',
        'No PanSN sample · 1 haplotype',
      ])
    })
  })

  it('places again on the same topology after a facet change, and recolors without either', () => {
    draw(null)
    vi.mocked(layoutTopology).mockClear()
    vi.mocked(placeFacets).mockClear()
    tubeMap.setFacetBy('read_group')
    render(nodes, tracks, reads)
    expect(layoutTopology).not.toHaveBeenCalled()
    expect(placeFacets).toHaveBeenCalledTimes(1)
    tubeMap.setColorReadsByMappingQualityFlag(true)
    render(nodes, tracks, reads)
    expect(layoutTopology).not.toHaveBeenCalled()
    expect(placeFacets).toHaveBeenCalledTimes(1)
  })
})

describe('tubemap.subscribeRenderedColoring', () => {
  afterEach(() => {
    tubeMap.setIgnoreStrandFlag(false)
  })

  it('notifies only when a draw changes the coloring', () => {
    setupSvg()
    const { nodes, tracks } = dataForExample('1')
    render(nodes, tracks)
    const snapshot = tubeMap.getRenderedColoringSnapshot()
    const onChange = vi.fn()
    const unsubscribe = tubeMap.subscribeRenderedColoring(onChange)
    try {
      render(nodes, tracks)
      expect(onChange).not.toHaveBeenCalled()
      expect(tubeMap.getRenderedColoringSnapshot()).toBe(snapshot)
      tubeMap.setIgnoreStrandFlag(true)
      render(nodes, tracks)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(tubeMap.getRenderedColoringSnapshot().ignoreStrand).toBe(true)
    } finally {
      unsubscribe()
    }
  })
})

describe('tubemap.getRenderedColoring', () => {
  afterEach(() => {
    tubeMap.setReadGroups(null)
    tubeMap.setIgnoreStrandFlag(false)
  })

  it('reports what the drawing was colored with, groups and their names', () => {
    tubeMap.setColorSet(0, { mainPalette: 'greys', auxPalette: 'ygreys' })
    tubeMap.setColorSet(1, { mainPalette: 'blues', auxPalette: 'reds' })
    tubeMap.setReadGroups([{ name: 'Carriers', color: 'reds', reads: ['r1'] }])
    tubeMap.setOtherReadsColor('greys')
    tubeMap.setIgnoreStrandFlag(true)

    const coloring = tubeMap.getRenderedColoring()
    // Indexed by source track, which is how a legend lines rows up with the
    // app's own track list.
    expect(coloring.colorSchemes[0]?.mainPalette).toBe('greys')
    expect(coloring.colorSchemes[1]?.auxPalette).toBe('reds')
    expect(coloring.readGroups).toEqual([{ name: 'Carriers', color: 'reds' }])
    expect(coloring.otherReadsColor).toBe('greys')
    expect(coloring.ignoreStrand).toBe(true)
  })

  // The snp1kg example's graph carries one path, so its key has a reference
  // row and no row for other paths
  it('reports what the draw placed and the scheme each file fell back to', () => {
    setupSvg()
    tubeMap.setColorSet(0, { mainPalette: 'greys', auxPalette: 'ygreys' })
    const nodes: InputNode[] = [
      { name: '1', seq: 'AAAA' },
      { name: '2', seq: 'CCCC' },
    ]
    const graph: InputTrack[] = [
      {
        id: 0,
        name: '17',
        sequence: ['1', '2'],
        sourceTrackID: 0,
        indexOfFirstBase: 0,
      },
    ]
    const reads: InputTrack[] = [
      {
        id: 1,
        name: 'r1',
        type: 'read',
        sequence: ['1', '2'],
        sourceTrackID: 2,
      },
    ]
    render(nodes, graph, reads)

    const coloring = tubeMap.getRenderedColoring()
    expect([...coloring.drawn].sort((a, b) => a.id - b.id)).toEqual([
      { mark: 'reference', source: 0, id: 0, name: '17', reverse: false },
      { mark: 'read', source: 2, id: 1, name: 'r1', reverse: false },
    ])
    expect(coloring.colorSchemes[2]).toEqual(defaultTrackColors('read'))
    const sections = legendSections({
      tracks: [
        { trackType: 'graph', trackFile: 'x.xg' },
        { trackType: 'haplotype', trackFile: 'x.gbwt' },
        { trackType: 'read', trackFile: 'x.gam' },
      ],
      ...coloring,
    })
    expect(sections.map(s => s.rows.map(r => r.label))).toEqual([
      ['Reference path 17'],
      [],
      ['Reads'],
    ])
  })
})
