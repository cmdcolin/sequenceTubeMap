import { LocalAPI } from './LocalAPI.ts'
import type { ViewTarget } from '../Types.ts'
import { readFileSync } from 'node:fs'
import type { EventEmitter } from 'node:events'

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
    expect((view.graph as { node?: unknown }).node).toBeTruthy()
  })
})

// The worker has no way to learn about a filename change on its own, so the
// only real source of one is an upload made through this object. The old
// plumbing subscribed inside the worker and never fired.
describe('filename change notifications', () => {
  function gbzFile() {
    return new window.File([readFileSync('exampleData/x.gbz.db')], 'x.gbz.db', {
      type: 'application/octet-stream',
    })
  }

  it('fires when a file is uploaded', async () => {
    const api = new LocalAPI()
    const handler = vi.fn()
    api.subscribeToFilenameChanges(handler, new AbortController().signal)
    await api.putFile('graph', gbzFile(), null)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stops firing after the signal is aborted', async () => {
    const api = new LocalAPI()
    const handler = vi.fn()
    const controller = new AbortController()
    api.subscribeToFilenameChanges(handler, controller.signal)
    controller.abort()
    await api.putFile('graph', gbzFile(), null)
    expect(handler).not.toHaveBeenCalled()
  })
})

// The worker mock is an EventEmitter standing in for the Worker.
function workerOf(api: LocalAPI) {
  return (api as unknown as { worker: EventEmitter }).worker
}

describe('a worker that fails to start', () => {
  it('rejects the calls waiting on it and every call after', async () => {
    const api = new LocalAPI()
    const waiting = api.getFilenames(null)
    workerOf(api).emit(
      'error',
      new ErrorEvent('error', {
        message: 'Cannot use import statement outside a module',
      }),
    )

    await expect(waiting).rejects.toThrow(
      /worker failed to start: Cannot use import statement/,
    )
    await expect(api.getFilenames(null)).rejects.toThrow(
      /worker failed to start/,
    )
  })

  it('keeps answering after an error once it has started', async () => {
    const api = new LocalAPI()
    await api.getFilenames(null)
    workerOf(api).emit('error', new ErrorEvent('error', { message: 'later' }))

    await expect(api.getFilenames(null)).resolves.toBeTruthy()
  })
})

describe('cancellation', () => {
  it('rejects a request whose signal was already aborted', async () => {
    const api = new LocalAPI()
    const uploadName = await api.putFile(
      'graph',
      new window.File([readFileSync('exampleData/x.gbz.db')], 'x.gbz.db', {
        type: 'application/octet-stream',
      }),
      null,
    )
    const controller = new AbortController()
    controller.abort()
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [{ trackFile: uploadName, trackType: 'graph' }],
      region: 'x:1-10',
    }
    await expect(
      api.getChunkedData(viewTarget, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
