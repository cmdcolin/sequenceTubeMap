// Headless tube-map renderer. Boots a jsdom DOM, installs minimal browser
// globals, then drives the same data pipeline and d3 renderer the web app
// uses, and emits the resulting SVG.
//
// Three ways to say what to draw:
//   - --url <link>        render the view a shared app link describes
//   - --source <name>     render a built-in source from src/config.json
//                         (e.g. "snp1kg-BRCA1 (gbz-base)")
//   - --example N         render one of the bundled demo datasets (1..9)
//
// Examples:
//   pnpm tubemap-cli --example 1 --out out.svg
//   pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' --out brca1.svg
//   pnpm tubemap-cli --url '<a link copied from the app>' --out link.svg

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import type { GBZBaseAPI } from '../src/api/GBZBaseAPI.ts'
import type { FetchKey } from '../src/components/tubeMapData.ts'
import type { ColorScheme, Tracks, ViewTarget, VisOptionFlag } from '../src/Types.ts'
import { VIS_OPTION_FLAGS, type StoredVisOptions } from '../src/util/visOptions.ts'

// Every View-menu flag, as the CLI spelling that sets it. Keyed by the option
// so a new one added to the app cannot quietly go missing here.
const FLAG_OPTIONS: Record<
  VisOptionFlag,
  { flag: string; value: boolean; help: string }
> = {
  compressedView: {
    flag: 'compressed',
    value: true,
    help: 'logarithmic node widths',
  },
  showReads: {
    flag: 'no-reads',
    value: false,
    help: 'draw the graph without read alignments',
  },
  showSoftClips: {
    flag: 'no-soft-clips',
    value: false,
    help: 'hide soft-clipped read ends',
  },
  removeRedundantNodes: {
    flag: 'no-merge-nodes',
    value: false,
    help: 'keep redundant nodes instead of merging chains',
  },
  showNodeLabels: {
    flag: 'node-labels',
    value: true,
    help: 'label nodes with their ids',
  },
  transparentNodes: {
    flag: 'transparent-nodes',
    value: true,
    help: 'draw node outlines without fill',
  },
  coarsenedReadView: {
    flag: 'coarsened',
    value: true,
    help: 'one band per node-to-node transition, not per read',
  },
  ignoreStrand: {
    flag: 'ignore-strand',
    value: true,
    help: 'treat forward and reverse as equivalent',
  },
  colorReadsByMappingQuality: {
    flag: 'color-by-mapq',
    value: true,
    help: 'colour reads by mapping quality',
  },
  alphaReadsByMappingQuality: {
    flag: 'alpha-by-mapq',
    value: true,
    help: 'fade reads by mapping quality',
  },
}

function flagHelp(): string {
  return VIS_OPTION_FLAGS.map(option => {
    const { flag, help } = FLAG_OPTIONS[option]
    return `  --${flag.padEnd(18)}${help}\n`
  }).join('')
}

