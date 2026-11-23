// @vitest-environment node

import { GBZBaseAPI } from '../api/GBZBaseAPI.ts'
import {
  foldTubeMapData,
  parseChunkedData,
  type TubeMapData,
} from './tubeMapData.ts'
import {
  COARSENED_GRAPH_RENDER_LIMIT,
  GRAPH_RENDER_LIMIT,
  graphNodeVisits,
} from './TubeMapContainer.tsx'
import '../config-client.js'
import { config } from '../config-global.mjs'

// GRAPH_RENDER_LIMIT is a number picked from measurements, and a number like
// that rots quietly: the reader gets faster, the graph gets rebuilt, and the
// cap ends up either refusing the app's own flagship figure or waving through
// the window that hangs the tab. So the calibration is checked against the
// real graph, through the same pipeline the renderer is fed by. The
// measurements are in docs/data.md.
//
// Network-gated, like the other HPRC v2.1 tests: `RUN_NETWORK_TESTS=1`.
const RUN_NETWORK = process.env.RUN_NETWORK_TESTS === '1'
const hprc = config.DATA_SOURCES.find(ds => ds.name?.startsWith('HPRC v2.1'))!

async function nodeVisitsFor(region: string) {
  const target = { ...hprc, region }
  const json = await new GBZBaseAPI().getChunkedData(target, null)
  return graphNodeVisits(parseChunkedData(json, target.tracks).tracks)
}

describe.skipIf(!RUN_NETWORK)('the graph render cap, against HPRC v2.1', () => {
  it('draws the chr20 microsatellite the README figures come from', async () => {
    const visits = await nodeVisitsFor('GRCh38#chr20:48000600-48001000')

    expect(visits).toBeGreaterThan(10000)
    expect(visits).toBeLessThan(GRAPH_RENDER_LIMIT)
  }, 180000)

  it('refuses a 10 kb window, which is a 9 MB SVG', async () => {
    expect(
      await nodeVisitsFor('GRCh38#chr6:31500000-31510000'),
    ).toBeGreaterThan(GRAPH_RENDER_LIMIT)
  }, 180000)

  it('draws a 50 kb window coarsened, but not a 150 kb one', async () => {
    expect(await nodeVisitsFor('GRCh38#chr6:31500000-31550000')).toBeLessThan(
      COARSENED_GRAPH_RENDER_LIMIT,
    )
    expect(
      await nodeVisitsFor('GRCh38#chr6:31500000-31650000'),
    ).toBeGreaterThan(COARSENED_GRAPH_RENDER_LIMIT)
  }, 600000)
})

// A reference of three nodes, the middle one 3 kb; one walk with a SNP beside
// it, and one that skips the middle
function foldable(): TubeMapData {
  return {
    nodes: [
      { name: 'a', sequenceLength: 500 },
      { name: 'snp', sequenceLength: 1 },
      { name: 'alt', sequenceLength: 1 },
      { name: 'b', sequenceLength: 3000 },
      { name: 'c', sequenceLength: 500 },
    ],
    tracks: [
      {
        id: 0,
        name: 'ref',
        sequence: ['a', 'snp', 'b', 'c'],
        freq: 1,
        sourceTrackID: 3,
        indexOfFirstBase: 1000,
      },
      {
        id: 1,
        name: 'hap1',
        sequence: ['a', 'alt', 'b', 'c'],
        freq: 2,
        sourceTrackID: 3,
      },
      {
        id: 2,
        name: 'hap2',
        sequence: ['a', 'snp', 'c'],
        freq: 5,
        sourceTrackID: 3,
      },
    ],
    reads: [
      {
        id: 10,
        name: 'read',
        type: 'read',
        sequence: ['snp'],
        sourceTrackID: 4,
      },
    ],
    region: undefined,
    coloredNodes: undefined,
    abridged: [],
  }
}

describe('foldTubeMapData', () => {
  it('leaves the data alone when the fold is off', () => {
    const data = foldable()

    expect(foldTubeMapData(data, 0)).toBe(data)
  })

  it('merges the SNP into the reference and keeps the deletion, with its carriers', () => {
    const folded = foldTubeMapData(foldable(), 1000)

    expect(folded.foldRefused).toBeUndefined()
    expect(folded.nodes.map(node => node.sequenceLength)).toEqual([
      501, 3000, 500,
    ])
    expect(folded.tracks.map(track => track.freq)).toEqual([1, 2, 5])
    expect(folded.tracks.map(track => track.sequence.length)).toEqual([3, 3, 2])
    expect(folded.fold?.haplotypes).toBe(8)
    expect(folded.fold?.unfoldedNodes).toBe(5)
    expect(folded.fold?.branches).toMatchObject([
      { kind: 'deletion', length: 3000, haplotypes: 5 },
    ])
    expect(folded.fold?.tubes.get(1)).toEqual({
      haplotypes: 2,
      walks: 1,
      minHiddenBp: 2,
      maxHiddenBp: 2,
    })
  })

  it("keeps each track on its file's colors and the reference on its coordinates", () => {
    const { tracks } = foldTubeMapData(foldable(), 1000)

    expect(tracks.map(track => track.sourceTrackID)).toEqual([3, 3, 3])
    expect(tracks[0]?.indexOfFirstBase).toBe(1000)
  })

  it('carries no reads, and says how many it left out', () => {
    const folded = foldTubeMapData(foldable(), 1000)

    expect(folded.reads).toEqual([])
    expect(folded.hiddenReads).toBe(1)
  })

  it('returns a window whose reference passes a node twice as it came, with the reason', () => {
    const data = foldable()
    data.tracks[0]!.sequence = ['a', 'snp', 'b', 'a', 'c']
    const refused = foldTubeMapData(data, 1000)

    expect(refused.foldRefused).toMatch(
      /reference passes 1 nodes of this window/,
    )
    expect(refused.fold).toBeUndefined()
    expect(refused.nodes).toBe(data.nodes)
    expect(refused.tracks).toBe(data.tracks)
    expect(refused.reads).toBe(data.reads)
  })

  it('refuses a graph whose reference revisits nodes outside the window', () => {
    const refused = foldTubeMapData(
      { ...foldable(), referenceRevisits: 12 },
      1000,
    )

    expect(refused.foldRefused).toMatch(
      /reference passes 12 nodes of the graph/,
    )
    expect(refused.reads).toHaveLength(1)
  })

  it('gives the reason rather than throwing on a walk through a node it was not given', () => {
    const data = foldable()
    data.tracks[1]!.sequence = ['a', 'missing', 'c']

    expect(foldTubeMapData(data, 1000).foldRefused).toMatch(/missing/)
  })
})
