import { GBZBaseAPI } from './GBZBaseAPI.ts'
import type { ConvertedGraph } from './gbz/schema.ts'
import type { ViewTarget } from '../Types.ts'
import { readFileSync } from 'node:fs'

// We need to make sure we make a jsdom File (which is a jsdom Blob), and not
// a Node Blob, for our test files. Otherwise it doesn't work with jsdom's
// upload machinery.
// See for example <https://github.com/vitest-dev/vitest/issues/2078> for
// background on the many flavors of Blob.
function fixtureFile(path: string, name: string): File {
  // Since a Node Buffer is an ArrayBuffer, we can use it to make a jsdom File.
  // We need to put the data block in an enclosing array, or else the block
  // will be iterated and each byte will be stringified and *those* bytes will
  // be uploaded.
  return new window.File([readFileSync(path)], name, {
    type: 'application/octet-stream',
  })
}

it('can be constructed', () => {
  new GBZBaseAPI()
})

it('can have a file uploaded', async () => {
  const api = new GBZBaseAPI()
  const controller = new AbortController()
  const uploadName = await api.putFile(
    'graph',
    fixtureFile('exampleData/x.gbz.db', 'x.gbz.db'),
    controller.signal,
  )

  expect(uploadName).toBeTruthy()
})

describe('when a file is uploaded', () => {
  let uploadName: string | null = null
  const api = new GBZBaseAPI()

  beforeAll(async () => {
    const fileData = readFileSync('exampleData/x.gbz.db')
    const file = fixtureFile('exampleData/x.gbz.db', 'x.gbz.db')

    const fileDataRetrieved = await file.arrayBuffer()
    if (fileDataRetrieved.byteLength != fileData.length) {
      throw new Error("Can't put data into and out of jsdom File")
    }

    const controller = new AbortController()
    uploadName = await api.putFile('graph', file, controller.signal)
  })

  it('should show up in the list of files', async () => {
    const fileNames = await api.getFilenames(null)
    const files = fileNames.files ?? []
    let found = false
    for (const file of files) {
      if (file.trackFile === uploadName) {
        expect(file.trackType).toEqual('graph')
        found = true
      }
    }
    expect(found).toBeTruthy()
  })

  it('can be asked for a view', async () => {
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{ trackFile: uploadName!, trackType: 'graph' }],
      region: 'x:1-10',
    }
    const controller = new AbortController()
    const view = await api.getChunkedData(viewTarget, controller.signal)

    expect(view.graph).toBeTruthy()
    expect(view.graph?.node).toBeTruthy()
    // region must match the server's [start, end] number-array shape, not a
    // string; tubemap.ts indexes [0]/[1] as numbers to draw region ticks.
    expect(view.region).toEqual([1, 10])
  })

  it('honors removeSequences by replacing node.sequence with sequenceLength', async () => {
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{ trackFile: uploadName!, trackType: 'graph' }],
      region: 'x:1-10',
      removeSequences: true,
    }
    const controller = new AbortController()
    const view = await api.getChunkedData(viewTarget, controller.signal)

    const nodes = view.graph?.node ?? []
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.sequence).toBeUndefined()
      expect(typeof node.sequenceLength).toBe('number')
    }
  })

  it('lists the generic reference path with its exact length', async () => {
    const { pathInfo } = await api.getPathInfo(uploadName!, null)
    expect(pathInfo).toEqual([
      { name: 'x', start: 0, length: 1001, cyclic: false },
    ])
  })

  it('reports a readable error for a region off the end of the path', async () => {
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{ trackFile: uploadName!, trackType: 'graph' }],
      region: 'x:5000-5100',
    }
    await expect(api.getChunkedData(viewTarget, null)).rejects.toThrow(
      /Failed to query .* at x:5000-5100/,
    )
  })

  it('rejects a file that is not a gbz-base database', async () => {
    const id = await api.putFile(
      'graph',
      fixtureFile('exampleData/x.gbz', 'x.gbz'),
      null,
    )
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{ trackFile: id, trackType: 'graph' }],
      region: 'x:1-10',
    }
    await expect(api.getChunkedData(viewTarget, null)).rejects.toThrow(
      /Not a SQLite database/,
    )
  })
})

