// Headless tube-map renderer. Boots a jsdom DOM, installs minimal browser
// globals, then drives the existing tubemap.ts d3 code to emit static SVG.
//
// Two modes:
//   - --example N         render one of the bundled demo datasets (1..9)
//   - --source <name>     render a built-in source from src/config.json
//                         (e.g. "snp1kg-BRCA1 (WASM-compatible)")
//
// Examples:
//   pnpm tubemap-cli --example 1 --out out.svg
//   pnpm tubemap-cli --source 'snp1kg-BRCA1 (WASM-compatible)' --out brca1.svg
//   pnpm tubemap-cli --source 'snp1kg-BRCA1 (WASM-compatible)' \
//                    --region 17:1-200 --width 3000 --out brca1.svg

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { JSDOM } from 'jsdom'

interface CliArgs {
  example: string | undefined
  source: string | undefined
  region: string | undefined
  out: string
  width: number
  height: number
}

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      example: { type: 'string' },
      source: { type: 'string' },
      region: { type: 'string' },
      out: { type: 'string', default: 'tubemap.svg' },
      width: { type: 'string', default: '1800' },
      height: { type: 'string', default: '1200' },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help || (!values.example && !values.source)) {
    console.log(
      'tubemap-cli [--example 1..9 | --source <config name>] [--region X:S-E] [--out file.svg] [--width N] [--height N]',
    )
    process.exit(values.help ? 0 : 1)
  }
  return {
    example: values.example,
    source: values.source,
    region: values.region,
    out: String(values.out),
    width: Number(values.width),
    height: Number(values.height),
  }
}

function installBrowserGlobals(args: CliArgs): JSDOM {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="container"><svg id="tubemap"></svg></div></body></html>',
    { pretendToBeVisual: true, url: 'http://localhost/' },
  )
  const { window } = dom

  const parent = window.document.getElementById('container')
  if (!parent) throw new Error('jsdom: failed to find #container')
  Object.defineProperty(parent, 'clientWidth', {
    value: args.width,
    configurable: true,
  })
  Object.defineProperty(parent, 'clientHeight', {
    value: args.height,
    configurable: true,
  })

  const g = globalThis as unknown as Record<string, unknown>
  g.window = window
  g.document = window.document
  Object.defineProperty(g, 'navigator', {
    value: window.navigator,
    configurable: true,
  })
  g.HTMLElement = window.HTMLElement
  g.SVGElement = window.SVGElement
  g.Node = window.Node
  g.Element = window.Element
  g.Event = window.Event
  g.MouseEvent = window.MouseEvent
  g.File = window.File
  g.Blob = window.Blob
  g.FileReader = window.FileReader
  g.getComputedStyle = window.getComputedStyle.bind(window)
  g.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)

  return dom
}

async function loadDemoExample(example: string) {
  const demo = await import('../src/util/demo-data.js')
  const { computeExampleData } = await import('../src/components/tubeMapData.ts')
  const { dataOriginTypes } = await import('../src/enums.ts')
  const key = `EXAMPLE_${example}` as keyof typeof dataOriginTypes
  const origin = dataOriginTypes[key]
  if (!origin) throw new Error(`Unknown example: ${example} (try 1-9)`)
  return computeExampleData(origin, demo as Parameters<typeof computeExampleData>[1])
}

interface ConfigDataSource {
  name: string
  region?: string
  tracks: { trackFile: string | null; trackType: string }[]
}

