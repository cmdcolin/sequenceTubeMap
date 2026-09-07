// Headless tube-map renderer. Boots a jsdom DOM, installs minimal browser
// globals, then drives the same data pipeline and d3 renderer the web app
// uses, and emits the resulting SVG.
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import type { GBZBaseAPI } from '../src/api/GBZBaseAPI.ts'
import type { FetchKey } from '../src/components/tubeMapData.ts'
import type { Tracks, ViewTarget } from '../src/Types.ts'
import type { StoredVisOptions } from '../src/util/visOptions.ts'

const USAGE = `tubemap-cli [--example 1..9 | --source <config name>] [--region X:S-E]
             [--out file.svg] [--width N] [--height N] [--viewport]
             [--read-limit N] [--compressed] [--no-reads] [--node-labels]
             [--coarsened] [--mapq N]

The tube map is laid out in a --width by --height viewport, which is what
decides how much the drawing is scaled down. The exported viewBox is then
cropped to the drawing; pass --viewport to export the whole canvas instead.

Every read in the region is drawn unless --read-limit caps it, in which case
reads are evenly subsampled the way the app's read-render limit does.

The view flags mirror the app's View menu. --compressed is the one to reach for
on a graph whose nodes hold long sequences: node width becomes logarithmic in
sequence length, which is often the difference between a legible figure and a
drawing tens of thousands of units wide.
`

// Breathing room around the cropped drawing so edge strokes and the outermost
// sequence labels aren't shaved off.
const CROP_MARGIN = 10

type RenderTarget =
  | { example: string }
  | { source: string; region: string | undefined }

interface CliArgs {
  target: RenderTarget
  out: string
  width: number
  height: number
  // Export the whole laid-out canvas rather than cropping to the drawing.
  viewport: boolean
  // Most reads to draw, or undefined to draw them all.
  readLimit: number | undefined
  // View-menu settings this render departs from the app's defaults on.
  visOptions: Partial<StoredVisOptions>
}

