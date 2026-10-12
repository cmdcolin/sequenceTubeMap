import { readFileSync } from 'node:fs'
import '../../config-client.js'
import { isLocalGraphFilename, walkCompanions } from '../../common.ts'
import { GBZBaseAPI } from '../GBZBaseAPI.ts'
import { decodeSteps } from './walkCut.ts'
import type { ViewTarget } from '../../Types.ts'

const WALKS = 'hprc-chrM.GRCh38.walks.bed.gz'
const SIBLINGS = [
  'hprc-chrM.GRCh38.walks.bed.gz.tbi',
  'hprc-chrM.GRCh38.nodes.bed.gz',
  'hprc-chrM.GRCh38.nodes.bed.gz.tbi',
]

function upload(api: GBZBaseAPI, name: string, batch?: string) {
  return api.putFile(
    'graph',
    new window.File([readFileSync(`exampleData/${name}`)], name),
    null,
    batch,
  )
}

async function walkGraph(api: GBZBaseAPI) {
  const id = await upload(api, WALKS)
  for (const name of SIBLINGS) {
    await upload(api, name)
  }
  return id
}

function view(trackFile: string, region: string, extra = {}): ViewTarget {
  return {
    tracks: [{ trackFile, trackType: 'graph' }],
    region,
    ...extra,
  }
}

const total = (paths: { freq?: number }[]) =>
  paths.reduce((sum, p) => sum + (p.freq ?? 1), 0)

describe('walkCompanions', () => {
  it('names the files beside a walk file, keeping a URL query at the end', () => {
    expect(walkCompanions('https://h/x.GRCh38.walks.bed.gz?sig=a')).toEqual({
      walksIndex: 'https://h/x.GRCh38.walks.bed.gz.tbi?sig=a',
      nodes: 'https://h/x.GRCh38.nodes.bed.gz?sig=a',
      nodesIndex: 'https://h/x.GRCh38.nodes.bed.gz.tbi?sig=a',
    })
  })

  it('tells a graph from its companion haplotype index', () => {
    expect(isLocalGraphFilename('https://h/x.GRCh38.walks.bed.gz?sig=a')).toBe(
      true,
    )
    expect(isLocalGraphFilename('g.gbz.db')).toBe(true)
    expect(isLocalGraphFilename('g.haplotype-index.db')).toBe(false)
  })
})

describe('decodeSteps', () => {
  it('reads node-id deltas with the strand in the low bit', () => {
    const ids = new Int32Array(3)
    const rev = new Uint8Array(3)
    decodeSteps('20,3,-4', ids, rev, 0)
    expect([...ids]).toEqual([10, 11, 9])
    expect([...rev]).toEqual([0, 1, 0])
  })
})

describe('a gfa-to-tabix walk file set', () => {
  const api = new GBZBaseAPI()
  let id: string

  beforeAll(async () => {
    id = await walkGraph(api)
  })

  it('cuts every haplotype through a window, reference first', async () => {
    const { graph, region } = await api.getChunkedData(
      view(id, 'GRCh38#chrM:1000-1300'),
      null,
    )
    expect(region).toEqual([1000, 1300])
    const [reference, ...others] = graph!.path
    expect(reference!.name).toBe('GRCh38#0#chrM')
    expect(Number(reference!.indexOfFirstBase)).toBeLessThanOrEqual(900)
    expect(others.map(p => p.name)).toContain('HG00438#2#MT')
    expect(total(graph!.path)).toBe(44)
    expect(
      graph!.node.every(n => n.sequence?.length === n.sequenceLength),
    ).toBe(true)
  })

  it('lists each haplotype on its own when asked for all of them', async () => {
    const { graph } = await api.getChunkedData(
      view(id, 'GRCh38#chrM:1000-1300', { allHaplotypes: true }),
      null,
    )
    expect(graph!.path).toHaveLength(44)
    expect(new Set(graph!.path.map(p => p.name)).size).toBe(44)
  })

  it('names the same haplotypes as the .gbz.db with its companion index', async () => {
    const gbz = new GBZBaseAPI()
    const db = await upload(gbz, 'hprc-chrM.gbz.db')
    const index = await upload(gbz, 'hprc-chrM.haplotype-index.db')
    const region = 'GRCh38#chrM:1000-1300'
    const fromDb = await gbz.getChunkedData(
      {
        tracks: [
          { trackFile: db, trackType: 'graph', haplotypeIndexFile: index },
        ],
        region,
        allHaplotypes: true,
      },
      null,
    )
    const fromWalks = await api.getChunkedData(
      view(id, region, { allHaplotypes: true }),
      null,
    )
    const names = (g: typeof fromDb) => g.graph!.path.map(p => p.name).sort()
    expect(names(fromWalks)).toEqual(names(fromDb))
    const walkNodes = new Set(fromWalks.graph!.node.map(n => String(n.id)))
    expect(fromDb.graph!.node.every(n => walkNodes.has(String(n.id)))).toBe(
      true,
    )
  })

  it('takes a region in any form the .gbz.db reader does', async () => {
    for (const region of [
      'chrM:0-100',
      'GRCh38#chrM:0-100',
      'GRCh38#0#chrM:0-100',
    ]) {
      const { graph } = await api.getChunkedData(view(id, region), null)
      expect(graph!.path[0]!.name).toBe('GRCh38#0#chrM')
    }
  })

  it('says which sequences it holds for one it does not', async () => {
    await expect(
      api.getChunkedData(view(id, 'chr1:0-100'), null),
    ).rejects.toThrow(/no reference sequence chr1; it holds GRCh38#0#chrM/)
  })

  it('refuses a node region', async () => {
    await expect(
      api.getChunkedData(view(id, 'node:5-10'), null),
    ).rejects.toThrow(/not a node region/)
  })

  it('lists the reference sequence with its length for the paths panel', async () => {
    const { pathInfo } = await api.getPathInfo(id, null)
    expect(pathInfo).toEqual([
      { name: 'GRCh38#0#chrM', length: 16569, cyclic: false },
    ])
  })

  it('draws reads aligned to the graph the walks came from', async () => {
    const reads = await upload(api, 'hprc-chrM-3samples.sorted.gam')
    await upload(api, 'hprc-chrM-3samples.sorted.gam.gai')
    const { gam } = await api.getChunkedData(
      {
        tracks: [
          { trackFile: id, trackType: 'graph' },
          { trackFile: reads, trackType: 'read' },
        ],
        region: 'GRCh38#chrM:100-300',
      },
      null,
    )
    expect(gam![0]!.length).toBeGreaterThan(0)
  })
})

it('names the file a walk file is missing', async () => {
  const api = new GBZBaseAPI()
  const id = await upload(api, WALKS, 'alone')
  await upload(api, `${WALKS}.tbi`, 'alone')
  await expect(
    api.getChunkedData(view(id, 'chrM:0-100'), null),
  ).rejects.toThrow(/needs hprc-chrM\.GRCh38\.nodes\.bed\.gz beside it/)
})
