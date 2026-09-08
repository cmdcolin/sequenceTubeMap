import { readFileSync } from 'fs'
import './config-client.js'
import { config } from './config-global.mjs'
import {
  fragmentWithoutView,
  urlParamsToViewTarget,
  urlParamsToVisOptions,
  viewTargetToUrlParams,
} from './urlViewTarget.ts'
import { DEFAULT_VIS_OPTIONS, VIS_OPTION_FLAGS } from './util/visOptions.ts'
import type { Track, ViewTarget } from './Types.ts'

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
      simplify: true,
      removeSequences: true,
    }

    expect(roundTrip(target)).toEqual(target)
  })

  it('omits the boolean flags that are false, which the app reads as absent', () => {
    const params = viewTargetToUrlParams({
      region: 'x:1-100',
      tracks: [{ trackType: 'graph', trackFile: 'x.vg' }],
      simplify: false,
      removeSequences: false,
      skipAutoLoad: false,
    })

    expect(params).not.toContain('simplify')
    expect(params).not.toContain('removeSequences')
    expect(params).not.toContain('skipAutoLoad')
  })

  it('returns null for a query with no view target', () => {
    expect(urlParamsToViewTarget('http://localhost/?utm_source=email')).toBe(
      null,
    )
    expect(urlParamsToViewTarget('http://localhost/')).toBe(null)
  })

  it('drops tracks with an unknown track type', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/?region=x:1-100&tracksJson=[{"trackType":"bogus"},{"trackType":"graph","trackFile":"x.vg"}]',
    )

    expect(parsed?.tracks).toEqual([{ trackType: 'graph', trackFile: 'x.vg' }])
  })

  it('round trips a view with no tracks selected', () => {
    const parsed = roundTrip({ region: 'x:1-100', tracks: [] })

    expect(parsed).not.toBe(null)
    expect(parsed?.tracks).toEqual([])
  })

  it('rejects a bed track, which has no color scheme and cannot render', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/?region=x:1-100&tracks=bed:x.bed',
    )

    expect(parsed?.tracks).toEqual([])
  })

  it('keeps track order for a long list', () => {
    const tracks = Array.from({ length: 25 }, (_, i) => ({
      trackType: 'graph' as const,
      trackFile: `t${i}.vg`,
    }))

    expect(roundTrip({ region: 'x:1-100', tracks })?.tracks).toEqual(tracks)
  })

  it('ignores a color setting with an unknown palette', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/?region=x:1-100&tracks=graph:x.vg&colors=bogus/reds',
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

    expect(params).toContain('vis=compressedView,coarsenedReadView')
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
      urlParamsToVisOptions('http://localhost/?vis=-showReads&mapq=20'),
    ).toEqual({ showReads: false, mappingQualityCutoff: 20 })
  })
})

// The README's figures link into the live demo by data source name, so they
// only work while that name is still in the config. Resolving them here is
// what turns a rename into a failing test rather than four dead links.
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
    const target = urlParamsToViewTarget(link, config.DATA_SOURCES)

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
      'http://localhost/#?region=x:1-100&tracks=graph:x.vg&vis=compressedView',
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
        'http://localhost/#local&region=x:1-100&vis=compressedView',
      ),
    ).toEqual({ compressedView: true })
  })

  it('reads a fragment view past an appended tracking param', () => {
    const parsed = urlParamsToViewTarget(
      'http://localhost/?utm_source=email#?region=x:1-100&tracks=graph:x.vg',
    )

    expect(parsed?.region).toBe('x:1-100')
    expect(parsed?.tracks).toEqual([{ trackType: 'graph', trackFile: 'x.vg' }])
  })

  it('prefers the query string when both carry a view', () => {
    expect(
      urlParamsToViewTarget(
        'http://localhost/?region=q:1-2&tracks=graph:x.vg#?region=h:1-2&tracks=graph:x.vg',
      )?.region,
    ).toBe('q:1-2')
  })
})

describe('fragmentWithoutView', () => {
  it('drops the view params and keeps the dev flag valueless', () => {
    expect(
      fragmentWithoutView('#local&region=x:1-100&tracks=graph:x.vg&vis=compressedView'),
    ).toBe('local')
  })

  it('keeps params it does not own', () => {
    expect(fragmentWithoutView('#?region=x:1-100&utm_source=email')).toBe(
      'utm_source=email',
    )
  })

  it('drops percent-encoded view params too', () => {
    expect(fragmentWithoutView('#tracks=graph%3Ax.vg&local')).toBe('local')
  })

  it('empties a fragment that is nothing but a view', () => {
    expect(fragmentWithoutView('#?region=x:1-100')).toBe('')
  })
})

