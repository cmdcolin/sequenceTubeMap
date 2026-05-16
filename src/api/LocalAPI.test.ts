import { LocalAPI } from './LocalAPI'
import type { ViewTarget } from '../Types'
import { readFileSync } from 'node:fs'

it('can be constructed', () => {
  new LocalAPI()
})

it('can have a file uploaded', async () => {
  const api = new LocalAPI()

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
  const api = new LocalAPI()

  beforeAll(async () => {
    const fileData = readFileSync('exampleData/x.gbz.db')
    const file = new window.File([fileData], 'x.gbz.db', {
      type: 'application/octet-stream',
    })

    const controller = new AbortController()
    uploadName = await api.putFile('graph', file, controller.signal)
  })

  it('should show up in the list of files', async () => {
    const fileNames = await api.getFilenames(null)
    // Runtime shape from GBZBaseAPI.getFilenames is { name, type }, which
    // doesn't match the typed AvailableTrack interface.
    const files = (fileNames.files ?? []) as unknown as {
      name: string
      type: string
    }[]
    let found = false
    for (const file of files) {
      if (file.name === uploadName) {
        expect(file.type).toEqual('graph')
        found = true
      }
    }
    expect(found).toBeTruthy()
  })

  it('can be asked for a view', async () => {
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: { 1: { trackFile: uploadName!, trackType: 'graph' } },
      region: 'x:1-10',
    }
    const controller = new AbortController()
    const view = await api.getChunkedData(viewTarget, controller.signal)

    expect(view.graph).toBeTruthy()
    expect((view.graph as { node?: unknown }).node).toBeTruthy()
  })
})
