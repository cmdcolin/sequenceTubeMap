import { urlParamsToViewTarget, viewTargetToUrlParams } from './urlViewTarget.ts'
import type { ViewTarget } from './Types.ts'

const roundTrip = (target: ViewTarget) =>
  urlParamsToViewTarget(
    `http://localhost/?${viewTargetToUrlParams(target)}`,
  )

describe('urlViewTarget round trip', () => {
  it('preserves booleans at every level', () => {
    const target: ViewTarget = {
      region: 'x:1-100',
      tracks: [
        {
          trackType: 'graph',
          trackFile: 'exampleData/x.vg.xg',
          trackColorSettings: {
            mainPalette: 'greys',
            auxPalette: '#ff0000',
            colorReadsByMappingQuality: false,
            alphaReadsByMappingQuality: true,
          },
        },
        {
          trackType: 'read',
          trackFile: 'exampleData/x.gam',
          trackDisplayName: 'reads.gam',
        },
      ],
      bedFile: 'exampleData/x.bed',
      name: 'x',
      dataType: 'built-in',
      simplify: false,
      removeSequences: true,
      skipAutoLoad: false,
    }

    expect(roundTrip(target)).toEqual(target)
  })

  it('keeps false flags as booleans rather than the string "false"', () => {
    const parsed = roundTrip({
      region: 'x:1-100',
      tracks: [{ trackType: 'graph', trackFile: 'x.vg' }],
      simplify: false,
      removeSequences: false,
      skipAutoLoad: false,
    })

    expect(parsed?.simplify).toBe(false)
    expect(parsed?.removeSequences).toBe(false)
    expect(parsed?.skipAutoLoad).toBe(false)
  })

  it('returns null for a query with no view target', () => {
    expect(urlParamsToViewTarget('http://localhost/?utm_source=email')).toBe(
      null,
    )
    expect(urlParamsToViewTarget('http://localhost/')).toBe(null)
  })

  it('drops tracks with an unknown track type', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/?region=x:1-100&tracks[0][trackType]=bogus&tracks[1][trackType]=graph&tracks[1][trackFile]=x.vg',
    )

    expect(parsed?.tracks).toEqual([
      { trackType: 'graph', trackFile: 'x.vg' },
    ])
  })

  it('ignores a color setting with an unknown palette', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/?region=x:1-100&tracks[0][trackType]=graph&tracks[0][trackColorSettings][mainPalette]=bogus&tracks[0][trackColorSettings][auxPalette]=reds',
    )

    expect(parsed?.tracks[0]?.trackColorSettings).toBe(undefined)
  })
})
