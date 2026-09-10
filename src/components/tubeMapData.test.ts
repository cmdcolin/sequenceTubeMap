// @vitest-environment node

import { GBZBaseAPI } from '../api/GBZBaseAPI.ts'
import { parseChunkedData } from './tubeMapData.ts'
import { GRAPH_RENDER_LIMIT, graphNodeVisits } from './TubeMapContainer.tsx'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type { ViewTarget } from '../Types.ts'

// GRAPH_RENDER_LIMIT is a number picked from measurements, and a number like
// that rots quietly: the reader gets faster, the graph gets rebuilt, and the
// cap ends up either refusing the app's own flagship figure or waving through
// the window that hangs the tab. So the calibration is checked against the
// real graph, through the same pipeline the renderer is fed by. The
// measurements are in doc/data.md.
//
// Network-gated, like the other HPRC v2.1 tests: `RUN_NETWORK_TESTS=1`.
const RUN_NETWORK = process.env.RUN_NETWORK_TESTS === '1'
const hprc = (config.DATA_SOURCES as ViewTarget[]).find(ds =>
  ds.name?.startsWith('HPRC v2.1'),
)!

async function nodeVisitsFor(region: string) {
  const target = { ...hprc, region }
  const json = await new GBZBaseAPI().getChunkedData(target, null)
  return graphNodeVisits(parseChunkedData(json, target.tracks).tracks)
}

describe.skipIf(!RUN_NETWORK)('the graph render cap, against HPRC v2.1', () => {
  it('draws the chr20 microsatellite the README figures come from', async () => {
    const visits = await nodeVisitsFor('GRCh38#chr20:48000600-48001000')

    expect(visits).toBeGreaterThan(10000)
    expect(visits).toBeLessThan(GRAPH_RENDER_LIMIT)
  }, 180000)

  it('refuses a 10 kb window, which is a 9 MB SVG', async () => {
    expect(await nodeVisitsFor('GRCh38#chr6:31500000-31510000')).toBeGreaterThan(
      GRAPH_RENDER_LIMIT,
    )
  }, 180000)
})
