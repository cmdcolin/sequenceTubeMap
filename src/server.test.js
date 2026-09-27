// @vitest-environment node

// Tests of the express backend's HTTP API, without the frontend.

process.env.SERVER_PORT = '0'

import http from 'node:http'
import { start } from './server.mjs'

const serverConfig = globalThis.__sequence_tube_map_config

let serverState = undefined

beforeAll(async () => {
  serverState = await start()
})

afterAll(async () => {
  await serverState.close()
})

afterEach(() => {
  delete serverConfig.allowedPrivateFetchAddresses
})

async function post(route, body) {
  const response = await fetch(`${serverState.getApiUrl()}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

// Serve `routes` (path to handler) on loopback, for tests that need the
// server to fetch URLs. Returns the base URL and a function to stop serving.
async function serveRoutes(routes) {
  const server = http.createServer((req, res) => {
    const handler = routes[req.url]
    if (handler === undefined) {
      res.writeHead(404).end()
    } else {
      handler(req, res)
    }
  })
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

function redirectTo(location) {
  return (req, res) => {
    res.writeHead(302, { Location: location }).end()
  }
}

function sendText(text) {
  return (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(text)
  }
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
      '/chunk/chunk_contents.txt': sendText('tracks.json\n'),
      '/chunk/tracks.json': redirectTo('http://[::ffff:7f00:2]/tracks.json'),
    })
    try {
      const { status, body } = await post('getChunkTracks', {
        bedFile: `${remote.url}/regions.bed`,
        chunk: 'chunk',
      })
      expect(status).toBe(400)
      expect(body.error).toMatch(/Refusing to fetch .*::ffff:7f00:2/)
    } finally {
      await remote.close()
    }
  })

  it('follows redirects between allowed hosts', async () => {
    serverConfig.allowedPrivateFetchAddresses = ['127.0.0.0/8']
    const remote = await serveRoutes({
      '/moved.bed': redirectTo('/regions.bed'),
      '/regions.bed': sendText('ref\t1\t10\tfirst ten\n'),
    })
    try {
      const { status, body } = await post('getBedRegions', {
        bedFile: `${remote.url}/moved.bed`,
      })
      expect(status).toBe(200)
      expect(body.bedRegions.desc).toEqual(['first ten'])
    } finally {
      await remote.close()
    }
  })
})
