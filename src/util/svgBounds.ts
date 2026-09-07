// Bounding box of the geometry actually drawn in an SVG subtree.
//
// The tube map renderer's own layout bounds don't answer this: they exist to
// bound panning, and reversal and loop shapes are drawn outside them. Cropping
// an export needs the real extent, so measure the emitted elements instead.

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

// The transform forms the renderer emits. Anything else is ignored rather than
// guessed at, which would silently misplace whatever it applies to.
const TRANSLATE_SCALE =
  /translate\(\s*(-?[\d.e+-]+)[\s,]+(-?[\d.e+-]+)\s*\)(?:\s*scale\(\s*(-?[\d.e+-]+)\s*\))?/i

const PATH_TOKEN = /[a-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

interface Frame {
  tx: number
  ty: number
  k: number
}

function childFrame(element: Element, frame: Frame): Frame {
  const match = TRANSLATE_SCALE.exec(element.getAttribute('transform') ?? '')
  if (!match) {
    return frame
  }
  const k = match[3] === undefined ? 1 : Number(match[3])
  return {
    tx: frame.tx + frame.k * Number(match[1]),
    ty: frame.ty + frame.k * Number(match[2]),
    k: frame.k * k,
  }
}

function num(element: Element, name: string): number {
  return Number(element.getAttribute(name) ?? 0)
}

// Every point a path visits, including bezier control points: a curve stays
// inside the hull of its control points, so the box this yields contains the
// curve even though it may be a little larger than it.
function pathPoints(d: string): Point[] {
  const tokens = d.match(PATH_TOKEN) ?? []
  const points: Point[] = []
  let command = 'M'
  let start: Point = { x: 0, y: 0 }
  let x = 0
  let y = 0
  let i = 0
  const take = () => Number(tokens[i++])
  const visit = (px: number, py: number) => {
    points.push({ x: px, y: py })
  }
  while (i < tokens.length) {
    const token = tokens[i]
    if (token !== undefined && /[a-z]/i.test(token)) {
      command = token
      i += 1
      if (command === 'Z' || command === 'z') {
        x = start.x
        y = start.y
        continue
      }
    }
    const relative = command === command.toLowerCase()
    const baseX = relative ? x : 0
    const baseY = relative ? y : 0
    switch (command.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T':
        x = baseX + take()
        y = baseY + take()
        if (command.toUpperCase() === 'M') {
          start = { x, y }
          command = relative ? 'l' : 'L'
        }
        break
      case 'H':
        x = baseX + take()
        break
      case 'V':
        y = baseY + take()
        break
      case 'C':
        visit(baseX + take(), baseY + take())
        visit(baseX + take(), baseY + take())
        x = baseX + take()
        y = baseY + take()
        break
      case 'S':
      case 'Q':
        visit(baseX + take(), baseY + take())
        x = baseX + take()
        y = baseY + take()
        break
      case 'A':
        i += 5
        x = baseX + take()
        y = baseY + take()
        break
      default:
        // An unrecognised command leaves the rest of the path unparseable.
        return points
    }
    visit(x, y)
  }
  return points
}

function elementPoints(element: Element): Point[] {
  switch (element.tagName.toLowerCase()) {
    case 'rect':
      return [
        { x: num(element, 'x'), y: num(element, 'y') },
        {
          x: num(element, 'x') + num(element, 'width'),
          y: num(element, 'y') + num(element, 'height'),
        },
      ]
    case 'line':
      return [
        { x: num(element, 'x1'), y: num(element, 'y1') },
        { x: num(element, 'x2'), y: num(element, 'y2') },
      ]
    case 'circle':
    case 'ellipse': {
      const rx = element.hasAttribute('r')
        ? num(element, 'r')
        : num(element, 'rx')
      const ry = element.hasAttribute('r')
        ? num(element, 'r')
        : num(element, 'ry')
      return [
        { x: num(element, 'cx') - rx, y: num(element, 'cy') - ry },
        { x: num(element, 'cx') + rx, y: num(element, 'cy') + ry },
      ]
    }
    case 'polyline':
    case 'polygon': {
      const numbers = (element.getAttribute('points') ?? '')
        .split(/[\s,]+/)
        .filter(v => v !== '')
        .map(Number)
      const points: Point[] = []
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        points.push({ x: numbers[i]!, y: numbers[i + 1]! })
      }
      return points
    }
    case 'path':
      return pathPoints(element.getAttribute('d') ?? '')
    // Glyph extents need a real layout engine, so a label contributes only
    // where it is anchored.
    case 'text':
      return [{ x: num(element, 'x'), y: num(element, 'y') }]
    default:
      return []
  }
}

// Sibling links rather than `element.children`: that returns a live
// HTMLCollection, and reading its length goes through jsdom's named-property
// lookup, which rescans the subtree on every access. Walking a drawing with
// tens of thousands of elements that way is quadratic and takes minutes.
function forEachChild(element: Element, visit: (child: Element) => void): void {
  let child = element.firstElementChild
  while (child) {
    visit(child)
    child = child.nextElementSibling
  }
}

export function svgContentBounds(root: Element): Box | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const walk = (element: Element, frame: Frame) => {
    // <defs> content is a template positioned by whatever references it, not
    // something drawn where its coordinates say.
    if (element.tagName.toLowerCase() !== 'defs') {
      const here = childFrame(element, frame)
      for (const point of elementPoints(element)) {
        const x = here.tx + here.k * point.x
        const y = here.ty + here.k * point.y
        // A NaN coordinate would otherwise poison every comparison and leave
        // the whole box unusable, so drop the broken shape and keep the rest.
        // Callers that care can ask separately -- see nonFiniteGeometryCount.
        if (Number.isFinite(x) && Number.isFinite(y)) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }
      forEachChild(element, child => {
        walk(child, here)
      })
    }
  }
  forEachChild(root, child => {
    walk(child, { tx: 0, ty: 0, k: 1 })
  })

  return minX <= maxX && minY <= maxY
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : null
}

// How many elements in the subtree carry a coordinate that isn't a finite
// number. Always zero for a healthy render: it means the layout produced NaN
// or undefined, and those shapes are silently absent from the picture.
export function nonFiniteGeometryCount(root: Element): number {
  let broken = 0
  const walk = (element: Element) => {
    if (element.tagName.toLowerCase() !== 'defs') {
      if (
        elementPoints(element).some(
          point => !Number.isFinite(point.x) || !Number.isFinite(point.y),
        )
      ) {
        broken += 1
      }
      forEachChild(element, walk)
    }
  }
  forEachChild(root, walk)
  return broken
}
