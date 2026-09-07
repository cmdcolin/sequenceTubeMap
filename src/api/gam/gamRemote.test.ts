import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RemoteFile } from 'generic-filehandle2'
import { readGam, readGamRegion } from './gam.ts'
import { GBZBaseAPI } from '../GBZBaseAPI.ts'
import type { ViewTarget } from '../../Types.ts'

// The scenario the .gam.gai index exists for: reads behind a URL. Serving
// them from a range-aware server proves the reader asks for byte ranges,
// which was invisible while the file was fetched whole through a Blob and
// only the decode was narrowed.
//
// cactus-NA12879 is aligned to cactus.gbz.db; NA12878-BRCA1 stands alone for
// the low-level test.
const BRCA1 = 'exampleData/internal/NA12878-BRCA1.sorted.gam'
const HOSTED = new Map([
  ['/brca1.gam', readFileSync(BRCA1)],
  ['/cactus.gbz.db', readFileSync('exampleData/cactus.gbz.db')],
  ['/reads.gam', readFileSync('exampleData/cactus-NA12879.sorted.gam')],
  ['/reads.gam.gai', readFileSync('exampleData/cactus-NA12879.sorted.gam.gai')],
])

function hosted(path: string) {
  const body = HOSTED.get(path)
  if (body === undefined) {
    throw new Error(`no fixture for ${path}`)
  }
  return body
}

interface Served {
  bytes: number
  rangeRequests: number
  wholeRequests: number
}

describe('URL-hosted reads', () => {
  let server: Server
  let origin: string
  let served: Record<string, Served>

  const bytesFor = (path: string) => served[path]?.bytes ?? 0

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url ?? ''
      const body = HOSTED.get(path)
      if (body === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      const entry = (served[path] ??= {
        bytes: 0,
        rangeRequests: 0,
        wholeRequests: 0,
      })
      const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
      if (range) {
        const start = Number(range[1])
        const end = Math.min(Number(range[2]), body.length - 1)
        const slice = body.subarray(start, end + 1)
        entry.bytes += slice.length
        entry.rangeRequests++
        res.writeHead(206, {
          'content-length': String(slice.length),
          'content-range': `bytes ${start}-${end}/${body.length}`,
        })
        res.end(slice)
      } else {
        entry.bytes += body.length
        entry.wholeRequests++
        res.writeHead(200, { 'content-length': String(body.length) })
        res.end(body)
      }
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
    served = {}
  })

  afterAll(async () => {
    await new Promise<void>(resolve => {
      server.close(() => {
        resolve()
      })
    })
  })

  it('answers a narrow query with range requests, not a download', async () => {
    const gai = new Blob([readFileSync(`${BRCA1}.gai`)])
    const reads = await readGamRegion(
      new RemoteFile(`${origin}/brca1.gam`),
      gai,
      1n,
      24n,
    )
    // Same answer a whole-file scan gives for the same range.
    const names = (xs: { name?: string }[]) => xs.map(x => x.name ?? '').sort()
    const scanned = (await readGam(new Blob([hosted('/brca1.gam')]))).filter(
      r =>
        r.path?.mapping.some(m => {
          const id = m.position?.node_id
          return id !== undefined && BigInt(id) >= 1n && BigInt(id) <= 24n
        }) ?? false,
    )
    expect(names(reads)).toEqual(names(scanned))

    const gam = served['/brca1.gam']!
    expect(gam.wholeRequests).toBe(0)
    expect(gam.rangeRequests).toBeGreaterThan(0)
    expect(gam.bytes).toBeLessThan(hosted('/brca1.gam').length / 2)
  })

  // The same thing through the method the app calls, so the `.gai` sibling
  // lookup and GBZBaseAPI's own handle caching are covered too.
  it('serves a whole view without downloading the reads', async () => {
    const api = new GBZBaseAPI()
    const viewTarget: ViewTarget = {
      dataType: 'mounted files',
      tracks: [
        { trackFile: `${origin}/cactus.gbz.db`, trackType: 'graph' },
        { trackFile: `${origin}/reads.gam`, trackType: 'read' },
      ],
      region: 'ref:1-100',
    }
    const view = await api.getChunkedData(viewTarget, null)
    expect((view.graph?.node ?? []).length).toBeGreaterThan(0)
    expect((view.gam?.[0] ?? []).length).toBeGreaterThan(0)

    const reads = served['/reads.gam']!
    expect(reads.wholeRequests).toBe(0)
    expect(reads.bytes).toBeLessThan(hosted('/reads.gam').length / 2)
    // The index is small and has no index of its own, so it is the one file
    // still fetched whole.
    expect(bytesFor('/reads.gam.gai')).toBe(hosted('/reads.gam.gai').length)
  })
})
