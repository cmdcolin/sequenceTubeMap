import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { GBZBase } from '@gmod/gbz-base'
import { GBZBaseAPI } from './GBZBaseAPI.ts'
import { LocalAPI } from './LocalAPI.ts'
import type { ViewTarget } from '../Types.ts'

// Scrolling a URL-hosted graph abandons one view after another. Each test
// here holds a response open so it can abort a view at a known point.
const HOSTED = new Map([
  ['/cactus.gbz.db', readFileSync('exampleData/cactus.gbz.db')],
  ['/reads.gam', readFileSync('exampleData/cactus-NA12879.sorted.gam')],
  ['/reads.gam.gai', readFileSync('exampleData/cactus-NA12879.sorted.gam.gai')],
])

let server: Server
let origin: string
let requests: string[]
const holds = new Map<
  string,
  { arrived: () => void; released: Promise<void> }
>()

// Hold the next response for `path` until `release` is called; `requested`
// settles once its request has arrived.
function hold(path: string) {
  let arrived!: () => void
  let release!: () => void
  const requested = new Promise<void>(resolve => {
    arrived = resolve
  })
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  holds.set(path, { arrived, released })
  return { requested, release }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const path = req.url ?? ''
      requests.push(path)
      const held = holds.get(path)
      if (held) {
        holds.delete(path)
        held.arrived()
        await held.released
      }
      const body = HOSTED.get(path)
      if (body === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
      if (range) {
        const start = Number(range[1])
        const end = Math.min(Number(range[2]), body.length - 1)
        res.writeHead(206, {
          'content-length': String(end + 1 - start),
          'content-range': `bytes ${start}-${end}/${body.length}`,
        })
        res.end(body.subarray(start, end + 1))
      } else {
        res.writeHead(200, { 'content-length': String(body.length) })
        res.end(body)
      }
    })()
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind a port')
  }
  origin = `http://127.0.0.1:${address.port}`
})

beforeEach(() => {
  requests = []
  holds.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await new Promise<void>(resolve => {
    server.close(() => {
      resolve()
    })
  })
})

function readsView(): ViewTarget {
  return {
    dataType: 'mounted files',
    tracks: [
      { trackFile: `${origin}/cactus.gbz.db`, trackType: 'graph' },
      { trackFile: `${origin}/reads.gam`, trackType: 'read' },
    ],
    region: 'ref:1-100',
  }
}

const abortError = { name: 'AbortError' }

it('rejects an abandoned view with an AbortError and reads nothing more', async () => {
  const api = new LocalAPI()
  const index = hold('/reads.gam.gai')
  const controller = new AbortController()
  const view = api.getChunkedData(readsView(), controller.signal)
  await index.requested
  controller.abort()

  await expect(view).rejects.toMatchObject(abortError)
  index.release()
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(requests).not.toContain('/reads.gam')
})

it('reports a graph query aborted partway as an AbortError', async () => {
  const api = new GBZBaseAPI()
  const controller = new AbortController()
  const query = GBZBase.prototype.getSubgraphForRange
  vi.spyOn(GBZBase.prototype, 'getSubgraphForRange').mockImplementation(
    function (this: GBZBase, ...args) {
      controller.abort()
      return query.apply(this, args)
    },
  )

  await expect(
    api.getChunkedData(readsView(), controller.signal),
  ).rejects.toMatchObject(abortError)
})

it('finishes a download another view still waits for', async () => {
  const api = new GBZBaseAPI()
  const index = hold('/reads.gam.gai')
  const left = new AbortController()
  const abandoned = api.getChunkedData(readsView(), left.signal)
  const kept = api.getChunkedData(readsView(), new AbortController().signal)
  await index.requested
  left.abort()

  await expect(abandoned).rejects.toMatchObject(abortError)
  index.release()
  expect((await kept).gam?.[0]?.length).toBeGreaterThan(0)
  expect(requests.filter(path => path === '/reads.gam.gai')).toHaveLength(1)
})