async function loadSourceFromConfig(
  dom: JSDOM,
  sourceName: string,
  regionOverride: string | undefined,
) {
  const configPath = path.resolve('src/config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    DATA_SOURCES: ConfigDataSource[]
  }
  const src = config.DATA_SOURCES.find(s => s.name === sourceName)
  if (!src) {
    const names = config.DATA_SOURCES.map(s => `  - ${s.name}`).join('\n')
    throw new Error(
      `Unknown source "${sourceName}". Available:\n${names}`,
    )
  }

  const region = regionOverride ?? src.region
  if (!region) throw new Error(`Source "${sourceName}" has no region`)

  const { GBZBaseAPI } = await import('../src/api/GBZBaseAPI.ts')
  const { getCompiledWasm } = await import('./cli-wasm-loader.ts')
  const api = new GBZBaseAPI(getCompiledWasm)

  // Stage each track file (and any sibling .gai) into the API's upload
  // registry. resolveTrackFile prefers numeric ids, so once we've uploaded a
  // file the API doesn't try to fetch() it from the network.
  const uploadedTracks: { trackFile: string; trackType: string }[] = []
  for (const t of src.tracks) {
    if (!t.trackFile) continue
    const localPath = path.resolve(t.trackFile)
    const data = readFileSync(localPath)
    const file = new dom.window.File([data], path.basename(t.trackFile), {
      type: 'application/octet-stream',
    })
    const id = await api.putFile(t.trackType as 'graph' | 'haplotype' | 'read', file, null)
    uploadedTracks.push({ trackFile: id, trackType: t.trackType })

    // Sibling indexes (e.g. .gai for .gam) need to be uploaded with their
    // real filename so resolveSibling can find them by `<gam>.gai`.
    if (t.trackType === 'read') {
      const gaiPath = localPath + '.gai'
      try {
        const gaiData = readFileSync(gaiPath)
        const gaiFile = new dom.window.File(
          [gaiData],
          path.basename(t.trackFile) + '.gai',
          { type: 'application/octet-stream' },
        )
        await api.putFile('read', gaiFile, null)
      } catch {
        // No sibling index — full-scan filter will run instead.
      }
    }
  }

  console.error(`querying ${sourceName} @ ${region} ...`)
  const chunked = await api.getChunkedData(
    {
      region,
      tracks: uploadedTracks as Parameters<typeof api.getChunkedData>[0]['tracks'],
      dataType: 'built-in',
    },
    null,
  )
  if (!chunked.graph) throw new Error('API returned no graph data')

  // Convert vg JSON into tubemap inputs the same way TubeMapContainer does.
  const tubeMap = await import('../src/util/tubemap.ts')
  const readTrackIds: number[] = []
  let graphTrackId = 0
  let haplotypeTrackId = 0
  uploadedTracks.forEach((t, i) => {
    if (t.trackType === 'read') readTrackIds.push(i)
    else if (t.trackType === 'graph') graphTrackId = i
    else if (t.trackType === 'haplotype') haplotypeTrackId = i
  })

  const nodes = tubeMap.vgExtractNodes(chunked.graph)
  const tracks = tubeMap.vgExtractTracks(chunked.graph, graphTrackId, haplotypeTrackId)
  const reads: ReturnType<typeof tubeMap.vgExtractReads> = []
  let totalReads = 0
  for (const [i, gam] of (chunked.gam ?? []).entries()) {
    const sourceTrackId = readTrackIds[i] ?? 0
    const r = tubeMap.vgExtractReads(nodes, tracks, gam, totalReads, sourceTrackId)
    reads.push(...r)
    totalReads += r.length
  }

  return { nodes, tracks, reads, region: chunked.region }
}

async function main(): Promise<void> {
  const args = parseCli()
  const dom = installBrowserGlobals(args)

  // Import tubemap AFTER globals are installed: config-client.js touches
  // `typeof window` at import time, and d3 binds to the ambient document on
  // first selection.
  const tubeMap = await import('../src/util/tubemap.ts')

  const { nodes, tracks, reads, region } = args.example
    ? { ...(await loadDemoExample(args.example)), region: undefined }
    : await loadSourceFromConfig(dom, args.source!, args.region)

  tubeMap.create({
    svgID: '#tubemap',
    nodes,
    tracks,
    reads,
    region,
    clickableNodes: false,
    hideLegend: false,
  })

  const svg = dom.window.document.getElementById('tubemap')
  if (!svg) throw new Error('SVG element vanished after render')

  // Replace the viewport-fixed width/height with a viewBox so viewers scale
  // the content fluidly. The actual rendered content may extend past the
  // viewBox (clipped on display) — pass a larger --width/--height to capture
  // more of the layout horizontally.
  const renderedWidth = svg.getAttribute('width') ?? String(args.width)
  const renderedHeight = svg.getAttribute('height') ?? String(args.height)
  svg.setAttribute('viewBox', `0 0 ${renderedWidth} ${renderedHeight}`)
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`
  writeFileSync(args.out, xml)
  console.error(`wrote ${args.out} (${xml.length.toLocaleString()} bytes)`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