// micb-kir3dl1.gbz.db is a 46-sample HPRC slice carrying the HaplotypeSamples
// and HaplotypeLengths side tables written by gbz-haplotype-index, so every
// haplotype through the window resolves to its PanSN name instead of the
// `unknown#N` label upstream gbz-base emits.
describe('a database with haplotype side tables', () => {
  const api = new GBZBaseAPI()
  let id: string

  beforeAll(async () => {
    id = await api.putFile(
      'graph',
      fixtureFile('exampleData/micb-kir3dl1.gbz.db', 'micb-kir3dl1.gbz.db'),
      null,
    )
  })

  it('returns nodes, edges and resolved haplotype paths through convertSchema', async () => {
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{ trackFile: id, trackType: 'graph' }],
      region: 'GRCh38#chr6:31500000-31501000',
    }
    const view = await api.getChunkedData(viewTarget, null)
    // getChunkedData hands back convertSchema's output, which carries the
    // `edge` list tubemap rendering consumes on top of the VgJson shape.
    const graph = view.graph as ConvertedGraph
    expect(graph.node.length).toBeGreaterThan(0)
    expect(graph.edge.length).toBeGreaterThan(0)
    for (const edge of graph.edge) {
      expect(typeof edge.from_start).toBe('boolean')
      expect(typeof edge.to_end).toBe('boolean')
    }

    const paths = graph.path
    expect(paths.length).toBeGreaterThan(1)
    const names = paths.map(p => p.name!)
    expect(names[0]).toBe('GRCh38#0#chr6')
    expect(paths[0]!.indexOfFirstBase).toBe('31499826')
    expect(names.some(n => /^(HG|NA)\d+#\d#/.test(n))).toBe(true)
    expect(names.every(n => !n.startsWith('unknown#'))).toBe(true)
    // --distinct collapses identical walks and reports how many haplotypes
    // share each one; convertSchema copies that into `freq` for track width.
    expect(paths.every(p => typeof p.freq === 'number' && p.freq >= 1)).toBe(true)
    for (const path of paths) {
      expect(path.mapping.length).toBeGreaterThan(0)
    }
  })

  it('lists the indexed reference paths with fragment offsets and side-table lengths', async () => {
    const { pathInfo } = await api.getPathInfo(id, null)
    expect(pathInfo).toContainEqual({
      name: 'GRCh38#chr6',
      start: 31498140,
      length: 13033,
      cyclic: false,
    })
    expect(pathInfo.map(p => p.name)).toEqual([
      'CHM13#chr6',
      'GRCh38#chr6',
      'CHM13#chr19',
      'GRCh38#chr19',
    ])
  })
})

// Sibling-index pairing: uploading both a .sorted.gam and its .sorted.gam.gai
// should let the LocalAPI find the index when reading the GAM, so region
// queries work for dropped folders like exampleData/Toxo.
describe('uploaded read + index siblings', () => {
  const api = new GBZBaseAPI()
  let gamId: string | null = null
  let gaiId: string | null = null

  beforeAll(async () => {
    const c = new AbortController()
    gamId = await api.putFile(
      'read',
      fixtureFile('exampleData/cactus0_10.sorted.gam', 'cactus0_10.sorted.gam'),
      c.signal,
    )
    gaiId = await api.putFile(
      'read',
      fixtureFile(
        'exampleData/cactus0_10.sorted.gam.gai',
        'cactus0_10.sorted.gam.gai',
      ),
      c.signal,
    )
  })

  it('returns distinct upload ids for the gam and its index', () => {
    expect(gamId).toBeTruthy()
    expect(gaiId).toBeTruthy()
    expect(gamId).not.toEqual(gaiId)
  })

  it('lists only the gam as a read track, hiding the .gai sibling', async () => {
    const filenames = await api.getFilenames(null)
    const readFiles = (filenames.files ?? []).filter(
      f => f.trackType === 'read',
    )
    const trackFileIds = readFiles.map(f => f.trackFile)
    expect(trackFileIds).toContain(gamId!)
    expect(trackFileIds).not.toContain(gaiId!)
  })

  it('counts reads per path against the graph they were aligned to', async () => {
    const graphId = await api.putFile(
      'graph',
      fixtureFile('exampleData/cactus.gbz.db', 'cactus.gbz.db'),
      null,
    )
    const result = await api.getReadCountsPerPath(graphId, gamId!, null)
    expect(result).not.toBeNull()
    expect(result!.counts.ref).toBeGreaterThan(0)
  })
})

// Network-gated smoke test against the S3-hosted HPRC chr20 file referenced
// by the "HPRC chr20 (URL-hosted, full PanSN)" entry in config.json. Proves
// that URL-backed track files are read by HTTP range requests through
// RemoteFile rather than downloaded whole.
//
// Opt-in via `RUN_NETWORK_TESTS=1` so the default `pnpm test` stays offline.
const RUN_NETWORK = process.env.RUN_NETWORK_TESTS === '1'
describe.skipIf(!RUN_NETWORK)('URL-hosted HPRC chr20', () => {
  it('answers a query without downloading the whole file', async () => {
    const api = new GBZBaseAPI()
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{
        trackFile: 'https://jbrowse.org/demos/ivg/hprc/hprc-chr20.gbz.db',
        trackType: 'graph',
      }],
      region: 'GRCh38#chr20:30000000-30000500',
    }
    const view = await api.getChunkedData(viewTarget, new AbortController().signal)
    const paths = view.graph?.path ?? []
    const names = paths.map(p => p.name).filter((n): n is string => n !== undefined)
    expect(names.some(n => n.startsWith('GRCh38'))).toBe(true)
    expect(paths.length).toBeGreaterThan(1)
  }, 60000)
})