function parsePositive(name: string, raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number, got "${raw}"`)
  }
  return value
}

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      example: { type: 'string' },
      source: { type: 'string' },
      region: { type: 'string' },
      out: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      viewport: { type: 'boolean', default: false },
      'read-limit': { type: 'string' },
      compressed: { type: 'boolean', default: false },
      'no-reads': { type: 'boolean', default: false },
      'node-labels': { type: 'boolean', default: false },
      coarsened: { type: 'boolean', default: false },
      mapq: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    process.stdout.write(USAGE)
    process.exit(0)
  }
  const common = {
    out: values.out ?? 'tubemap.svg',
    width: parsePositive('width', values.width ?? '1800'),
    height: parsePositive('height', values.height ?? '1200'),
    viewport: values.viewport,
    readLimit:
      values['read-limit'] === undefined
        ? undefined
        : parsePositive('read-limit', values['read-limit']),
    visOptions: {
      ...(values.compressed && { compressedView: true }),
      ...(values['no-reads'] && { showReads: false }),
      ...(values['node-labels'] && { showNodeLabels: true }),
      ...(values.coarsened && { coarsenedReadView: true }),
      ...(values.mapq !== undefined && {
        mappingQualityCutoff: parsePositive('mapq', values.mapq),
      }),
    },
  }
  if (values.example !== undefined && values.source !== undefined) {
    throw new Error(`pass either --example or --source, not both\n${USAGE}`)
  }
  if (values.example !== undefined) {
    if (values.region !== undefined) {
      throw new Error('--region only applies to --source renders')
    }
    return { target: { example: values.example }, ...common }
  }
  if (values.source !== undefined) {
    return {
      target: { source: values.source, region: values.region },
      ...common,
    }
  }
  throw new Error(`pass one of --example or --source\n${USAGE}`)
}

function installBrowserGlobals(args: CliArgs): JSDOM {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="container"><svg id="tubemap"></svg></div></body></html>',
    { pretendToBeVisual: true, url: 'http://localhost/' },
  )
  const { window } = dom

  const parent = window.document.getElementById('container')
  if (!parent) {
    throw new Error('jsdom: failed to find #container')
  }
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

// dataOriginTypes keys the examples as EXAMPLE_1..EXAMPLE_9; the value is what
// the fetch layer wants.
async function exampleOrigin(example: string): Promise<string> {
  const { dataOriginTypes } = await import('../src/enums.ts')
  const match = Object.entries(dataOriginTypes).find(
    ([key]) => key === `EXAMPLE_${example}`,
  )
  if (!match) {
    throw new Error(`unknown example "${example}", expected 1-9`)
  }
  return match[1]
}

function fileFromPath(localPath: string): File {
  return new File([readFileSync(localPath)], path.basename(localPath), {
    type: 'application/octet-stream',
  })
}

// Hand each local track file (and any sibling index beside it) to the API's
// upload registry and rewrite the track to point at the upload id.
// resolveTrackFile prefers ids, so an uploaded file is never fetch()ed from the
// network, and resolveSibling finds an index by `<track filename><suffix>` —
// which is why siblings are uploaded under their real basename. A URL track is
// left alone so the API reads it by range requests, as it does in the browser.
async function stageTracks(api: GBZBaseAPI, tracks: Tracks): Promise<Tracks> {
  const { SIBLING_INDEX_SUFFIXES } =
    await import('../src/api/local/fileRegistry.ts')
  const staged: Tracks = []
  for (const track of tracks) {
    if (track.trackFile && !/^https?:\/\//.test(track.trackFile)) {
      const localPath = path.resolve(track.trackFile)
      const id = await api.putFile(
        track.trackType,
        fileFromPath(localPath),
        null,
      )
      for (const suffix of SIBLING_INDEX_SUFFIXES) {
        if (existsSync(localPath + suffix)) {
          await api.putFile(
            track.trackType,
            fileFromPath(localPath + suffix),
            null,
          )
        }
      }
      staged.push({ ...track, trackFile: id })
    } else {
      staged.push(track)
    }
  }
  return staged
}

async function viewTargetForSource(
  api: GBZBaseAPI,
  sourceName: string,
  regionOverride: string | undefined,
): Promise<ViewTarget> {
  await import('../src/config-client.js')
  const { config } = await import('../src/config-global.mjs')
  const { isLocalCompatibleDataSource } = await import('../src/common.ts')
  const sources: ViewTarget[] = config.DATA_SOURCES

  const source = sources.find(s => s.name === sourceName)
  if (!source) {
    const names = sources
      .filter(isLocalCompatibleDataSource)
      .map(s => `  - ${s.name}`)
      .join('\n')
    throw new Error(`unknown source "${sourceName}". Renderable:\n${names}`)
  }
  if (!isLocalCompatibleDataSource(source)) {
    throw new Error(
      `source "${sourceName}" has no .gbz.db graph; this renderer uses the in-browser backend, which cannot read .vg/.xg/.gbz`,
    )
  }
  const region = regionOverride ?? source.region
  if (!region) {
    throw new Error(`source "${sourceName}" has no region, pass --region`)
  }
  return { ...source, region, tracks: await stageTracks(api, source.tracks) }
}

// The SWR key the web app would use for this render, plus the view target it
// was built from — the demo datasets don't have one, and the renderer options
// it carries only apply to a source render.
async function resolveFetch(
  api: GBZBaseAPI,
  target: RenderTarget,
): Promise<{ key: FetchKey; viewTarget: ViewTarget | undefined }> {
  if ('example' in target) {
    const key: FetchKey = [
      'tubeMap.example',
      await exampleOrigin(target.example),
    ]
    return { key, viewTarget: undefined }
  }
  const viewTarget = await viewTargetForSource(
    api,
    target.source,
    target.region,
  )
  console.error(`querying ${target.source} @ ${viewTarget.region} ...`)
  return { key: ['tubeMap.api', api.mode, viewTarget], viewTarget }
}

async function main(): Promise<void> {
  const args = parseCli()
  const dom = installBrowserGlobals(args)

  // Import the app modules AFTER the globals are installed: config-client.js
  // touches `typeof window` at import time, and d3 binds to the ambient
  // document on first selection.
  const tubeMap = await import('../src/util/tubemap.ts')
  const { fetchTubeMapData } = await import('../src/components/tubeMapData.ts')
  const { GBZBaseAPI } = await import('../src/api/GBZBaseAPI.ts')
  const { defaultTrackColors } = await import('../src/common.ts')
  const { subsampleReads } = await import('../src/util/array.ts')
  const { nonFiniteGeometryCount, svgContentBounds } =
    await import('../src/util/svgBounds.ts')
  const { applyVisOptions, DEFAULT_VIS_OPTIONS } =
    await import('../src/util/visOptions.ts')

  const api = new GBZBaseAPI()
  const { key, viewTarget } = await resolveFetch(api, args.target)
  const data = await fetchTubeMapData(key, api)

  // Configure the renderer through the same path the app does, rather than
  // leaning on tubemap's module defaults happening to agree with it. The color
  // schemes are derived exactly as App does, so a source that pins its
  // palettes in config.json renders here in those palettes too.
  applyVisOptions(
    {
      ...DEFAULT_VIS_OPTIONS,
      ...args.visOptions,
      colorSchemes: (viewTarget?.tracks ?? []).map(
        t => t.trackColorSettings ?? defaultTrackColors(t.trackType),
      ),
      coloredNodes: data.coloredNodes,
    },
    viewTarget?.removeSequences !== true,
  )

  const reads =
    args.readLimit === undefined
      ? data.reads
      : subsampleReads(data.reads, args.readLimit)
  if (reads.length < data.reads.length) {
    console.error(
      `subsampled ${reads.length.toLocaleString()} of ${data.reads.length.toLocaleString()} reads`,
    )
  }

  tubeMap.create({
    svgID: '#tubemap',
    nodes: data.nodes,
    tracks: data.tracks,
    reads,
    region: data.region,
  })

  const svg = dom.window.document.getElementById('tubemap')
  if (!svg) {
    throw new Error('SVG element vanished after render')
  }

  // The renderer draws the whole layout but sizes the <svg> to the viewport it
  // laid out in, so exporting that size would clip a wide map and leave dead
  // space under a short one. Crop to what was actually drawn instead, and
  // trade width/height for the viewBox so viewers scale the map fluidly.
  // A healthy layout never produces these. When it does the affected shapes
  // are simply missing from the picture, so say so rather than shipping a
  // quietly incomplete figure.
  const broken = nonFiniteGeometryCount(svg)
  if (broken > 0) {
    console.error(
      `warning: ${broken} shape(s) have non-finite coordinates and will not appear`,
    )
  }

  const bounds = svgContentBounds(svg)
  const pad = CROP_MARGIN
  svg.setAttribute(
    'viewBox',
    bounds && !args.viewport
      ? `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`
      : `0 0 ${args.width} ${args.height}`,
  )
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`
  writeFileSync(args.out, xml)
  console.error(`wrote ${args.out} (${xml.length.toLocaleString()} bytes)`)
}

// A bad flag or an unreadable source is a user error, so report the message
// (plus whatever the failure was caused by) rather than a jsdom-deep stack.
// GBZBASE_DEBUG=1 turns the raw error back on, matching GBZBaseAPI's logging.
main().catch((err: unknown) => {
  if (err instanceof Error && process.env.GBZBASE_DEBUG !== '1') {
    for (
      let cause: unknown = err;
      cause instanceof Error;
      cause = cause.cause
    ) {
      console.error(cause.message)
    }
  } else {
    console.error(err)
  }
  process.exit(1)
})
