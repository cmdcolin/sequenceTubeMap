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

import { measureSvgContent } from './svgBounds.ts'

// Breathing room around the cropped drawing so edge strokes and the outermost
// sequence labels aren't shaved off.
const CROP_MARGIN = 10

export interface SvgExport {
  xml: string
  // Shapes the layout gave non-finite coordinates. They are missing from the
  // picture, so a caller that can warn should.
  nonFinite: number
  // False when nothing measurable was drawn and the crop had to fall back to
  // the viewport, which is a blank figure rather than a tight one.
  cropped: boolean
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

// `crop` false keeps the on-screen framing: the whole laid-out canvas, zoom
// state and all.
export function exportSvg(svg: Element, crop = true): SvgExport {
  const saved: SavedAttribute[] = []
  const viewport = `0 0 ${svg.getAttribute('width') ?? 0} ${svg.getAttribute('height') ?? 0}`
  try {
    if (crop) {
      undoViewportState(svg, saved)
    }
    const { box, nonFinite } = measureSvgContent(svg)
    const pad = CROP_MARGIN
    borrowAttribute(
      saved,
      svg,
      'viewBox',
      crop && box
        ? `${box.x - pad} ${box.y - pad} ${box.width + 2 * pad} ${box.height + 2 * pad}`
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
    returnAttributes(saved)
  }
}
