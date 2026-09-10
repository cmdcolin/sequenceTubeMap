// The color legend as SVG, for figures that leave the app. The HTML panel in
// Legend.tsx draws the same sections for the screen; this one has to survive
// being a file, so it carries no CSS and measures its own text.

import type { LegendSection } from './legend.ts'
import { PALETTES } from './palettes.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Courier New advances 0.6em per character, so a monospace stack is what lets
// the panel size itself without a layout engine to ask. tubemap.ts draws its
// own labels in the same stack.
const FONT = '"Courier New", "Courier", "Lucida Console", monospace'
const CHAR_WIDTH = 0.6
const FONT_SIZE = 12
const LINE = 16
const PAD = 8
const SWATCH_WIDTH = 72
const SWATCH_HEIGHT = 11
const GAP = 8
const INDENT = 10
const TITLE = 'Color legend'

function textWidth(text: string, size = FONT_SIZE): number {
  return text.length * size * CHAR_WIDTH
}

// A palette's colors, or the single color a hex names. Unknown names would
// otherwise draw an empty swatch, so they fall back the way getColorSet does.
function swatchColors(palette: string): readonly string[] {
  return palette.startsWith('#')
    ? [palette]
    : (PALETTES.find(p => p.name === palette)?.colors ??
        PALETTES.find(p => p.name === 'greys')!.colors)
}

function element(
  doc: Document,
  name: string,
  attributes: Record<string, string | number>,
): SVGElement {
  const node = doc.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value))
  }
  return node
}

function label(
  doc: Document,
  text: string,
  x: number,
  y: number,
  weight: 'normal' | 'bold',
): SVGElement {
  const node = element(doc, 'text', {
    x,
    y,
    'font-family': FONT,
    'font-size': FONT_SIZE,
    'font-weight': weight,
    fill: '#000000',
  })
  node.textContent = text
  return node
}

// Every color in the palette, side by side: a sequential palette reads as a
// ramp and a categorical one as a set, without needing a gradient <defs> that
// a cropped figure would have to carry.
function swatch(
  doc: Document,
  palette: string,
  x: number,
  y: number,
): SVGElement {
  const group = element(doc, 'g', {})
  const colors = swatchColors(palette)
  const width = SWATCH_WIDTH / colors.length
  colors.forEach((color, i) => {
    group.appendChild(
      element(doc, 'rect', {
        x: x + i * width,
        y,
        width,
        height: SWATCH_HEIGHT,
        fill: color,
      }),
    )
  })
  group.appendChild(
    element(doc, 'rect', {
      x,
      y,
      width: SWATCH_WIDTH,
      height: SWATCH_HEIGHT,
      fill: 'none',
      stroke: '#cccccc',
      'stroke-width': 1,
    }),
  )
  return group
}

function sectionHeading(section: LegendSection): string {
  return `${section.label} (${section.kind})`
}

export interface LegendBox {
  node: SVGElement
  width: number
  height: number
}

// The panel, laid out with its top-left corner at the origin. The caller
// positions it with a transform, which is also what keeps this measurable:
// nothing here depends on where it ends up.
export function legendGroup(
  doc: Document,
  sections: LegendSection[],
): LegendBox {
  const rows = sections.reduce((n, s) => n + 1 + Math.max(s.rows.length, 1), 0)
  const height = PAD * 2 + LINE * (rows + 1)
  const width =
    PAD * 2 +
    Math.max(
      textWidth(TITLE),
      ...sections.map(s => textWidth(sectionHeading(s))),
      ...sections.flatMap(s =>
        s.rows.map(row => INDENT + textWidth(row.label) + GAP + SWATCH_WIDTH),
      ),
    )

  const group = element(doc, 'g', { class: 'legend' })
  group.appendChild(
    element(doc, 'rect', {
      x: 0,
      y: 0,
      width,
      height,
      rx: 4,
      fill: '#fafafa',
      stroke: '#dddddd',
      'stroke-width': 1,
    }),
  )

  let y = PAD + FONT_SIZE
  group.appendChild(label(doc, TITLE, PAD, y, 'bold'))
  for (const section of sections) {
    y += LINE
    group.appendChild(label(doc, sectionHeading(section), PAD, y, 'bold'))
    if (section.rows.length === 0) {
      y += LINE
      group.appendChild(
        label(doc, 'no color scheme', PAD + INDENT, y, 'normal'),
      )
    }
    for (const row of section.rows) {
      y += LINE
      group.appendChild(label(doc, row.label, PAD + INDENT, y, 'normal'))
      group.appendChild(
        swatch(doc, row.palette, width - PAD - SWATCH_WIDTH, y - FONT_SIZE + 2),
      )
    }
  }

  return { node: group, width, height }
}