describe('tracks short form', () => {
  const parse = (query: string) =>
    urlParamsToViewTarget(`http://localhost/?region=x:1-100&${query}`)

  it('writes an explicit type prefix so a link never depends on inference', () => {
    expect(
      viewTargetToUrlParams({
        region: 'x:1-100',
        tracks: [
          { trackType: 'graph', trackFile: 'a.gbz.db' },
          { trackType: 'read', trackFile: 'b.gam' },
        ],
      }),
    ).toBe('region=x:1-100&tracks=graph:a.gbz.db,read:b.gam')
  })

  it('infers a missing type from the extension', () => {
    expect(parse('tracks=a.gbz.db,b.gam,c.gbwt,d.gaf.gz')?.tracks).toEqual([
      { trackType: 'graph', trackFile: 'a.gbz.db' },
      { trackType: 'read', trackFile: 'b.gam' },
      { trackType: 'haplotype', trackFile: 'c.gbwt' },
      { trackType: 'read', trackFile: 'd.gaf.gz' },
    ])
  })

  it('reads a .gbz as a graph unless the link says otherwise', () => {
    expect(parse('tracks=a.gbz')?.tracks[0]?.trackType).toBe('graph')
    expect(parse('tracks=haplotype:a.gbz')?.tracks[0]?.trackType).toBe(
      'haplotype',
    )
  })

  it('infers past a presigned URL query string', () => {
    expect(parse('tracks=https://h/g.gbz.db?sig%3Dabc')?.tracks).toEqual([
      { trackType: 'graph', trackFile: 'https://h/g.gbz.db?sig=abc' },
    ])
  })

  it('keeps a http(s) path whole rather than reading it as a type prefix', () => {
    expect(parse('tracks=https://h/g.gbz.db')?.tracks[0]?.trackFile).toBe(
      'https://h/g.gbz.db',
    )
  })

  it('drops an entry whose type can be neither named nor inferred', () => {
    expect(parse('tracks=a.gbz.db,mystery')?.tracks).toEqual([
      { trackType: 'graph', trackFile: 'a.gbz.db' },
    ])
  })

  // The same rule that keeps `https://host/g.gbz.db` in one piece: only a
  // known track type is a prefix, so anything else is part of the path.
  it('treats an unrecognised prefix as part of the filename', () => {
    expect(parse('tracks=bogus:x.gam')?.tracks).toEqual([
      { trackType: 'read', trackFile: 'bogus:x.gam' },
    ])
  })

  it('survives a comma inside a filename', () => {
    const tracks: Track[] = [{ trackType: 'graph', trackFile: 'a,b.gbz.db' }]
    const params = viewTargetToUrlParams({ region: 'x:1-100', tracks })

    expect(params).toContain('%2C')
    expect(urlParamsToViewTarget(`http://localhost/?${params}`)?.tracks).toEqual(
      tracks,
    )
  })

  it('carries palettes positionally, empty where a track takes its default', () => {
    const tracks: Track[] = [
      { trackType: 'graph', trackFile: 'a.gbz.db' },
      {
        trackType: 'read',
        trackFile: 'b.gam',
        trackColorSettings: {
          mainPalette: 'blues',
          auxPalette: '#ff0000',
          colorReadsByMappingQuality: false,
          alphaReadsByMappingQuality: false,
        },
      },
    ]
    const params = viewTargetToUrlParams({ region: 'x:1-100', tracks })

    expect(params).toContain('colors=,blues/%23ff0000')
    expect(urlParamsToViewTarget(`http://localhost/?${params}`)?.tracks).toEqual(
      tracks,
    )
  })

  it('leaves colors out entirely when every track takes its default', () => {
    expect(
      viewTargetToUrlParams({
        region: 'x:1-100',
        tracks: [{ trackType: 'graph', trackFile: 'a.gbz.db' }],
      }),
    ).not.toContain('colors')
  })
})

describe('tracksJson escape hatch', () => {
  it('falls back to JSON for a track the short form cannot say', () => {
    const tracks: Track[] = [
      { trackType: 'graph', trackFile: undefined },
      { trackType: 'read', trackFile: 'b.gam', trackDisplayName: 'reads.gam' },
    ]
    const params = viewTargetToUrlParams({ region: 'x:1-100', tracks })

    expect(params).toContain('tracksJson=')
    expect(urlParamsToViewTarget(`http://localhost/?${params}`)?.tracks).toEqual(
      tracks,
    )
  })

  it('falls back for the per-track mapping-quality color flags', () => {
    expect(
      viewTargetToUrlParams({
        region: 'x:1-100',
        tracks: [
          {
            trackType: 'read',
            trackFile: 'b.gam',
            trackColorSettings: {
              mainPalette: 'blues',
              auxPalette: 'reds',
              colorReadsByMappingQuality: true,
              alphaReadsByMappingQuality: false,
            },
          },
        ],
      }),
    ).toContain('tracksJson=')
  })

  it('ignores malformed JSON rather than throwing', () => {
    expect(
      urlParamsToViewTarget('http://localhost/?region=x:1-100&tracksJson=%7Bnope'),
    ).toBe(null)
  })
})