const USAGE = `tubemap-cli [--url <link> | --source <config name> | --example 1..9]
             [--region X:S-E] [--out file.svg] [--width N] [--height N]
             [--viewport] [--read-limit N]

--url takes a link the app itself produced (its Copy link button, or the
address bar), and draws what that link describes. --region and the view options
below override what it carries.

View options, mirroring the app's View menu:
${flagHelp()}  --mapq N            drop reads below mapping quality N

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
  | { source: string }
  | { url: string }

interface CliArgs {
  target: RenderTarget
  // Region to draw, overriding whatever the target names.
  region: string | undefined
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

// Booleans parseArgs is told to accept, one per View-menu option.
function flagArgOptions(): Record<
  string,
  { type: 'boolean'; default: boolean }
> {
  return Object.fromEntries(
    VIS_OPTION_FLAGS.map(option => [
      FLAG_OPTIONS[option].flag,
      { type: 'boolean' as const, default: false },
    ]),
  )
}

function flagOverrides(
  values: Record<string, string | boolean | undefined>,
): Partial<StoredVisOptions> {
  const overrides: Partial<StoredVisOptions> = {}
  for (const option of VIS_OPTION_FLAGS) {
    if (values[FLAG_OPTIONS[option].flag] === true) {
      overrides[option] = FLAG_OPTIONS[option].value
    }
  }
  return overrides
}

// Exactly one of the three ways to say what to draw.
function parseTarget(values: {
  example?: string
  source?: string
  url?: string
}): RenderTarget {
  const named = [
    ...(values.example === undefined ? [] : ['--example']),
    ...(values.source === undefined ? [] : ['--source']),
    ...(values.url === undefined ? [] : ['--url']),
  ]
  if (named.length > 1) {
    throw new Error(
      `pass one of --example, --source or --url, not ${named.join(' and ')}`,
    )
  }
  if (values.example !== undefined) {
    return { example: values.example }
  }
  if (values.source !== undefined) {
    return { source: values.source }
  }
  if (values.url !== undefined) {
    return { url: values.url }
  }
  throw new Error(`pass one of --example, --source or --url\n${USAGE}`)
}

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      example: { type: 'string' },
      source: { type: 'string' },
      url: { type: 'string' },
      region: { type: 'string' },
      out: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      viewport: { type: 'boolean', default: false },
      'read-limit': { type: 'string' },
      mapq: { type: 'string' },
      help: { type: 'boolean', default: false },
      ...flagArgOptions(),
    },
  })
  if (values.help) {
    process.stdout.write(USAGE)
    process.exit(0)
  }
  const target = parseTarget(values)
  if ('example' in target && values.region !== undefined) {
    throw new Error('--region has nothing to override on an --example render')
  }
  return {
    target,
    region: values.region,
    out: values.out ?? 'tubemap.svg',
    width: parsePositive('width', values.width ?? '1800'),
    height: parsePositive('height', values.height ?? '1200'),
    viewport: values.viewport,
    readLimit:
      values['read-limit'] === undefined
        ? undefined
        : parsePositive('read-limit', values['read-limit']),
    visOptions: {
      ...flagOverrides(values),
      ...(values.mapq !== undefined && {
        // 0 is the default "no cutoff", so it has to be accepted.
        mappingQualityCutoff: parseCount('mapq', values.mapq),
      }),
    },
  }
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
  const origin = Object.entries(dataOriginTypes).find(
    ([key]) => key === `EXAMPLE_${example}`,
  )?.[1]
  if (origin === undefined) {
    throw new Error(`unknown example "${example}", expected 1-9`)
  }
  return origin
}

// config.json names its files relative to the site root, which is this repo, so
// resolve them the way the browser resolves them against the page rather than
// against the working directory -- which would only work when run from the
// checkout. One level up holds for this file and for the bundle the pnpm
// script builds beside it in tmp/.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

function localFilePath(file: string): string {
  return path.resolve(REPO_ROOT, file)
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
              fileFromPath(localFilePath(track.haplotypeIndexFile)),
              null,
            ),
          }
        : {}
    if (track.trackFile && isLocal(track.trackFile)) {
      const localPath = localFilePath(track.trackFile)
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

// The app's own config, as the browser would have loaded it.
async function loadDataSources(): Promise<ViewTarget[]> {
  await import('../src/config-client.js')
  const { config } = await import('../src/config-global.mjs')
  return config.DATA_SOURCES
}

// A view target from the app is only half usable here: its files are paths the
// browser would fetch, and its graph may be one the in-browser backend cannot
// open. Check it, apply the region override, and stage its files as uploads.
async function prepareViewTarget(
  api: GBZBaseAPI,
  target: ViewTarget,
  regionOverride: string | undefined,
  describe: string,
): Promise<ViewTarget> {
  const { isLocalCompatibleDataSource } = await import('../src/common.ts')
  if (!isLocalCompatibleDataSource(target)) {
    throw new Error(
      `${describe} has no .gbz.db graph; this renderer uses the in-browser backend, which cannot read .vg/.xg/.gbz`,
    )
  }
  const region = regionOverride ?? target.region
  if (!region) {
    throw new Error(`${describe} names no region, pass --region`)
  }
  return { ...target, region, tracks: await stageTracks(api, target.tracks) }
}

async function viewTargetForSource(
  api: GBZBaseAPI,
  sourceName: string,
  regionOverride: string | undefined,
): Promise<ViewTarget> {
  const sources = await loadDataSources()
  const { isLocalCompatibleDataSource } = await import('../src/common.ts')
  const source = sources.find(s => s.name === sourceName)
  if (!source) {
    const names = sources
      .filter(isLocalCompatibleDataSource)
      .map(s => `  - ${s.name}`)
      .join('\n')
    throw new Error(`unknown source "${sourceName}". Renderable:\n${names}`)
  }
  return prepareViewTarget(
    api,
    source,
    regionOverride,
    `source "${sourceName}"`,
  )
}

// A link the app produced, read by the app's own parser: `?name=` resolves
// against the configured sources exactly as it does in the browser, and a link
// that spells its tracks out works without one.
async function viewTargetForUrl(
  api: GBZBaseAPI,
  link: string,
  regionOverride: string | undefined,
): Promise<ViewTarget> {
  const { urlParamsToViewTarget } = await import('../src/urlViewTarget.ts')
  const target = urlParamsToViewTarget(absoluteUrl(link), await loadDataSources())
  if (target === null) {
    throw new Error(
      'the link names neither a known data source (?name=) nor a region and tracks of its own',
    )
  }
  return prepareViewTarget(api, target, regionOverride, 'the link')
}

// A pasted link is usually whole, but a bare query string is a reasonable
// thing to hand a CLI, and the app's parser wants something absolute.
function absoluteUrl(link: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(link)
    ? link
    : `http://localhost/${link.replace(/^\//, '')}`
}

