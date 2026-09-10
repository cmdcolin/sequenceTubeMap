// Headless tube-map renderer. Boots a jsdom DOM, installs minimal browser
// globals, then drives the same data pipeline and d3 renderer the web app
// uses, and emits the resulting SVG.
//
// Two modes:
//   - --example N         render one of the bundled demo datasets (1..9)
//   - --source <name>     render a built-in source from src/config.json
//                         (e.g. "snp1kg-BRCA1 (gbz-base)")
//
// Examples:
//   pnpm tubemap-cli --example 1 --out out.svg
//   pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' --out brca1.svg
//   pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' \
//                    --region 17:1-200 --out brca1.svg

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
             [--read-limit N]

View options, mirroring the app's View menu:
  --compressed        logarithmic node widths
  --no-reads          draw the graph without read alignments
  --no-soft-clips     hide soft-clipped read ends
  --no-merge-nodes    keep redundant nodes instead of merging chains
  --node-labels       label nodes with their ids
  --transparent-nodes draw node outlines without fill
  --coarsened         one band per node-to-node transition, not per read
  --ignore-strand     treat forward and reverse as equivalent
  --color-by-mapq     colour reads by mapping quality
  --alpha-by-mapq     fade reads by mapping quality
  --mapq N            drop reads below mapping quality N

The exported viewBox is cropped to the drawing at natural scale, so a figure
depends on the data and the view options alone. --width/--height size the
viewport the map is laid out in, which only reaches the output through
--viewport: the whole canvas, framed and zoomed as the app would show it.

Every read in the region is drawn unless --read-limit caps it, in which case
reads are evenly subsampled the way the app's read-render limit does.

--compressed is the flag to reach for whenever a figure comes out unreadably
wide. Node width scales with sequence length, so any region spanning many bases
lays out far wider than tall and the detail disappears; making width
logarithmic pulls it back. snp1kg-BRCA1 at 17:1-1000 goes from 10122 units
across to 1099, at the same height.
`

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

function parseCount(name: string, raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be zero or a positive number, got "${raw}"`)
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
      'no-soft-clips': { type: 'boolean', default: false },
      'no-merge-nodes': { type: 'boolean', default: false },
      'node-labels': { type: 'boolean', default: false },
      'transparent-nodes': { type: 'boolean', default: false },
      coarsened: { type: 'boolean', default: false },
      'ignore-strand': { type: 'boolean', default: false },
      'color-by-mapq': { type: 'boolean', default: false },
      'alpha-by-mapq': { type: 'boolean', default: false },
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
      ...(values['no-soft-clips'] && { showSoftClips: false }),
      ...(values['no-merge-nodes'] && { removeRedundantNodes: false }),
      ...(values['node-labels'] && { showNodeLabels: true }),
      ...(values['transparent-nodes'] && { transparentNodes: true }),
      ...(values.coarsened && { coarsenedReadView: true }),
      ...(values['ignore-strand'] && { ignoreStrand: true }),
      ...(values['color-by-mapq'] && { colorReadsByMappingQuality: true }),
      ...(values['alpha-by-mapq'] && { alphaReadsByMappingQuality: true }),
      ...(values.mapq !== undefined && {
        // 0 is the default "no cutoff", so it has to be accepted.
        mappingQualityCutoff: parseCount('mapq', values.mapq),
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
  g.XMLSerializer = window.XMLSerializer
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
  const isLocal = (file: string) => !/^https?:\/\//.test(file)
  const staged: Tracks = []
  for (const track of tracks) {
    // A companion haplotype index is staged the same way, since the API reads
    // it exactly like the database. The browser resolves a config-relative
    // path against the page; there is no page here.
    const companion =
      track.haplotypeIndexFile && isLocal(track.haplotypeIndexFile)
        ? {
            haplotypeIndexFile: await api.putFile(
              track.trackType,
              fileFromPath(path.resolve(track.haplotypeIndexFile)),
              null,
            ),
          }
        : {}
    if (track.trackFile && isLocal(track.trackFile)) {
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
      staged.push({ ...track, ...companion, trackFile: id })
    } else {
      staged.push({ ...track, ...companion })
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

// Layout and export are the two phases that can get slow on a dense region, so
// keep them measurable. GBZBASE_DEBUG=1 matches GBZBaseAPI.
function debugTiming(phase: string, since: number): void {
  if (process.env.GBZBASE_DEBUG === '1') {
    console.error(`[timing] ${phase} ${Date.now() - since}ms`)
  }
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
  const { exportSvg } = await import('../src/util/svgExport.ts')
  const { applyVisOptions, DEFAULT_VIS_OPTIONS } =
    await import('../src/util/visOptions.ts')

  const api = new GBZBaseAPI()
  const { key, viewTarget } = await resolveFetch(api, args.target)
  const data = await fetchTubeMapData(key, api)

  // The mapping-quality colouring rides on a track's colour scheme, and the
  // bundled examples have no tracks to carry one, so the flags would otherwise
  // be accepted and quietly do nothing.
  if (
    viewTarget === undefined &&
    (args.visOptions.colorReadsByMappingQuality === true ||
      args.visOptions.alphaReadsByMappingQuality === true)
  ) {
    console.error(
      'warning: --color-by-mapq/--alpha-by-mapq have no effect on --example renders',
    )
  }

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

  const tCreate = Date.now()
  tubeMap.create({
    svgID: '#tubemap',
    nodes: data.nodes,
    tracks: data.tracks,
    reads,
    region: data.region,
  })

  debugTiming('create()', tCreate)

  const tExport = Date.now()
  const svg = dom.window.document.getElementById('tubemap')
  if (!svg) {
    throw new Error('SVG element vanished after render')
  }

  // The same export the browser's Download Image button uses, so a figure made
  // here matches one saved from the app.
  const { xml, nonFinite, cropped } = exportSvg(svg, !args.viewport)
  debugTiming('export', tExport)

  // A healthy layout never produces these. When it does the affected shapes are
  // simply missing from the picture, so say so rather than shipping a quietly
  // incomplete figure.
  if (nonFinite > 0) {
    console.error(
      `warning: ${nonFinite} shape(s) have non-finite coordinates and will not appear`,
    )
  }
  if (!cropped && !args.viewport) {
    console.error('warning: nothing was drawn, the figure is blank')
  }

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