describe('vis short form', () => {
  const visOf = (query: string) =>
    urlParamsToVisOptions(`http://localhost/?${query}`)

  it('turns a default-on flag off with a - prefix', () => {
    expect(visOf('vis=compressedView,-showReads')).toEqual({
      compressedView: true,
      showReads: false,
    })
  })

  it('lets the last mention of a flag win', () => {
    expect(visOf('vis=showReads,-showReads')).toEqual({ showReads: false })
  })

  it('ignores an unknown flag name', () => {
    expect(visOf('vis=bogus,compressedView')).toEqual({ compressedView: true })
  })

  it('reads the mapping quality cutoff from mapq', () => {
    expect(visOf('mapq=20')).toEqual({ mappingQualityCutoff: 20 })
  })

  it('round trips a cutoff', () => {
    const params = viewTargetToUrlParams(
      { region: 'x:1-100', tracks: [] },
      { ...DEFAULT_VIS_OPTIONS, mappingQualityCutoff: 30 },
    )

    expect(params).toContain('mapq=30')
    expect(visOf(params)).toEqual({ mappingQualityCutoff: 30 })
  })
})

describe('name resolution against configured data sources', () => {
  const dataSources: ViewTarget[] = [
    {
      name: 'snp1kg-BRCA1',
      region: '17:1-100',
      bedFile: 'exampleData/snp1kg-BRCA1.bed',
      dataType: 'built-in',
      tracks: [{ trackType: 'graph', trackFile: 'exampleData/snp1kg.gbz.db' }],
    },
  ]

  it('resolves a name with no tracks to the configured source', () => {
    expect(
      urlParamsToViewTarget(
        'http://localhost/?name=snp1kg-BRCA1',
        dataSources,
      ),
    ).toEqual(dataSources[0])
  })

  it('layers the params beside the name over the source', () => {
    const target = urlParamsToViewTarget(
      'http://localhost/?name=snp1kg-BRCA1&region=17:1-1000',
      dataSources,
    )

    expect(target?.region).toBe('17:1-1000')
    expect(target?.tracks).toEqual(dataSources[0]!.tracks)
  })

  it('leaves an unknown name unresolved rather than guessing a source', () => {
    expect(
      urlParamsToViewTarget('http://localhost/?name=nonesuch', dataSources),
    ).toBe(null)
  })

  it('prefers the tracks a link spells out over the configured source', () => {
    expect(
      urlParamsToViewTarget(
        'http://localhost/?name=snp1kg-BRCA1&region=x:1-2&tracks=graph:other.gbz.db',
        dataSources,
      )?.tracks,
    ).toEqual([{ trackType: 'graph', trackFile: 'other.gbz.db' }])
  })
})

// doc/urlparams.md is the contract for what a link may say, and a documented
// syntax that no longer parses is worse than none, so the examples in it are
// run rather than trusted.
describe('doc/urlparams.md examples', () => {
  const examples = [
    ...readFileSync('doc/urlparams.md', 'utf8').matchAll(/```\n([\s\S]*?)```/g),
  ]
    .map(match => match[1]!.trim().replace(/\n\s*/g, ''))
    .map(block => block.replace(/^https?:\/\/[^?]*\??/, '').replace(/^\?/, ''))

  it('has examples to check', () => {
    expect(examples.length).toBeGreaterThan(5)
  })

  // Several examples show one parameter in isolation, which cannot make a view
  // on its own, so they are read against a view that supplies the rest. An
  // example naming its own tracks overrides the base ones.
  const base = 'region=x:1-2&tracks=graph:a.gbz.db,read:b.gam,haplotype:c.gbwt'

  it.each(examples)('%s makes a view', example => {
    const target = urlParamsToViewTarget(
      `http://localhost/?${base}&${example}`,
      config.DATA_SOURCES,
    )

    expect(target?.tracks.length).toBeGreaterThan(0)
  })

  // Every flag a `vis=` example names, not merely one of them: a doc that
  // renames a flag still parses, because the entries it got right carry it.
  it.each(examples.filter(example => /(^|&)vis=/.test(example)))(
    '%s names only real View menu flags',
    example => {
      const named = /(?:^|&)vis=([^&]*)/
        .exec(example)![1]!
        .split(',')
        .map(entry => entry.replace(/^-/, ''))
      const unknown = named.filter(
        flag => !VIS_OPTION_FLAGS.some(known => known === flag),
      )

      expect(unknown).toEqual([])
    },
  )

  it('documents every View menu flag', () => {
    const doc = readFileSync('doc/urlparams.md', 'utf8')
    const undocumented = VIS_OPTION_FLAGS.filter(flag => !doc.includes(flag))

    expect(undocumented).toEqual([])
  })
})
