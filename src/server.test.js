// @vitest-environment node

// Tests of the express backend's HTTP API, without the frontend.

process.env.SERVER_PORT = '0'

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { start } from './server.mjs'
import { find_vg, vg_available } from './vg.mjs'

const HAS_VG = vg_available()
// chunkix.py and pgtabix.py run tabix and bgzip.
const HAS_TABIX = spawnSync('tabix', ['--version']).status === 0

const serverConfig = globalThis.__sequence_tube_map_config

let serverState = undefined

// Scratch directories the current test made under tmp/, which the server
// accepts paths in, and the HTTP servers it started for the server to fetch
// from.
let fixtureDirs = []
let remoteServers = []

beforeAll(async () => {
  serverState = await start()
})

afterAll(async () => {
  await serverState.close()
})

afterEach(async () => {
  delete serverConfig.allowedPrivateFetchAddresses
  for (const dir of fixtureDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fixtureDirs = []
  await Promise.all(
    remoteServers.map(server => {
      server.closeAllConnections()
      return new Promise(resolve => server.close(resolve))
    }),
  )
  remoteServers = []
})

// Write a BED file with one line per [region, chunk] entry, next to copies of
// the named exampleData chunk directories leaving out the `omit` files.
// Returns the BED file's path.
function makeBedWithChunks(entries, { omit = [] } = {}) {
  const dir = fs.mkdtempSync('tmp/test-')
  fixtureDirs.push(dir)
  const lines = []
  for (const [region, chunk] of entries) {
    const [contig, range] = region.split(':')
    const [start, end] = range.split('-')
    lines.push([contig, start, end, region, chunk].join('\t'))
    fs.cpSync(path.join('exampleData', chunk), path.join(dir, chunk), {
      recursive: true,
      filter: source => !omit.includes(path.basename(source)),
    })
  }
  const bedFile = path.join(dir, 'regions.bed')
  fs.writeFileSync(bedFile, lines.join('\n') + '\n')
  return bedFile
}

const CACTUS_GRAPH = {
  trackFile: 'exampleData/cactus.vg.xg',
  trackType: 'graph',
}

const CACTUS_READS = {
  trackFile: 'exampleData/cactus-NA12879.sorted.gam',
  trackType: 'read',
}

async function expectServerStillUp() {
  const { status } = await post('getBedRegions', {
    bedFile: 'exampleData/cactus.bed',
  })
  expect(status).toBe(200)
}

async function post(route, body) {
  const response = await fetch(`${serverState.getApiUrl()}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

// Serve `routes` (path to handler) on loopback until the test ends, for tests
// that need the server to fetch URLs. Returns the base URL and the paths
// requested so far.
async function serveRoutes(routes) {
  const requests = []
  const notModified = []
  const server = http.createServer((req, res) => {
    requests.push(req.url)
    res.on('finish', () => {
      if (res.statusCode === 304) {
        notModified.push(req.url)
      }
    })
    const handler = routes[req.url]
    if (handler === undefined) {
      res.writeHead(404).end()
    } else {
      handler(req, res)
    }
  })
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  remoteServers.push(server)
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    notModified,
  }
}

function redirectTo(location) {
  return (req, res) => {
    res.writeHead(302, { Location: location }).end()
  }
}

function sendBody(body) {
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`
  return (req, res) => {
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end()
    } else {
      res.writeHead(200, { ETag: etag }).end(body)
    }
  }
}

// Routes serving an exampleData chunk directory at /<chunk>/.
function chunkRoutes(chunk) {
  const routes = {}
  for (const file of fs.readdirSync(path.join('exampleData', chunk))) {
    routes[`/${chunk}/${file}`] = sendBody(
      fs.readFileSync(path.join('exampleData', chunk, file)),
    )
  }
  return routes
}

describe('fetching URLs', () => {
  it.each([
    'http://127.0.0.1/regions.bed',
    'http://[::1]/regions.bed',
    'http://[::ffff:127.0.0.1]/regions.bed',
    'http://[::ffff:7f00:1]/regions.bed',
    'http://[::127.0.0.1]/regions.bed',
    'http://[64:ff9b::10.0.0.1]/regions.bed',
    'http://2130706433/regions.bed',
    'http://10.1.2.3/regions.bed',
    'http://[fd00::1]/regions.bed',
    'http://[2002:7f00:1::]/regions.bed',
    'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/regions.bed',
    'http://[64:ff9b:1::a00:1]/regions.bed',
  ])('refuses the non-public address in %s', async url => {
    const { status, body } = await post('getBedRegions', { bedFile: url })
    expect(status).toBe(400)
    expect(body.error).toMatch(/Refusing to fetch .*not a public address/)
  })

  it('refuses a host name that resolves to a non-public address', async () => {
    const { status, body } = await post('getBedRegions', {
      bedFile: 'http://localhost/regions.bed',
    })
    expect(status).toBe(400)
    expect(body.error).toMatch(/Refusing to connect to localhost/)
  })

  it('refuses a chunk file that redirects to a non-public address', async () => {
    serverConfig.allowedPrivateFetchAddresses = ['127.0.0.1']
    const remote = await serveRoutes({
      '/chunk/chunk_contents.txt': sendBody('tracks.json\n'),
      '/chunk/tracks.json': redirectTo('http://[::ffff:7f00:2]/tracks.json'),
    })
    const { status, body } = await post('getChunkTracks', {
      bedFile: `${remote.url}/regions.bed`,
      chunk: 'chunk',
    })
    expect(status).toBe(400)
    expect(body.error).toMatch(/Refusing to fetch .*::ffff:7f00:2/)
  })

  it('follows redirects between allowed hosts', async () => {
    serverConfig.allowedPrivateFetchAddresses = ['127.0.0.0/8']
    const remote = await serveRoutes({
      '/moved.bed': redirectTo('/regions.bed'),
      '/regions.bed': sendBody('ref\t1\t10\tfirst ten\n'),
    })
    const { status, body } = await post('getBedRegions', {
      bedFile: `${remote.url}/moved.bed`,
    })
    expect(status).toBe(200)
    expect(body.bedRegions.desc).toEqual(['first ten'])
  })

  it.skipIf(process.getuid?.() === 0)(
    'reports a download it cannot write as an error',
    async () => {
      serverConfig.allowedPrivateFetchAddresses = ['127.0.0.1']
      const remote = await serveRoutes({
        '/chunk/chunk_contents.txt': sendBody('tracks.json\n'),
        '/chunk/tracks.json': (req, res) => {
          res.writeHead(200).write('[')
          setTimeout(() => res.end(']'), 200)
        },
      })
      const bedFile = `${remote.url}/regions.bed`
      const chunkDir = path.join(
        serverConfig.tempDirPath,
        createHash('sha256')
          .update(bedFile + 'chunk')
          .digest('hex'),
      )
      fs.mkdirSync(serverConfig.tempDirPath, { recursive: true })
      fs.mkdirSync(chunkDir, { mode: 0o555 })
      try {
        const { status, body } = await post('getChunkTracks', {
          bedFile,
          chunk: 'chunk',
        })
        expect(status).toBe(500)
        expect(body.error).toMatch(/EACCES/)
        await expectServerStillUp()
      } finally {
        fs.rmSync(chunkDir, { recursive: true, force: true })
      }
    },
  )

  it.each([404, 302])(
    'drops the connection of a %i response it has no use for',
    async statusCode => {
      serverConfig.allowedPrivateFetchAddresses = ['127.0.0.1']
      let openConnections = 0
      const remote = await serveRoutes({
        '/moved.bed': (req, res) => {
          openConnections += 1
          req.socket.on('close', () => {
            openConnections -= 1
          })
          res.writeHead(statusCode, { Location: '/regions.bed' })
          const trickle = setInterval(() => res.write('x'), 50)
          req.socket.on('close', () => {
            clearInterval(trickle)
          })
        },
        '/regions.bed': sendBody('ref\t1\t10\tfirst ten\n'),
      })
      await post('getBedRegions', { bedFile: `${remote.url}/moved.bed` })
      await vi.waitFor(
        () => {
          expect(openConnections).toBe(0)
        },
        { timeout: 1000 },
      )
    },
  )
})

describe.skipIf(!HAS_VG)('BED files at URLs', () => {
  beforeEach(() => {
    serverConfig.allowedPrivateFetchAddresses = ['127.0.0.1']
  })

  it('renders a region that has no chunk', async () => {
    const remote = await serveRoutes({
      '/regions.bed': sendBody('ref\t1\t100\tfirst hundred\n'),
    })
    const { status, body } = await post('getChunkedData', {
      region: 'ref:1-100',
      bedFile: `${remote.url}/regions.bed`,
      tracks: [CACTUS_GRAPH],
    })
    expect(status).toBe(200)
    expect(body.graph.node.length).toBeGreaterThan(0)
    expect(remote.requests).toEqual(['/regions.bed'])
  })

  it('downloads a chunk once per request', async () => {
    const remote = await serveRoutes({
      '/regions.bed': sendBody(
        'ref\t500\t600\tno reads\tchunk-cactus-no-reads\n',
      ),
      ...chunkRoutes('chunk-cactus-no-reads'),
    })
    const { status, body } = await post('getChunkedData', {
      region: 'ref:500-600',
      bedFile: `${remote.url}/regions.bed`,
      tracks: [CACTUS_GRAPH],
    })
    expect(status).toBe(200)
    expect(body.graph.node.length).toBeGreaterThan(0)
    const fetches = path =>
      remote.requests.filter(request => request === path).length
    expect(fetches('/regions.bed')).toBe(1)
    expect(fetches('/chunk-cactus-no-reads/chunk_contents.txt')).toBe(1)
  })

  it('keeps a downloaded chunk file the host reports unchanged', async () => {
    const remote = await serveRoutes({
      '/regions.bed': sendBody(
        'ref\t500\t600\tno reads\tchunk-cactus-no-reads\n',
      ),
      ...chunkRoutes('chunk-cactus-no-reads'),
    })
    const request = {
      region: 'ref:500-600',
      bedFile: `${remote.url}/regions.bed`,
      tracks: [CACTUS_GRAPH],
    }
    expect((await post('getChunkedData', request)).status).toBe(200)
    const { status, body } = await post('getChunkedData', request)
    expect(status).toBe(200)
    expect(body.graph.node.length).toBeGreaterThan(0)
    expect(remote.notModified).toContain('/chunk-cactus-no-reads/chunk.vg')
  })
})

describe.skipIf(!HAS_VG)('chunking a graph', () => {
  it('pipes vg chunk through vg simplify', async () => {
    const { status, body } = await post('getChunkedData', {
      region: 'ref:1-100',
      tracks: [CACTUS_GRAPH],
      simplify: true,
    })
    expect(status).toBe(200)
    expect(body.graph.node.length).toBeGreaterThan(0)
    expect(body.graph.path[0].name).toBe('ref')
  })

  it.skipIf(!HAS_TABIX)(
    'cuts a tabix-indexed pangenome with chunkix',
    async () => {
      const dir = fs.mkdtempSync('tmp/test-')
      fixtureDirs.push(dir)
      const gfa = execFileSync(find_vg(), [
        'convert',
        '-f',
        'exampleData/cactus.gbz',
      ])
      fs.writeFileSync(path.join(dir, 'cactus.gfa.gz'), gzipSync(gfa))
      execFileSync('python3', [
        'scripts/pgtabix.py',
        '-g',
        path.join(dir, 'cactus.gfa.gz'),
        '-o',
        path.join(dir, 'cactus'),
      ])

      const { status, body } = await post('getChunkedData', {
        region: 'ref:1-100',
        tracks: [
          { trackFile: `${dir}/cactus.pos.bed.gz`, trackType: 'graph' },
          { trackFile: `${dir}/cactus.haps.gaf.gz`, trackType: 'haplotype' },
          { trackFile: `${dir}/cactus.nodes.tsv.gz`, trackType: 'node' },
        ],
      })
      expect(status).toBe(200)
      expect(body.graph.node.length).toBeGreaterThan(0)
      expect(body.graph.path[0]).toMatchObject({ name: 'ref', freq: '1' })
      expect(body.region).toEqual([1, 100])
    },
  )
})

describe.skipIf(!HAS_VG)('uploads', () => {
  it('sorts and indexes an uploaded GAM', async () => {
    const form = new FormData()
    form.append('fileType', 'read')
    form.append(
      'trackFile',
      new Blob([fs.readFileSync('exampleData/cactus-NA12879.gam')]),
      'reads.gam',
    )
    const response = await fetch(
      `${serverState.getApiUrl()}/trackFileSubmission`,
      { method: 'POST', body: form },
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.path).toMatch(/^uploads\/[0-9a-f-]+\.sorted\.gam$/)
    try {
      expect(fs.statSync(body.path).size).toBeGreaterThan(0)
      expect(fs.existsSync(body.path + '.gai')).toBe(true)
    } finally {
      const upload = body.path.replace(/\.sorted\.gam$/, '')
      for (const suffix of ['.gam', '.sorted.gam', '.sorted.gam.gai']) {
        fs.rmSync(upload + suffix, { force: true })
      }
    }
  })
})

describe('the server process', () => {
  it('sweeps stale scratch directories and cleans up on SIGTERM', async () => {
    // Its own working directory, so its cleanup can't touch this checkout's.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubemap-server-'))
    try {
      fs.mkdirSync(path.join(workDir, 'exampleData', 'internal'), {
        recursive: true,
      })
      fs.mkdirSync(path.join(workDir, 'tmp', 'tmp-stale'), { recursive: true })
      fs.mkdirSync(path.join(workDir, 'temp', 'download'), { recursive: true })

      const server = spawn(
        process.execPath,
        ['--experimental-strip-types', path.resolve('src/server.mjs')],
        { cwd: workDir, env: { ...process.env, SERVER_PORT: '0' } },
      )
      let output = ''
      server.stdout.on('data', data => {
        output += data
      })
      await vi.waitFor(() => {
        expect(output).toContain('TubeMapServer listening')
      }, 10000)
      expect(fs.existsSync(path.join(workDir, 'tmp', 'tmp-stale'))).toBe(false)

      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      expect(await exited).toEqual([0, null])
      expect(fs.existsSync(path.join(workDir, 'temp'))).toBe(false)
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  })
})

describe.skipIf(!HAS_VG)('a client that goes away', () => {
  // This worker's vg processes, which are the server's.
  function vgChildren() {
    try {
      return execFileSync('pgrep', ['-P', String(process.pid), '-x', 'vg'])
        .toString()
        .trim()
        .split('\n')
    } catch {
      return []
    }
  }

  it('takes its vg processes with it', async () => {
    const client = new AbortController()
    const request = fetch(`${serverState.getApiUrl()}/getChunkedData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: '17:1-81000',
        tracks: [
          {
            trackFile: 'exampleData/internal/snp1kg-BRCA1.vg.xg',
            trackType: 'graph',
          },
          {
            trackFile: 'exampleData/internal/NA12878-BRCA1.sorted.gam',
            trackType: 'read',
          },
        ],
      }),
      signal: client.signal,
    }).catch(() => {})
    const polling = { timeout: 5000, interval: 10 }
    await vi.waitFor(() => {
      expect(vgChildren()).not.toEqual([])
    }, polling)

    client.abort()
    const abortedAt = Date.now()
    // Left running, vg would take seconds more on this region and its reads.
    await vi.waitFor(() => {
      expect(vgChildren()).toEqual([])
    }, polling)
    expect(Date.now() - abortedAt).toBeLessThan(1000)
    await request
    await expectServerStillUp()
  })
})

describe.skipIf(!HAS_VG)('pre-fetched chunks', () => {
  it('serves a chunk with its reads', async () => {
    const { status, body } = await post('getChunkedData', {
      region: 'ref:2000-3000',
      bedFile: 'exampleData/cactus.bed',
      tracks: [CACTUS_GRAPH],
    })
    expect(status).toBe(200)
    expect(body.graph.node.length).toBeGreaterThan(0)
    expect(body.graph.path[0]).toMatchObject({
      name: 'ref',
      indexOfFirstBase: '1955',
    })
    expect(body.gam).toHaveLength(1)
    expect(body.gam[0].length).toBeGreaterThan(0)
  })

  it('simplifies a chunk that lists its own tracks', async () => {
    const { status, body } = await post('getChunkedData', {
      region: 'ref:500-600',
      bedFile: 'exampleData/cactus.bed',
      tracks: [CACTUS_GRAPH],
      simplify: true,
    })
    expect(status).toBe(200)
    expect(body.graph.node.length).toBeGreaterThan(0)
  })

  it('keeps read files in chunk order past ten of them', async () => {
    const bedFile = makeBedWithChunks([['ref:1-10', 'chunk-ref-1-20']])
    const chunkDir = path.join(path.dirname(bedFile), 'chunk-ref-1-20')
    const gam = number => path.join(chunkDir, `chunk${number}_0_ref_0_1926.gam`)
    for (let i = 2; i <= 9; i++) {
      fs.copyFileSync(gam('-1'), gam(`-${i}`))
    }
    fs.copyFileSync(
      'exampleData/chunk-ref-2000-3000/chunk_0_ref_1955_5023.gam',
      gam('-10'),
    )

    const { status, body } = await post('getChunkedData', {
      region: 'ref:1-10',
      bedFile,
      tracks: [CACTUS_GRAPH],
    })
    expect(status).toBe(200)
    const readNames = body.gam.map(reads => reads.map(read => read.name).join())
    expect(readNames).toHaveLength(11)
    expect(new Set(readNames.slice(1, 10)).size).toBe(1)
    expect(new Set([readNames[0], readNames[1], readNames[10]]).size).toBe(3)
  })

  it('answers for read tracks when the chunk has no read files', async () => {
    const bedFile = makeBedWithChunks(
      [['ref:500-600', 'chunk-cactus-no-reads']],
      { omit: ['tracks.json'] },
    )
    const { status, body } = await post('getChunkedData', {
      region: 'ref:500-600',
      bedFile,
      tracks: [CACTUS_GRAPH, CACTUS_READS],
    })
    expect(status).toBe(200)
    expect(body.gam).toEqual([])
  })

  it('answers once when a GAF fails to convert', async () => {
    const bedFile = makeBedWithChunks(
      [['ref:500-600', 'chunk-cactus-no-reads']],
      { omit: ['tracks.json'] },
    )
    fs.writeFileSync(
      path.join(path.dirname(bedFile), 'chunk-cactus-no-reads', 'chunk_0.gaf'),
      'not a GAF\n',
    )
    const setHeader = vi.spyOn(http.ServerResponse.prototype, 'setHeader')
    try {
      const { status, body } = await post('getChunkedData', {
        region: 'ref:500-600',
        bedFile,
        tracks: [CACTUS_GRAPH, CACTUS_READS],
      })
      expect(status).toBe(500)
      expect(body.error).toMatch(/vg convert failed/)
      // Give a second answer time to be attempted.
      await new Promise(resolve => setTimeout(resolve, 1000))
      const headersAlreadySent = setHeader.mock.results.filter(
        result => result.type === 'throw',
      )
      expect(headersAlreadySent).toEqual([])
    } finally {
      setHeader.mockRestore()
    }
  })

  it('refuses to convert a GAF against a graph outside the data paths', async () => {
    const bedFile = makeBedWithChunks(
      [['ref:500-600', 'chunk-cactus-no-reads']],
      { omit: ['tracks.json'] },
    )
    fs.writeFileSync(
      path.join(path.dirname(bedFile), 'chunk-cactus-no-reads', 'chunk_0.gaf'),
      '',
    )
    const { status, body } = await post('getChunkedData', {
      region: 'ref:500-600',
      bedFile,
      tracks: [
        { trackFile: '/etc/secret.vg', trackType: 'graph' },
        CACTUS_READS,
      ],
    })
    expect(status).toBe(400)
    expect(body.error).toMatch(/Graph file path not allowed: \/etc\/secret\.vg/)
  })

  it('reports a chunk without regions.tsv as an error', async () => {
    const bedFile = makeBedWithChunks(
      [['ref:500-600', 'chunk-cactus-no-reads']],
      { omit: ['regions.tsv', 'tracks.json'] },
    )
    const { status, body } = await post('getChunkedData', {
      region: 'ref:500-600',
      bedFile,
      tracks: [CACTUS_GRAPH],
    })
    expect(status).toBe(500)
    expect(body.error).toMatch(/regions\.tsv/)
    await expectServerStillUp()
  })
})
