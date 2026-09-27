// @vitest-environment node

import { describe, expect, it } from 'vitest'
import '../config-client.js'
import type { Track, ViewTarget } from '../Types.ts'
import { BANDAGEJS_URL, bandageJsUrl } from './bandageJs.ts'

const HPRC =
  'https://s3-us-west-2.amazonaws.com/human-pangenomics/hprc-v2.1-mc-grch38.gbz.db'
const HPRC_INDEX = 'https://jbrowse.org/demos/hprc/hprc.haplotype-index.db'
const PAGE = 'https://cmdcolin.github.io/sequenceTubeMap/'

function view(region: string, graph: Partial<Track> = {}): ViewTarget {
  return {
    region,
    tracks: [{ trackType: 'graph', trackFile: HPRC, ...graph }],
  }
}

function params(url: string | undefined) {
  expect(url?.startsWith(`${BANDAGEJS_URL}?`)).toBe(true)
  return Object.fromEntries(new URL(url!).searchParams)
}

describe('bandageJsUrl', () => {
  it('opens a hosted database on the same window, reference sample split off', () => {
    const url = bandageJsUrl(
      view('GRCh38#chr6:160620000-160620500', {
        haplotypeIndexFile: HPRC_INDEX,
      }),
      undefined,
    )

    expect(params(url)).toEqual({
      gbz: HPRC,
      index: HPRC_INDEX,
      loc: 'chr6:160620000-160620500',
      ref: 'GRCh38',
    })
  })

  it('names the generic reference for a bare contig', () => {
    expect(params(bandageJsUrl(view('17:1-100'), undefined))).toMatchObject({
      loc: '17:1-100',
      ref: '_gbwt_ref',
    })
  })

  it('takes the sample from a full PanSN region and a distance region', () => {
    expect(
      params(bandageJsUrl(view('HG002#1#chr1:1000+500'), undefined)),
    ).toMatchObject({ loc: 'chr1:1000-1500', ref: 'HG002' })
  })

  it('resolves a relative track file against the page when the browser serves it', () => {
    const url = bandageJsUrl(
      view('GRCh38#chrM:1-200', {
        trackFile: 'exampleData/hprc-chrM.gbz.db',
        haplotypeIndexFile: 'exampleData/hprc-chrM.haplotype-index.db',
      }),
      PAGE,
    )

    expect(params(url)).toMatchObject({
      gbz: `${PAGE}exampleData/hprc-chrM.gbz.db`,
      index: `${PAGE}exampleData/hprc-chrM.haplotype-index.db`,
    })
  })

  it('has no link for a file BandageJS cannot fetch or read', () => {
    const region = 'GRCh38#chr6:1-100'

    expect(
      bandageJsUrl(
        view(region, { trackFile: 'exampleData/x.gbz.db' }),
        undefined,
      ),
    ).toBeUndefined()
    expect(bandageJsUrl(view(region, { trackFile: '3' }), PAGE)).toBeUndefined()
    expect(
      bandageJsUrl(
        view(region, { trackFile: 'https://example.org/x.xg' }),
        PAGE,
      ),
    ).toBeUndefined()
    expect(bandageJsUrl(view('node:42-55x'), PAGE)).toBeUndefined()
  })

  it('drops an uploaded index but keeps the hosted graph', () => {
    expect(
      params(
        bandageJsUrl(
          view('GRCh38#chr6:1-100', { haplotypeIndexFile: '4' }),
          PAGE,
        ),
      ),
    ).not.toHaveProperty('index')
  })

  describe('haplotypes', () => {
    const region = view('GRCh38#chr6:1-100')

    it('narrows to the visible haplotypes once some are hidden', () => {
      const url = bandageJsUrl(region, undefined, [
        { name: 'GRCh38#0#chr6', hidden: false },
        { name: 'HG00097#1#JAHBCB010000040.1', hidden: false },
        { name: 'HG00097#1#JAHBCB010000041.1', hidden: false },
        { name: 'HG00133#2#JAHBCC010000012.1', hidden: true },
      ])

      expect(params(url).haps).toBe('GRCh38#0,HG00097#1')
    })

    it('sends every haplotype when none, or all, are hidden', () => {
      const tracks = [
        { name: 'GRCh38#0#chr6', hidden: false },
        { name: 'HG00097#1#chr6', hidden: false },
      ]

      expect(
        params(bandageJsUrl(region, undefined, tracks)),
      ).not.toHaveProperty('haps')
      expect(
        params(
          bandageJsUrl(
            region,
            undefined,
            tracks.map(track => ({ ...track, hidden: true })),
          ),
        ),
      ).not.toHaveProperty('haps')
    })

    it('sends every haplotype when a visible one is anonymous', () => {
      const url = bandageJsUrl(region, undefined, [
        { name: 'HG00097#1#chr6', hidden: false },
        { name: 'unknown#57', hidden: false },
        { name: 'unknown#58', hidden: true },
      ])

      expect(params(url)).not.toHaveProperty('haps')
    })
  })
})
