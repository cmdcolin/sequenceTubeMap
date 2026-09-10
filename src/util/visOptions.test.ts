// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { dataOriginTypes } from '../enums.ts'
import { exampleColorSchemes } from './visOptions.ts'

describe('exampleColorSchemes', () => {
  it('mutes the graph and keeps both read strands on the alignment examples', () => {
    for (const origin of [
      dataOriginTypes.EXAMPLE_6,
      dataOriginTypes.EXAMPLE_7,
    ]) {
      const [graph, reads] = exampleColorSchemes(origin)
      // A haplotype takes its color from auxPalette; mainPalette only supplies
      // the reference path's, so both have to be grey for the graph to recede.
      expect(graph?.mainPalette).toBe('greys')
      expect(graph?.auxPalette).toBe('greys')
      expect(reads?.mainPalette).not.toBe(reads?.auxPalette)
    }
  })

  it('colors the structural examples categorically', () => {
    const [graph] = exampleColorSchemes(dataOriginTypes.EXAMPLE_1)
    expect(graph?.auxPalette).toBe('lightColors')
  })

  it('describes the read track even where an example has no reads', () => {
    // The legend lists a read track for every example, and reads that do turn
    // up (examples 8 and 9) are drawn from this same pair.
    const [, reads] = exampleColorSchemes(dataOriginTypes.EXAMPLE_1)
    expect(reads?.mainPalette).toBe('blues')
    expect(reads?.auxPalette).toBe('reds')
  })

  it('falls back rather than leaving a render with no scheme at all', () => {
    expect(exampleColorSchemes('not an example')[0]).toEqual(
      exampleColorSchemes(dataOriginTypes.EXAMPLE_1)[0],
    )
  })
})
