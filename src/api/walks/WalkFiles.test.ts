import { readFileSync } from 'node:fs'
import '../../config-client.js'
import { isLocalGraphFilename } from '../../common.ts'
import { GBZBaseAPI } from '../GBZBaseAPI.ts'
import type { ViewTarget } from '../../Types.ts'

const WALKS = 'hprc-chrM.GRCh38.walks.bed.gz'
const SIBLINGS = ['hprc-chrM.GRCh38.walks.bed.gz.tbi']

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

describe('isLocalGraphFilename', () => {
  it('tells a graph from its companion haplotype index', () => {
    expect(isLocalGraphFilename('https://h/x.GRCh38.walks.bed.gz?sig=a')).toBe(
      true,
    )
    expect(isLocalGraphFilename('g.gbz.db')).toBe(true)
    expect(isLocalGraphFilename('g.haplotype-index.db')).toBe(false)
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

it('asks for the index of a walk file dropped without it', async () => {
  const api = new GBZBaseAPI()
  const id = await upload(api, WALKS, 'alone')
  await expect(
    api.getChunkedData(view(id, 'chrM:0-100'), null),
  ).rejects.toThrow(/hprc-chrM\.GRCh38\.walks\.bed\.gz needs its \.tbi/)
})

describe('a walk file that abridges two walks, IAI39 and Sakai', () => {
  const api = new GBZBaseAPI()
  const region = 'K12#1#chr:1004500-1004961'
  let abridged: string
  let full: string

  beforeAll(async () => {
    full = await upload(api, 'ecoli_pggb.K12.walks.bed.gz', 'full')
    await upload(api, 'ecoli_pggb.K12.walks.bed.gz.tbi', 'full')
    abridged = await upload(api, 'ecoli_pggb_abridged.K12.walks.bed.gz', 'ab')
    await upload(api, 'ecoli_pggb_abridged.K12.walks.bed.gz.tbi', 'ab')
  })

  const cut = (file: string, extra = {}) =>
    api.getChunkedData(
      view(file, region, { allHaplotypes: true, ...extra }),
      null,
    )

  const pathOf = (response: Awaited<ReturnType<typeof cut>>, name: string) =>
    response.graph!.path.find(p => p.name === name)

  it('lists each abridged walk with its counts, apart from the paths', async () => {
    const response = await cut(abridged)
    expect(response.graph!.path.map(p => p.name)).toEqual([
      'K12#1#chr',
      'CFT073#1#chr',
      'NCTC86#1#chr',
    ])
    expect(response.abridged).toEqual([
      { name: 'IAI39#1#chr', steps: 35, bp: 460 },
      { name: 'Sakai#1#chr', steps: 35, bp: 460 },
    ])
  })

  it('merges no abridged walks into one distinct path', async () => {
    const { graph } = await api.getChunkedData(view(abridged, region), null)
    expect(total(graph!.path)).toBe(3)
  })

  it('reads a walk the view expands in full, as the unabridged file holds it', async () => {
    const expanded = await cut(abridged, { expand: ['IAI39#1#chr'] })
    const unabridged = await cut(full)
    expect(expanded.abridged).toEqual([
      { name: 'Sakai#1#chr', steps: 35, bp: 460 },
    ])
    expect(pathOf(expanded, 'IAI39#1#chr')!.mapping).toHaveLength(35)
    expect(pathOf(expanded, 'IAI39#1#chr')).toEqual(
      pathOf(unabridged, 'IAI39#1#chr'),
    )
  })

  it('abridges nothing in a file written without a budget', async () => {
    expect((await cut(full)).abridged).toEqual([])
  })
})
