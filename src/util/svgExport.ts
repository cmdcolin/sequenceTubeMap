// Turning a rendered tube map into a standalone SVG file. Both exports go
// through here -- the browser's Download Image button and the headless CLI --
// so the same data and view options produce the same figure either way.
//
// A figure is not a screenshot. The renderer sizes the <svg> to the viewport it
// laid out in and drives the drawing with a d3 zoom transform, so serializing
// what is on screen keeps only the part of the map the window happened to show,
// at whatever zoom the user left it. Cropping to the drawn content and undoing
// the on-screen zoom state gives a file that holds the whole map at natural
// scale, independent of the window (or --width/--height) it came from.

import type { LegendSection } from './legend.ts'
import { measureSvgContent } from './svgBounds.ts'
import { legendGroup } from './svgLegend.ts'

// Breathing room around the cropped drawing so edge strokes and the outermost
// sequence labels aren't shaved off.
const CROP_MARGIN = 10

// Between the legend panel and the drawing it describes.
const LEGEND_GAP = 12

export interface SvgExport {
  xml: string
  // Shapes the layout gave non-finite coordinates. They are missing from the
  // picture, so a caller that can warn should.
  nonFinite: number
  // False when nothing measurable was drawn and the crop had to fall back to
  // the viewport, which is a blank figure rather than a tight one.
  cropped: boolean
}

export interface ExportOptions {
  // False keeps the on-screen framing: the whole laid-out canvas, zoom state
  // and all.
  crop?: boolean
  // Drawn into the figure above the map, so it can be read away from the app.
  legend?: LegendSection[]
}

// The export writes its changes into the live drawing and puts every one of
// them back afterwards, rather than serializing a copy: a whole-pangenome
// figure runs to hundreds of thousands of elements, and cloning that costs as
// much as drawing it did. Nothing repaints mid-task, so the borrowed drawing is
// never on screen in its export state.
interface SavedAttribute {
  element: Element
  name: string
  value: string | null
}

function borrowAttribute(
  saved: SavedAttribute[],
  element: Element,
  name: string,
  value: string | null,
): void {
  saved.push({ element, name, value: element.getAttribute(name) })
  if (value === null) {
    element.removeAttribute(name)
  } else {
    element.setAttribute(name, value)
  }
}

function returnAttributes(saved: SavedAttribute[]): void {
  for (const { element, name, value } of saved) {
    if (value === null) {
      element.removeAttribute(name)
    } else {
      element.setAttribute(name, value)
    }
  }
}

// Everything the renderer does to the DOM for the sake of the screen, undone.
// Called only for a cropped figure: `viewport` exports are meant to reproduce
// what the window showed, zoom state included.
function undoViewportState(svg: Element, saved: SavedAttribute[]): void {
  // The zoom transform on the content group fits the drawing to the viewport
  // and centres it. Dropping it puts the map back at natural scale, which is
  // what makes a figure reproducible from the data alone.
  for (
    let group = svg.firstElementChild;
    group;
    group = group.nextElementSibling
  ) {
    borrowAttribute(saved, group, 'transform', null)
    if (group.getAttribute('style') === '') {
      // Left behind by the pan/zoom hit-testing toggle.
      borrowAttribute(saved, group, 'style', null)
    }
  }

  // Node labels carry a counter-scale so they stay legible as the map is zoomed
  // out; at natural scale that would just make them oversized.
  for (const label of svg.querySelectorAll('.node-label-group')) {
    const anchor = /translate\([^)]*\)/.exec(
      label.getAttribute('transform') ?? '',
    )
    if (anchor) {
      borrowAttribute(saved, label, 'transform', anchor[0])
    }
  }

  // Per-base detail the renderer hides below its zoom threshold. A figure is
  // read at whatever size it is printed, so the detail belongs in the file.
  // `display` is the only inline style these layers ever carry.
  for (const layer of svg.querySelectorAll(
    '.mismatches-layer, .sequence-labels-layer',
  )) {
    borrowAttribute(saved, layer, 'style', null)
  }
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function viewBox({ x, y, width, height }: Box): string {
  return `${x} ${y} ${width} ${height}`
}

// The legend sits above the drawing's top-left corner rather than over it, so
// it can never hide the thing it describes, and the figure grows upwards to
// make room.
function placeLegend(
  svg: Element,
  sections: LegendSection[],
  content: Box,
): { node: Element; box: Box } | null {
  const doc = svg.ownerDocument
  const { node, width, height } = legendGroup(doc, sections)
  node.setAttribute(
    'transform',
    `translate(${content.x},${content.y - LEGEND_GAP - height})`,
  )
  svg.appendChild(node)
  return {
    node,
    box: {
      x: content.x,
      y: content.y - LEGEND_GAP - height,
      width,
      height: height + LEGEND_GAP,
    },
  }
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

export function exportSvg(
  svg: Element,
  options: ExportOptions = {},
): SvgExport {
  const { crop = true, legend } = options
  const saved: SavedAttribute[] = []
  let placed: { node: Element; box: Box } | null = null
  const viewport = `0 0 ${svg.getAttribute('width') ?? 0} ${svg.getAttribute('height') ?? 0}`
  try {
    if (crop) {
      undoViewportState(svg, saved)
    }
    const { box, nonFinite } = measureSvgContent(svg)
    const pad = CROP_MARGIN
    const padded = box && {
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + 2 * pad,
      height: box.height + 2 * pad,
    }
    // Appended after undoViewportState, whose reach is the drawing rather than
    // anything the export adds, and after the measurement it is placed from.
    if (legend && legend.length > 0 && padded) {
      placed = placeLegend(svg, legend, padded)
    }
    borrowAttribute(
      saved,
      svg,
      'viewBox',
      crop && padded
        ? viewBox(placed ? union(padded, placed.box) : padded)
        : viewport,
    )
    // Trade the pixel size for the viewBox so viewers scale the map fluidly.
    borrowAttribute(saved, svg, 'width', null)
    borrowAttribute(saved, svg, 'height', null)

    const xml = new XMLSerializer().serializeToString(svg)
    return {
      xml: `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`,
      nonFinite,
      cropped: crop && box !== null,
    }
  } finally {
    placed?.node.remove()
    returnAttributes(saved)
  }
}
