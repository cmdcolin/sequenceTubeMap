import { readFileSync } from 'fs'
import {
  urlParamsToViewTarget,
  urlParamsToVisOptions,
  viewTargetToUrlParams,
} from './urlViewTarget.ts'
import { DEFAULT_VIS_OPTIONS } from './util/visOptions.ts'
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

describe('urlViewTarget vis options', () => {
  it('round trips only the options that differ from the defaults', () => {
    const params = viewTargetToUrlParams(
      { region: 'x:1-100', tracks: [] },
      { ...DEFAULT_VIS_OPTIONS, compressedView: true, coarsenedReadView: true },
    )

    expect(params).toContain('visOptions[compressedView]=true')
    expect(params).not.toContain('showReads')
    expect(urlParamsToVisOptions(`http://localhost/?${params}`)).toEqual({
      compressedView: true,
      coarsenedReadView: true,
    })
  })

  it('leaves the options the URL does not name to the stored preference', () => {
    expect(urlParamsToVisOptions('http://localhost/?region=x:1-100')).toEqual(
      {},
    )
    expect(
      urlParamsToVisOptions(
        'http://localhost/?visOptions[showReads]=false&visOptions[mappingQualityCutoff]=20',
      ),
    ).toEqual({ showReads: false, mappingQualityCutoff: 20 })
  })
})

// The README's figures link into the live demo, and those links only work if
// they still parse into a loadable view, so check them rather than trusting
// that a config rename was followed through.
describe('README demo links', () => {
  const links = [
    ...readFileSync('README.md', 'utf8').matchAll(
      /^\[demo-[a-z0-9-]+\]:\s+(\S+)$/gm,
    ),
  ].map(match => match[1]!)

  it('has links to check', () => {
    expect(links.length).toBeGreaterThan(0)
  })

  it.each(links)('%s loads a graph track and a region', link => {
    const target = urlParamsToViewTarget(link)

    expect(target?.region).toMatch(/:\d+-\d+$/)
    expect(target?.tracks[0]?.trackType).toBe('graph')
    expect(target?.tracks.every(track => track.trackFile !== undefined)).toBe(
      true,
    )
  })

  it('carries the coarsened view on the coarsened figure link', () => {
    const coarsened = links.find(link => link.includes('coarsenedReadView'))!

    expect(urlParamsToVisOptions(coarsened)).toEqual({
      compressedView: true,
      coarsenedReadView: true,
    })
  })
})

describe('urlViewTarget fragment params', () => {
  it('reads a view out of the fragment', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/#?region=x:1-100&tracks[0][trackType]=graph&tracks[0][trackFile]=x.vg&visOptions[compressedView]=true',
    )

    expect(parsed).toEqual({
      region: 'x:1-100',
      tracks: [{ trackType: 'graph', trackFile: 'x.vg' }],
      bedFile: undefined,
      name: undefined,
      dataType: undefined,
      simplify: undefined,
      removeSequences: undefined,
      skipAutoLoad: undefined,
    })
  })

  it('reads vis options out of the fragment, past the #local dev flag', () => {
    expect(
      urlParamsToVisOptions(
        'http://localhost/#local&region=x:1-100&visOptions[compressedView]=true',
      ),
    ).toEqual({ compressedView: true })
  })

  it('prefers the query string when both carry a view', () => {
    expect(
      urlParamsToViewTarget(
        'http://localhost/?region=q:1-2&tracks[0][trackType]=graph#?region=h:1-2&tracks[0][trackType]=graph',
      )?.region,
    ).toBe('q:1-2')
  })
})
