import { GBZBaseAPI } from './GBZBaseAPI.ts'
import type { ViewTarget } from '../Types.ts'
import { readFileSync } from 'node:fs'

it('can be constructed', () => {
  new GBZBaseAPI()
})

it('can self-test its WASM setup', async () => {
  const api = new GBZBaseAPI()
  const working = await api.available()
  expect(working).toBeTruthy()
})

it('can have a file uploaded', async () => {
  const api = new GBZBaseAPI()

  // We need to make sure we make a jsdom File (which is a jsdom Blob), and not
  // a Node Blob, for our test file. Otherwise it doesn't work with jsdom's
  // upload machinery.
  // See for example <https://github.com/vitest-dev/vitest/issues/2078> for
  // background on the many flavors of Blob.
  const fileData = readFileSync('exampleData/x.gbz.db')
  // Since a Node Buffer is an ArrayBuffer, we can use it to make a jsdom File.
  // We need to put the data block in an enclosing array, or else the block
  // will be iterated and each byte will be stringified and *those* bytes will
  // be uploaded.
  const file = new window.File([fileData], 'x.gbz.db', {
    type: 'application/octet-stream',
  })

  const controller = new AbortController()
  const uploadName = await api.putFile('graph', file, controller.signal)

  expect(uploadName).toBeTruthy()
})

describe('when a file is uploaded', () => {
  let uploadName: string | null = null
  const api = new GBZBaseAPI()

  beforeAll(async () => {
    const fileData = readFileSync('exampleData/x.gbz.db')
    const file = new window.File([fileData], 'x.gbz.db', {
      type: 'application/octet-stream',
    })

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
})

// Sibling-index pairing: uploading both a .sorted.gam and its .sorted.gam.gai
// should let the LocalAPI find the index when reading the GAM, so region
// queries work for dropped folders like exampleData/Toxo.
describe('uploaded read + index siblings', () => {
  const api = new GBZBaseAPI()
  let gamId: string | null = null
  let gaiId: string | null = null

  beforeAll(async () => {
    const gamData = readFileSync('exampleData/cactus0_10.sorted.gam')
    const gaiData = readFileSync('exampleData/cactus0_10.sorted.gam.gai')
    const gamFile = new window.File([gamData], 'cactus0_10.sorted.gam', {
      type: 'application/octet-stream',
    })
    const gaiFile = new window.File([gaiData], 'cactus0_10.sorted.gam.gai', {
      type: 'application/octet-stream',
    })
    const c = new AbortController()
    gamId = await api.putFile('read', gamFile, c.signal)
    gaiId = await api.putFile('read', gaiFile, c.signal)
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
})

// Network-gated smoke test against the S3-hosted HPRC chr20 file referenced
// by the "HPRC chr20 (URL-hosted, full PanSN)" entry in config.json. Proves:
//   1. URL-backed track files load correctly via `resolveTrackFile`'s fetch.
//   2. The patched gbz-base WASM (vendor/gbz-base-patch/) resolves real PanSN
//      sample names from the GBWT metadata instead of emitting "unknown#N".
//
// Opt-in via `RUN_NETWORK_TESTS=1` because the file is ~128 MB — too much for
// every developer-machine `pnpm test` and a real risk of flakes on slow CI.
const RUN_NETWORK = process.env.RUN_NETWORK_TESTS === '1'
describe.skipIf(!RUN_NETWORK)('URL-hosted HPRC chr20', () => {
  it('returns real PanSN sample names (no `unknown#N` fallback)', async () => {
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

    // Reference path always present.
    expect(names.some(n => n.startsWith('GRCh38'))).toBe(true)
    // At least one real HG-prefixed haplotype sample shows up — the patch's
    // whole point. Without it these would be `unknown#N#contig` instead.
    expect(names.some(n => /^HG\d{5}/.test(n))).toBe(true)
    // Nothing should fall back to the anonymous label.
    expect(names.every(n => !n.startsWith('unknown#'))).toBe(true)
  }, 180000) // 3 min: 128 MB fetch + WASM query
})
