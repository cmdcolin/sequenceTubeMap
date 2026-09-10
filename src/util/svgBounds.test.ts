import { describe, expect, it } from 'vitest'
import { measureSvgContent } from './svgBounds.ts'

function boundsOf(root: Element) {
  return measureSvgContent(root).box
}

function brokenIn(root: Element) {
  return measureSvgContent(root).nonFinite
}

function svgFrom(inner: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
    'image/svg+xml',
  )
  return doc.documentElement as unknown as SVGSVGElement
}

describe('measureSvgContent — bounds', () => {
  it('returns null when nothing is drawn', () => {
    expect(boundsOf(svgFrom(''))).toBeNull()
  })

  it('boxes a rectangle', () => {
    expect(
      boundsOf(svgFrom('<rect x="5" y="7" width="20" height="3"/>')),
    ).toEqual({ x: 5, y: 7, width: 20, height: 3 })
  })

  it('unions several shapes', () => {
    const box = boundsOf(
      svgFrom(
        '<rect x="0" y="0" width="10" height="10"/><line x1="-4" y1="2" x2="30" y2="2"/>',
      ),
    )
    expect(box).toEqual({ x: -4, y: 0, width: 34, height: 10 })
  })

  it('applies a group translate and scale', () => {
    const box = boundsOf(
      svgFrom(
        '<g transform="translate(100,50) scale(2)"><rect x="1" y="1" width="4" height="4"/></g>',
      ),
    )
    expect(box).toEqual({ x: 102, y: 52, width: 8, height: 8 })
  })

  it('composes nested transforms', () => {
    const box = boundsOf(
      svgFrom(
        '<g transform="translate(10,10) scale(2)"><g transform="translate(5,0)"><rect x="0" y="0" width="1" height="1"/></g></g>',
      ),
    )
    expect(box).toEqual({ x: 20, y: 10, width: 2, height: 2 })
  })

  it('ignores <defs>, which is positioned by whatever references it', () => {
    const box = boundsOf(
      svgFrom(
        '<defs><rect x="-500" y="-500" width="1" height="1"/></defs><rect x="0" y="0" width="4" height="4"/>',
      ),
    )
    expect(box).toEqual({ x: 0, y: 0, width: 4, height: 4 })
  })

  it('includes bezier control points, so the box contains the curve', () => {
    // The curve itself never reaches y=100, but staying inside the control
    // hull is what makes the box safe to crop to.
    const box = boundsOf(
      svgFrom('<path d="M 0 0 C 0 100 10 100 10 0"/>'),
    )
    expect(box).toEqual({ x: 0, y: 0, width: 10, height: 100 })
  })

  it('tracks the current point through H, V and Z', () => {
    const box = boundsOf(svgFrom('<path d="M 5 5 H 25 V 15 Z"/>'))
    expect(box).toEqual({ x: 5, y: 5, width: 20, height: 10 })
  })

  it('treats extra coordinate pairs after M as line-tos', () => {
    const box = boundsOf(svgFrom('<path d="M 0 0 3 9 -2 4"/>'))
    expect(box).toEqual({ x: -2, y: 0, width: 5, height: 9 })
  })

  it('handles relative commands', () => {
    const box = boundsOf(svgFrom('<path d="m 10 10 l 5 5 l -20 0"/>'))
    expect(box).toEqual({ x: -5, y: 10, width: 20, height: 5 })
  })

  it('boxes polygons, circles and text anchors', () => {
    expect(
      boundsOf(svgFrom('<polygon points="1,2 5,2 5,8"/>')),
    ).toEqual({ x: 1, y: 2, width: 4, height: 6 })
    expect(
      boundsOf(svgFrom('<circle cx="10" cy="10" r="3"/>')),
    ).toEqual({ x: 7, y: 7, width: 6, height: 6 })
    expect(boundsOf(svgFrom('<text x="4" y="9">hi</text>'))).toEqual({
      x: 4,
      y: 9,
      width: 0,
      height: 0,
    })
  })

  it('skips broken shapes rather than letting NaN poison the box', () => {
    // The tube map layout can emit NaN or undefined coordinates; without this
    // one bad shape would leave the whole export uncroppable.
    const box = boundsOf(
      svgFrom(
        '<rect x="NaN" y="4" width="NaN" height="2"/><rect x="0" y="0" width="6" height="6"/><path d="M undefined 3 L 2 2"/>',
      ),
    )
    expect(box).toEqual({ x: 0, y: 0, width: 6, height: 6 })
  })
})

describe('measureSvgContent — non-finite geometry', () => {
  it('is zero for a healthy drawing', () => {
    expect(
      brokenIn(
        svgFrom('<rect x="0" y="0" width="1" height="1"/>'),
      ),
    ).toBe(0)
  })

  it('counts each element carrying a non-finite coordinate', () => {
    expect(
      brokenIn(
        svgFrom(
          '<rect x="NaN" y="0" width="1" height="1"/><path d="M undefined 3 L 2 2"/><rect x="1" y="1" width="1" height="1"/>',
        ),
      ),
    ).toBe(2)
  })

  it('ignores <defs>', () => {
    expect(
      brokenIn(
        svgFrom('<defs><rect x="NaN" y="0" width="1" height="1"/></defs>'),
      ),
    ).toBe(0)
  })
})
