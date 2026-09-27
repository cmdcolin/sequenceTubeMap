// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { lab } from 'd3'
import { haplotypeShareColor, haplotypeShareRamp } from './palettes.ts'

describe('haplotypeShareColor', () => {
  it('runs from one haplotype at the pale end to all of them at the dark end', () => {
    const ramp = haplotypeShareRamp()
    expect(haplotypeShareColor({ count: 1, total: 4000 })).toBe(ramp[0])
    expect(haplotypeShareColor({ count: 4000, total: 4000 })).toBe(ramp.at(-1))
    expect(haplotypeShareColor({ count: 1, total: 1 })).toBe(ramp.at(-1))
  })

  it('darkens as the share grows, at both ends of the range', () => {
    const lightness = [1, 3, 10, 116, 232, 347, 417, 463].map(
      count => lab(haplotypeShareColor({ count, total: 463 })).l,
    )
    for (let i = 1; i < lightness.length; i += 1) {
      expect(lightness[i]).toBeLessThan(lightness[i - 1]!)
    }
  })

  it('shades reverse-strand bands on a hue of their own', () => {
    const share = { count: 5, total: 10 }
    expect(haplotypeShareColor(share, true)).not.toBe(
      haplotypeShareColor(share),
    )
    expect(haplotypeShareRamp(true)).not.toEqual(haplotypeShareRamp())
  })
})
