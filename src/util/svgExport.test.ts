import { describe, expect, it } from 'vitest'
import { exportSvg } from './svgExport.ts'

// The shape the renderer leaves behind: an <svg> sized to the viewport, a
// content <g> under the zoom transform, node labels counter-scaled to stay
// legible at that zoom, and the per-base detail layers hidden below it.
function renderedSvg(
  inner: string,
  transform = 'translate(40,20) scale(0.25)',
) {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><g style="" transform="${transform}">${inner}</g></svg>`,
    'image/svg+xml',
  )
  return doc.documentElement
}

// Every attribute in the subtree, order-insensitively: an export borrows
// attributes and puts them back, which moves them to the end of their element
// without changing what they say.
function attributeDump(root: Element): string[] {
  return [root, ...root.querySelectorAll('*')].map(element =>
    Array.from(element.attributes)
      .map(
        attribute => `${element.tagName}.${attribute.name}=${attribute.value}`,
      )
      .sort()
      .join(' '),
  )
}

function viewBoxOf(xml: string): number[] {
  const match = /viewBox="([^"]*)"/.exec(xml)
  return (match?.[1] ?? '').split(' ').map(Number)
}

describe('exportSvg', () => {
  it('crops to the drawing and trades the pixel size for a viewBox', () => {
    const { xml, cropped } = exportSvg(
      renderedSvg('<rect x="100" y="50" width="400" height="30"/>'),
    )
    expect(cropped).toBe(true)
    // The zoom transform is gone, so the box is the rect itself plus margin.
    expect(viewBoxOf(xml)).toEqual([90, 40, 420, 50])
    expect(xml).not.toContain('width="800"')
    expect(xml).not.toContain('height="600"')
  })

  it('is unchanged by the viewport the map was laid out in', () => {
    const rect = '<rect x="100" y="50" width="400" height="30"/>'
    const wide = exportSvg(renderedSvg(rect, 'translate(40,20) scale(0.25)'))
    const tall = exportSvg(renderedSvg(rect, 'translate(-9,300) scale(1)'))
    expect(wide.xml).toEqual(tall.xml)
  })

  it('drops the node-label counter-scale but keeps the anchor', () => {
    const { xml } = exportSvg(
      renderedSvg(
        '<g class="node-label-group" transform="translate(12,34) scale(4)"><text>7</text></g>',
      ),
    )
    expect(xml).toContain('transform="translate(12,34)"')
    expect(xml).not.toContain('scale(4)')
  })

  it('restores the detail layers the zoom hid', () => {
    const { xml } = exportSvg(
      renderedSvg(
        '<g class="mismatches-layer" style="display: none;"><rect x="0" y="0" width="1" height="1"/></g>' +
          '<g class="sequence-labels-layer" style="display: none;"><text x="0" y="0">A</text></g>',
      ),
    )
    expect(xml).not.toContain('display')
  })

  it('keeps the on-screen framing, zoom state and all, when not cropping', () => {
    const { xml, cropped } = exportSvg(
      renderedSvg(
        '<g class="mismatches-layer" style="display: none;"><rect x="0" y="0" width="1" height="1"/></g>',
      ),
      { crop: false },
    )
    expect(cropped).toBe(false)
    expect(viewBoxOf(xml)).toEqual([0, 0, 800, 600])
    expect(xml).toContain('transform="translate(40,20) scale(0.25)"')
    expect(xml).toContain('display: none')
  })

  it('reports the shapes a broken layout left out, and a blank figure', () => {
    const broken = exportSvg(
      renderedSvg('<rect x="NaN" y="0" width="4" height="4"/>'),
    )
    expect(broken.nonFinite).toBe(1)
    // Nothing measurable was drawn, so there was nothing to crop to.
    expect(broken.cropped).toBe(false)
    expect(viewBoxOf(broken.xml)).toEqual([0, 0, 800, 600])
  })

  it('gives the live drawing back exactly as it borrowed it', () => {
    const svg = renderedSvg(
      '<rect x="1" y="1" width="2" height="2"/>' +
        '<g class="node-label-group" transform="translate(12,34) scale(4)"><text>7</text></g>' +
        '<g class="mismatches-layer" style="display: none;"><rect x="0" y="0" width="1" height="1"/></g>',
    )
    const before = attributeDump(svg)
    exportSvg(svg)
    expect(attributeDump(svg)).toEqual(before)
  })

  it('draws the legend above the map, and grows the figure to fit it', () => {
    const svg = renderedSvg('<rect x="100" y="50" width="400" height="30"/>')
    const { xml } = exportSvg(svg, {
      legend: [
        {
          label: 'x.gbz.db',
          kind: 'graph',
          rows: [{ label: 'Reference path', palette: 'greys' }],
        },
      ],
    })
    const [, y, , height] = viewBoxOf(xml)
    // The drawing alone would start at y=40 and stand 50 tall.
    expect(y).toBeLessThan(40)
    expect(height).toBeGreaterThan(50)
    expect(xml).toContain('Reference path')
    // ...and the panel is the export's, not the drawing's.
    expect(svg.querySelector('.legend')).toBeNull()
  })

  it('writes a standalone file: XML declaration and SVG namespace', () => {
    const { xml } = exportSvg(
      renderedSvg('<rect x="0" y="0" width="1" height="1"/>'),
    )
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(
      true,
    )
    expect(xml).toContain('xmlns="http://www.w3.org/2000/svg"')
  })
})
