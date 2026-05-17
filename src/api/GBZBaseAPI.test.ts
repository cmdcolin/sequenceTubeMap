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