// The View-menu settings a link carries, under the flags this run passed. A
// flag is the more explicit of the two, so it wins.
async function urlVisOptions(
  target: RenderTarget,
): Promise<Partial<StoredVisOptions>> {
  const { urlParamsToVisOptions } = await import('../src/urlViewTarget.ts')
  return 'url' in target ? urlParamsToVisOptions(absoluteUrl(target.url)) : {}
}

interface Render {
  // The SWR key the web app would use for this render.
  key: FetchKey
  // Absent for the demo datasets, which aren't a view of anything.
  viewTarget: ViewTarget | undefined
  visOptions: StoredVisOptions
  colorSchemes: ColorScheme[]
}

async function resolveRender(api: GBZBaseAPI, args: CliArgs): Promise<Render> {
  const { defaultTrackColors } = await import('../src/common.ts')
  const { DEFAULT_VIS_OPTIONS, exampleColorSchemes } =
    await import('../src/util/visOptions.ts')
  const visOptions = {
    ...DEFAULT_VIS_OPTIONS,
    ...(await urlVisOptions(args.target)),
    ...args.visOptions,
  }

  if ('example' in args.target) {
    const origin = await exampleOrigin(args.target.example)
    return {
      key: ['tubeMap.example', origin],
      viewTarget: undefined,
      visOptions,
      colorSchemes: exampleColorSchemes(origin),
    }
  }

  const viewTarget =
    'source' in args.target
      ? await viewTargetForSource(api, args.target.source, args.region)
      : await viewTargetForUrl(api, args.target.url, args.region)
  console.error(
    `querying ${viewTarget.name ?? 'the link'} @ ${viewTarget.region} ...`,
  )
  return {
    key: ['tubeMap.api', api.mode, viewTarget],
    viewTarget,
    visOptions,
    // Derived exactly as App does, so a source that pins its palettes in
    // config.json renders here in those palettes too.
    colorSchemes: viewTarget.tracks.map(
      t => t.trackColorSettings ?? defaultTrackColors(t.trackType),
    ),
  }
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
  const { subsampleReads } = await import('../src/util/array.ts')
  const { exportSvg } = await import('../src/util/svgExport.ts')
  const { applyVisOptions } = await import('../src/util/visOptions.ts')

  const api = new GBZBaseAPI()
  const { key, viewTarget, visOptions, colorSchemes } = await resolveRender(
    api,
    args,
  )
  const data = await fetchTubeMapData(key, api)

  // Configure the renderer through the same path the app does, rather than
  // leaning on tubemap's module defaults happening to agree with it.
  applyVisOptions(
    { ...visOptions, colorSchemes, coloredNodes: data.coloredNodes },
    viewTarget?.removeSequences !== true,
  )

  // The coarsened view weighs each band by how many reads traverse it, so a cap
  // would quietly redraw the picture rather than thin it. The app doesn't apply
  // its own read limit there either.
  const { readLimit } = args
  if (readLimit !== undefined && visOptions.coarsenedReadView) {
    console.error('warning: --read-limit does not apply to --coarsened renders')
  }
  const reads =
    readLimit === undefined || visOptions.coarsenedReadView
      ? data.reads
      : subsampleReads(data.reads, readLimit)
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
