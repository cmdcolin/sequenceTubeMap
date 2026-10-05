// The tube map layout + d3 drawing engine. Ported from the original
// sequenceTubeMap JS; see agent-docs/todo/layout-engine-cleanup.md
// for the remaining clean-up plan.
import * as d3 from 'd3'
import '../config-client.js'
import '../config-global.mjs'
import { defaultTrackColors } from '../common.ts'
import {
  type Coloring,
  type DrawnTrack,
  drawnTrack,
  encodingFor,
  readEncodingFrom,
} from './encoding.ts'
import type { Scheme } from './scales.ts'
import { formatTrackDisplayName } from './trackName.ts'
import {
  clampedXCoordinateOfBaseWithinNode,
  curvePaths,
  emptyTrackShapes,
  forward,
  getXCoordinateOfBaseWithinNode,
  isCoarsenedId,
  isReverse,
  layoutTubeMap,
  mirroredMismatch,
  nodeOutlinePath,
  nodePixelCoordinatesInX,
  READ_WIDTH,
  reverse,
} from '@gmod/tubemap-core'
import type {
  CoarsenedEdgeMeta,
  Coarsening,
  ColorableTrack,
  ImageBounds,
  InputNode,
  InputTrack,
  LayoutNode,
  Mismatch,
  Node,
  LayoutOptions,
  ReadSequenceEntry,
  Track,
  TrackCorner,
  TrackCurve,
  TrackRectangle,
  TrackShapes,
  TrackType,
  TubeMapLayout,
} from '@gmod/tubemap-core'

// Replacement for d3-selection-multi (incompatible with d3 v7). Use via
// `selection.call(applyAttrs, {...})` — keeps the chain typed without
// modifying d3's prototype.
function applyAttrs<T extends d3.BaseType, U, V extends d3.BaseType, W>(
  sel: d3.Selection<T, U, V, W>,
  attrs: Record<string, string | number>,
): void {
  for (const [k, v] of Object.entries(attrs)) sel.attr(k, v)
}

const DEBUG = false as boolean

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    // oxlint-disable-next-line no-console
    console.log(...args)
  }
}

export type {
  IncomingReadKey,
  InputNode,
  InputTrack,
  Mismatch,
} from '@gmod/tubemap-core'
export {
  compareIncomingReadKeys,
  fillUnassignedOrders,
  reverseMismatches,
  UNREACHABLE_ORDER,
} from '@gmod/tubemap-core'

export type InputRegion = (number | null)[]

export type ColorScheme = Scheme

export interface ReadGroup {
  color: string
  reads: Set<string>
  // Carried through so a legend can say which group a color belongs to. The
  // drawing itself never reads it.
  name?: string
}

export interface ReadContextMenuState {
  readName: string
  x: number
  y: number
}

export interface NodeContextMenuState {
  nodeName: string
  readNames: string[]
  x: number
  y: number
}

export type InfoAttribute = [string, string | number | null | undefined]

interface TubeMapConfig {
  mergeNodesFlag: boolean
  transparentNodesFlag: boolean
  nodeWidthOption: 'normal' | 'compressed' | 'small' | 'fixed'
  showNodeLabels: boolean
  showReads: boolean
  showSoftClips: boolean
  coarsenedReadView: boolean
  ignoreStrand: boolean
  colorReadsByMappingQuality: boolean
  alphaReadsByMappingQuality: boolean
  colorSchemes: Record<number, ColorScheme>
  coloredNodes: string[]
  mappingQualityCutoff: number
  nodeIntervalThreshold: number
  showInfoCallback: (info: InfoAttribute[]) => void
  readContextMenuCallback: (menu: ReadContextMenuState | null) => void
  nodeContextMenuCallback: (menu: NodeContextMenuState | null) => void
  focusReadNames: string[] | null
  readGroups: ReadGroup[]
  otherReadsColor: string
}

export interface CreateParams {
  svgID: string
  nodes: InputNode[]
  tracks: InputTrack[]
  reads?: InputTrack[] | null
  region?: InputRegion
}

// vg-json shapes. vg is permissive (mixes string/number, sometimes omits
// fields) so we describe the loose shape we read here.
export interface VgEdit {
  from_length?: number
  to_length?: number
  sequence?: string
}

export interface VgPosition {
  node_id: number | string
  is_reverse?: boolean
  offset?: number | string
}

export interface VgMapping {
  edit: VgEdit[]
  // Optional because cigar_string only needs `edit`; vgExtractReads narrows
  // with an undefined-check before using position.
  position?: VgPosition
}

export interface VgPath {
  mapping: VgMapping[]
  name?: string
  freq?: number
  indexOfFirstBase?: number | string
}

export interface VgNode {
  id: number | string
  sequence: string
  sequenceLength?: number
}

export interface VgRead {
  path?: VgPath
  name?: string
  mapping_quality?: number
  is_secondary?: boolean
  is_reverse?: boolean
  sample_name?: string | null
  read_group?: string | null
  score?: number
}

export interface VgJson {
  node: VgNode[]
  path: VgPath[]
}

type AnySelection = d3.Selection<Element, unknown, HTMLElement, unknown>
type SvgGroupSelection = d3.Selection<
  SVGGElement,
  unknown,
  HTMLElement,
  unknown
>

// Font stack we will use in the SVG
// We start with Courier New because it exists a lot more places than
// "Courier", and because tools like Inkscape can't interpret the text properly
// if they don't have the first font named here.
const fonts = '"Courier New", "Courier", "Lucida Console", monospace'

// ---------------------------------------------------------------------------
// Module state, in three groups: the inputs from create(), the per-render
// layout scratch (all reset together at the top of createTubeMap), and the UI
// state that has to outlive a render. See agent-docs/todo/layout-engine-cleanup.md for
// the plan to thread the layout scratch through as a parameter instead.
// ---------------------------------------------------------------------------

// --- inputs, owned by create() ---
let svgID: string // the (html-tag) ID of the svg
let inputNodes: InputNode[] = []
let inputTracks: InputTrack[] = []
let inputReads: InputTrack[] = []
let inputRegion: InputRegion = []

// --- the latest layout ---
// nodes is 1-indexed: a hole at index 0 lets a *signed* index mean
// orientation (-i = reverse of node i).
let nodes: LayoutNode[] = []
// haplotype tracks, then the placed reads
let tracks: Track[] = []
let reads: Track[] = []
let nodeMap: ReadonlyMap<string, number> = new Map()

// --- UI state, outlives a render ---
// The root <svg> until alignSVG, then the zoomed <g> everything is drawn in
let svg: AnySelection
let zoom: d3.ZoomBehavior<Element, unknown>
// The <svg> the zoom is attached to, while a drawing is on the page
let zoomRoot: AnySelection | null = null

const config: TubeMapConfig = {
  mergeNodesFlag: true,
  transparentNodesFlag: false,
  // Options for the width of sequence nodes:
  // normal...scale node width linear with number of bases within node
  // compressed...scale node width with log2 of number of bases within node
  // small...scale node width with 1% of number of bases within node
  // fixed...set fixed node width to 1 base
  nodeWidthOption: 'normal',
  showNodeLabels: false,
  showReads: true,
  showSoftClips: true,
  coarsenedReadView: false,
  ignoreStrand: false,
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
  colorSchemes: {},
  // colors corresponds with tracks(input files), [haplotype, read1, read2, ...]
  mappingQualityCutoff: 0,
  // How far apart can nodes be before making a break in the coordinate bar?
  nodeIntervalThreshold: 150,
  showInfoCallback: function (info: InfoAttribute[]) {
    alert(info)
  },
  readContextMenuCallback: function () {},
  nodeContextMenuCallback: function () {},
  coloredNodes: [],
  focusReadNames: null,
  // Array of { color, reads: Set<string> }. Reads matching a group's set are
  // drawn in that color, overriding the default strand/palette coloring. The
  // last group in the array wins for reads belonging to multiple groups.
  readGroups: [],
  // When readGroups is non-empty, reads outside every group use this palette
  // (or hex) instead of the strand-based default. Prevents visual confusion
  // from mixing strand-based and group-based color schemes simultaneously.
  otherReadsColor: 'greys',
}

// Drawing instructions from the latest layout
let shapes: TrackShapes = emptyTrackShapes()

// The extent of the drawn content, in layout coordinates. Outlives the draw
// because a resize recomputes the zoom's extents from it.
let imageBounds: ImageBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
let trackForRuler: string | undefined
// The coarsened bands' read counts and labels, for the hover and click
// handlers
let coarsenedEdgeMeta = new Map<number, CoarsenedEdgeMeta>()
let coarsened: Coarsening | undefined
// What the last draw placed, projected for the legend, and the scheme each
// source's tracks were colored with
let drawn: DrawnTrack[] = []
let drawnSchemes = new Map<number, ColorScheme>()

interface Paint {
  color: string
  alpha?: number
}

// Each drawn track's paint, by id: the shapes carry only the id
let paints = new Map<number, Paint>()

// The latest layout and the inputs it came from, so a draw that changes only
// the coloring skips the layout
let laidOut:
  | {
      from: readonly unknown[]
      layout: TubeMapLayout | undefined
    }
  | undefined

// alignSVG attaches a wheel listener and ResizeObserver to the parent each
// time it runs; create() runs on every TubeMap prop change, so without
// tracking the previous registration the listeners stack up.
let cleanupParentBindings: (() => void) | null = null

// Everything this module attaches outside its own <svg> (the parent's wheel
// listener and ResizeObserver, the hover tooltip in <body>) and what zoomBy
// acts on. The next draw recreates them, so call this when the map leaves the
// page.
export function releaseDomBindings(): void {
  if (cleanupParentBindings) {
    cleanupParentBindings()
    cleanupParentBindings = null
  }
  // A zoom transition would otherwise run on into the next drawing
  zoomRoot?.interrupt()
  zoomRoot = null
  hoverTooltip?.remove()
  hoverTooltip = undefined
  // The highlighted elements are about to be removed along with the old SVG.
  highlightedTrack = null
}

// The tracks array of the most recent create() call. Reference equality with
// it and inputNodes tells a redraw of the same dataset, which keeps the user's
// pan/zoom, hidden tracks and track order, from a new one.
let lastCreateTracks: InputTrack[] | null = null

// Makes the next create() treat its data as new, however it compares. For a
// map leaving the page, so that the same data drawn again later starts over,
// as the rest of the view around it does.
export function forgetDataset(): void {
  lastCreateTracks = null
}

// svgID must be an ID selector
export function create(params: CreateParams): void {
  const sameDataset =
    params.nodes === inputNodes && params.tracks === lastCreateTracks
  if (!sameDataset) {
    // Copies, because changeTrackVisibility and trackDoubleClick edit them
    inputTracks = params.tracks.map(track => ({ ...track }))
  }
  inputNodes = params.nodes
  lastCreateTracks = params.tracks
  svgID = params.svgID
  svg = d3.select(params.svgID)
  inputReads = params.reads ?? NO_READS
  inputRegion = params.region ?? []
  createTubeMap(sameDataset)
}

const NO_READS: InputTrack[] = []

// Draws again after an edit to inputTracks in place, which the layout's
// inputs can't show
function relayout(): void {
  laidOut = undefined
  createTubeMap()
}

// The next layout straightens against the new first track
function moveTrackToFirstPosition(index: number): void {
  inputTracks.unshift(inputTracks[index]!) // add element to beginning
  inputTracks.splice(index + 1, 1) // remove 1 element from the middle
}

export function changeTrackVisibility(trackID: number): void {
  const track = inputTracks.find(t => t.id === trackID)
  if (track) {
    track.hidden = !track.hidden
  }
  relayout()
}

// to select/deselect all
export function changeAllTracksVisibility(value: boolean): void {
  for (const t of inputTracks) {
    t.hidden = !value
  }
  relayout()
}

// React subscription for the per-track visibility panel. tubemap.ts owns
// the track list (and visibility state) and emits a fresh snapshot after
// every redraw; TrackVisibilityPanel renders from it without poking the DOM.
export interface TrackVisibilityItem {
  id: number
  name: string
  color: string
  hidden: boolean
  // Haplotype-cluster weight from gbz-base --distinct (collapsed traversals).
  // Used by the formatter to render "name ×N" so the user can see relative
  // abundance for anonymized clusters.
  freq?: number
}
const visibilitySubscribers = new Set<() => void>()
let visibilitySnapshot: TrackVisibilityItem[] = []

// For useSyncExternalStore — returns the cached snapshot (stable ref when unchanged).
export function getTrackVisibilitySnapshot(): TrackVisibilityItem[] {
  return visibilitySnapshot
}

export function subscribeTrackVisibility(cb: () => void): () => void {
  visibilitySubscribers.add(cb)
  return () => {
    visibilitySubscribers.delete(cb)
  }
}

function emitTrackVisibility(): void {
  const items: TrackVisibilityItem[] = []
  // The layout takes a track with no type for a haplotype
  for (const t of inputTracks) {
    if (t.type === 'haplotype' || t.type === undefined) {
      items.push({
        id: t.id,
        name: t.name ?? String(t.id),
        color: paintOf(t, datumOf(t)).color,
        hidden: t.hidden === true,
        ...(t.freq !== undefined ? { freq: t.freq } : {}),
      })
    }
  }
  visibilitySnapshot = items
  for (const cb of visibilitySubscribers) cb()
}

// Every setter below only mutates `config`. `create()` is the single render
// trigger, so a batch of visOptions changes costs one draw, and one that
// changes only the coloring costs no layout.

// sets the flag for whether redundant nodes should be automatically removed or not
export function setMergeNodesFlag(value: boolean): void {
  config.mergeNodesFlag = value
}

// sets the flag for whether nodes should be fully transparent or not
export function setTransparentNodesFlag(value: boolean): void {
  config.transparentNodesFlag = value
}

// sets the flag for whether read soft clips should be displayed or not
export function setSoftClipsFlag(value: boolean): void {
  config.showSoftClips = value
}

// sets the flag for whether reads should be displayed or not
export function setShowReadsFlag(value: boolean): void {
  config.showReads = value
}

// Toggles the Sankey-style coarsened read view: one aggregated band per edge
// instead of per-read ribbons.
export function setCoarsenedReadViewFlag(value: boolean): void {
  config.coarsenedReadView = value
}

// Treat forward and reverse strands as equivalent. In normal mode this drops
// the reverse-strand palette; in coarsened mode this merges
// (+A→+B) and (-B→-A) into one band.
export function setIgnoreStrandFlag(value: boolean): void {
  config.ignoreStrand = value
}

export function setColorReadsByMappingQualityFlag(value: boolean): void {
  config.colorReadsByMappingQuality = value
}

export function setAlphaReadsByMappingQualityFlag(value: boolean): void {
  config.alphaReadsByMappingQuality = value
}

export function setColorSet(
  fileID: number | string,
  newColor: ColorScheme,
): void {
  config.colorSchemes[Number(fileID)] = newColor
}

// sets which option should be used for calculating the node width from its sequence length
/*
  - normal: Node lengths are computed based on the sequence length, and the sequences are displayed
  - compressed: Node lengths are computed based on the log of the sequence length, and the sequences aren't displayed
  - small: Node lengths are computed based on the sequence length / 100, and the sequences aren't displayed
  - fixed: Node lengths are set to 1 base unit, and the sequences aren't displayed
 */
export function setNodeWidthOption(
  value: 'normal' | 'compressed' | 'small' | 'fixed',
): void {
  config.nodeWidthOption = value
}

export function setColoredNodes(value: unknown): void {
  config.coloredNodes = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
}

export function setShowNodeLabels(value: boolean): void {
  config.showNodeLabels = value
}

// sets callback function that would generate React popup of track information. The callback would
// accept an array argument of track attribute pairs containing attribute name as a string and attribute value
// as a string or number, to be displayed.
export function setInfoCallback(
  newCallback: (info: InfoAttribute[]) => void,
): void {
  config.showInfoCallback = newCallback
}

// Set the callback fired when the user right-clicks a read in the tube map.
// The callback receives { readName, x, y } where x/y are clientX/clientY.
export function setReadContextMenuCallback(
  newCallback: (menu: ReadContextMenuState | null) => void,
): void {
  config.readContextMenuCallback = newCallback
}

// Set the callback fired when the user right-clicks a node in the tube map.
// The callback receives { nodeName, readNames, x, y }.
export function setNodeContextMenuCallback(
  newCallback: (menu: NodeContextMenuState | null) => void,
): void {
  config.nodeContextMenuCallback = newCallback
}

// Collect the names of all reads (from the unfiltered input) that traverse a
// set of nodes. mode === "all" requires the read to visit every node in the
// set (intersection); mode === "any" requires at least one (union).
export function getReadNamesThroughNodes(
  nodeNames: string[],
  mode: 'all' | 'any',
): string[] {
  const seen = new Set<string>()
  if (inputReads.length > 0 && nodeNames.length > 0) {
    inputReads.forEach(read => {
      if (read.name) {
        const visited = new Set(read.sequence.map(s => forward(s)))
        const match =
          mode === 'all'
            ? nodeNames.every(n => visited.has(n))
            : nodeNames.some(n => visited.has(n))
        if (match) {
          seen.add(read.name)
        }
      }
    })
  }
  return Array.from(seen)
}

// Restrict the displayed reads to the given set of read names. Pass null or
// an empty array to clear the filter.
export function setFocusReadNames(value: string[] | null | undefined): void {
  config.focusReadNames = value && value.length > 0 ? value : null
}

interface ReadGroupInput {
  color: string
  reads: string[] | Set<string>
  name?: string
}

// Set the named read groups for custom coloring. Accepts an array of
// { color, reads: string[] }; last group wins on overlap. Pass [] or null to
// clear all groups.
export function setReadGroups(
  value: ReadGroupInput[] | null | undefined,
): void {
  config.readGroups = (value ?? []).map(g => ({
    color: g.color,
    reads: new Set(g.reads),
    ...(g.name === undefined ? {} : { name: g.name }),
  }))
}

export function setOtherReadsColor(value: string | null | undefined): void {
  config.otherReadsColor = value && value.length > 0 ? value : 'greys'
}

export function setMappingQualityCutoff(value: number): void {
  config.mappingQualityCutoff = value
}

export interface RenderedColoring extends Coloring {
  // Indexed by source track: what the UI set, else the default the draw fell
  // back to, with holes only where a track drew nothing.
  colorSchemes: ColorScheme[]
  readGroups: { name?: string; color: string }[]
  otherReadsColor: string
  ignoreStrand: boolean
  // Every track the last draw placed, which is what a legend keys
  drawn: DrawnTrack[]
}

// The View menu's flags in config, as the coloring they pick
function currentColoring(): Coloring {
  return {
    read: readEncodingFrom(config),
    readGroups: config.readGroups,
    otherReadsColor: config.otherReadsColor,
    ignoreStrand: config.ignoreStrand,
  }
}

// What the current drawing is colored with. A legend has to describe the
// picture rather than whatever props the component asking happens to hold, and
// this config is what the picture was drawn from.
export function getRenderedColoring(): RenderedColoring {
  const colorSchemes: ColorScheme[] = []
  for (const [id, scheme] of Object.entries(config.colorSchemes)) {
    colorSchemes[Number(id)] = scheme
  }
  for (const [source, scheme] of drawnSchemes) {
    colorSchemes[source] ??= scheme
  }
  return {
    read: readEncodingFrom(config),
    colorSchemes,
    readGroups: config.readGroups.map(({ reads, ...group }) => group),
    otherReadsColor: config.otherReadsColor,
    ignoreStrand: config.ignoreStrand,
    drawn,
  }
}

// The same, taken once per draw, for useSyncExternalStore. A draw that leaves
// the coloring unchanged notifies no one: TubeMapContainer re-renders on a
// notification, and a re-render that hands TubeMap new props draws again.
const coloringSubscribers = new Set<() => void>()
let coloringSnapshot = getRenderedColoring()

export function getRenderedColoringSnapshot(): RenderedColoring {
  return coloringSnapshot
}

export function subscribeRenderedColoring(cb: () => void): () => void {
  coloringSubscribers.add(cb)
  return () => {
    coloringSubscribers.delete(cb)
  }
}

function emitRenderedColoring(): void {
  const coloring = getRenderedColoring()
  if (JSON.stringify(coloring) !== JSON.stringify(coloringSnapshot)) {
    coloringSnapshot = coloring
    for (const cb of coloringSubscribers) cb()
  }
}

// The sequence is drawn in `fonts`, which is monospace, so one character's
// width sizes every node under nodeWidthOption 'normal'.
function measureCharWidth(): number {
  svg
    .append('text')
    .attr('x', 0)
    .attr('y', 100)
    .attr('id', 'dummytext')
    .text('A')
    .attr('font-family', fonts)
    .attr('font-size', '14px')
    .attr('fill', 'black')
    .style('pointer-events', 'none')
  const probe = document.getElementById('dummytext') as SVGTextElement | null
  const charWidth =
    probe && typeof probe.getComputedTextLength === 'function'
      ? probe.getComputedTextLength()
      : 8.401
  probe?.remove()
  return charWidth
}

// main. preserveViewport keeps the user's current pan/zoom; pass false only
// when the underlying dataset changed and the old viewport is meaningless.
function createTubeMap(preserveViewport = true): void {
  svg = d3.select(svgID)
  svg.selectAll('*').remove() // clear svg for (re-)drawing
  // Tear down the listeners/tooltip from the previous draw *before* the early
  // exits below, otherwise an empty redraw leaves them bound to a stale parent.
  releaseDomBindings()
  // Emitted here rather than at the end of the draw so the panel still gets a
  // snapshot when every track is hidden and we bail out early.
  emitTrackVisibility()

  const layout = layOut()
  if (layout === undefined) {
    shapes = emptyTrackShapes()
    imageBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    trackForRuler = undefined
    coarsened = undefined
    drawn = []
    drawnSchemes = new Map()
    paints = new Map()
    emitRenderedColoring()
    return
  }
  ;({
    nodes,
    tracks,
    reads,
    nodeMap,
    shapes,
    trackForRuler,
    coarsenedEdgeMeta,
    coarsened,
  } = layout)
  imageBounds = layout.bounds
  drawn = tracks.map(datumOf)
  const coloring = currentColoring()
  paints = new Map(
    tracks.map((track, i) => [track.id, paintOf(track, drawn[i]!, coloring)]),
  )
  drawnSchemes = new Map()
  // A haplotype band is shaded by its share, so it says nothing about the
  // scheme its file's paths took
  for (const [i, track] of tracks.entries()) {
    if (
      drawn[i]!.mark !== 'haplotypeBand' &&
      !drawnSchemes.has(track.sourceTrackID)
    ) {
      drawnSchemes.set(track.sourceTrackID, colorSchemeFor(track))
    }
  }
  emitRenderedColoring()
  const applyInitialTransform = alignSVG(preserveViewport)
  defineHoverPattern()

  // all drawn tracks are grouped
  const trackGroup = svg.append('g').attr('class', 'track')
  drawTrackRectangles(shapes.rectangles, 'haplotype', trackGroup)
  drawTrackCurves('haplotype', trackGroup)
  drawReversalsByColor(
    shapes.corners,
    shapes.verticalRectangles,
    'haplotype',
    trackGroup,
  )
  drawTrackRectangles(shapes.rectangles, 'read', trackGroup)
  drawTrackCurves('read', trackGroup)

  // Only the nodes a visible track passes through have coordinates
  const dNodes = nodes.filter((node: { x?: number }) => node.x !== undefined)
  drawReversalsByColor(
    shapes.corners,
    shapes.verticalRectangles,
    'read',
    trackGroup,
  )

  // all drawn nodes are grouped
  const nodeGroup = svg.append('g').attr('class', 'node')
  drawNodes(dNodes, nodeGroup)
  if (config.nodeWidthOption === 'normal' && !config.showNodeLabels)
    drawLabels(dNodes)
  if (trackForRuler !== undefined) drawRuler()
  if (config.nodeWidthOption === 'normal') drawMismatches() // TODO: call this before drawLabels and fix d3 data/append/enter stuff
  // Drawn last so the labels paint above ruler/mismatches/reads
  if (config.showNodeLabels) drawNodeLabels(dNodes)
  debugLog(`${tracks.length} tracks, ${nodes.length} nodes`)
  // Apply the initial zoom transform now that all content (including node
  // labels) is in the DOM. The zoom handler's synchronous "end" flush will
  // counter-scale every label group on this first paint.
  applyInitialTransform()
}

function layOut(): TubeMapLayout | undefined {
  const options: LayoutOptions = {
    mergeNodes: config.mergeNodesFlag,
    showReads: config.showReads,
    coarsenedReadView: config.coarsenedReadView,
    ignoreStrand: config.ignoreStrand,
    nodeWidthOption: config.nodeWidthOption,
    charWidth:
      config.nodeWidthOption === 'normal' ? measureCharWidth() : undefined,
    mappingQualityCutoff: config.mappingQualityCutoff,
    focusReadNames: config.focusReadNames,
  }
  const from = [inputNodes, inputTracks, inputReads, JSON.stringify(options)]
  if (
    laidOut === undefined ||
    from.some((input, i) => input !== laidOut!.from[i])
  ) {
    laidOut = {
      from,
      layout: layoutTubeMap(inputNodes, inputTracks, inputReads, options),
    }
  }
  return laidOut.layout
}

// Minimum zoom is a scaling factor that determines how far the graph can be zoomed out. This function determines
// how small the graph needs to appear to fully fit onto the screen.
// This factor is based on imageBounds.maxX and imageBounds.maxY, and the size of the svg's parent.
function minZoom(): number {
  const parentElement = getSvgParent()
  const contentWidth = imageBounds.maxX - imageBounds.minX
  const contentHeight = imageBounds.maxY - imageBounds.minY + RAIL_SPACE
  // getImageDimensions leaves the min/max sentinels crossed when no node got
  // coordinates, which would otherwise produce a negative scale factor.
  if (parentElement && contentWidth > 0 && contentHeight > 0) {
    return (
      MIN_ZOOM_PADDING *
      Math.min(
        1,
        parentElement.clientWidth / contentWidth,
        parentElement.clientHeight / contentHeight,
      )
    )
  }
  return 1
}

// This needs to be the width of the ruler.
// TODO: Tell the ruler drawing code.
const RULER_WIDTH = 30
const NODE_MARGIN = 10
// This is how much space to let us pan, around the nodes as measure by getImageDimensions()
const RAIL_SPACE = RULER_WIDTH + NODE_MARGIN
const MAX_ZOOM = 8
// Allow zooming out ~15% past the exact-fit level so the content sits with
// comfortable padding rather than flush against the viewport edges.
const MIN_ZOOM_PADDING = 0.85

function getSvgParent(): HTMLElement | null {
  const svgElement = document.getElementById(svgID.substring(1))
  return svgElement?.parentNode instanceof HTMLElement
    ? svgElement.parentNode
    : null
}

// align visualization to the top and left within svg and resize svg to correct size
// enable zooming and panning. Returns a function that applies the initial zoom
// transform; the caller is expected to invoke it *after* all content (nodes,
// labels, etc.) has been appended, so the zoom handler's synchronous flush can
// counter-scale every label group on the first paint.
function alignSVG(preserveViewport: boolean): () => void {
  const svgElement = document.getElementById(svgID.substring(1))
  const parentElement = getSvgParent()
  if (!svgElement || !parentElement) return () => {}
  const root = svg
  // The zoom handlers below write to this <g> rather than to the module's svg,
  // which a later draw repoints at the root while a gesture or transition may
  // still be finishing
  const drawing = root.append('g')

  // d3-zoom stores the current transform on the SVG node as __zoom. It is
  // undefined until the first time we attach a zoom behaviour. By capturing it
  // before re-attaching, we can distinguish a first-time draw (needs the
  // centred initial transform) from a re-draw (should preserve the user's
  // pan/zoom across a re-create that was triggered by, e.g., a visOptions
  // change or a spurious parent re-render).
  const previousTransform = (svgElement as { __zoom?: d3.ZoomTransform }).__zoom

  // rAF-coalesce zoom events so a burst of wheel/pointer ticks only triggers
  // one transform write (and one browser repaint) per frame instead of one per
  // event. With ~600k SVG children this is the difference between "fluid" and
  // "stuck" on the Toxo dataset.
  let pendingTransform: string | null = null
  let pendingK = 1
  let rafHandle: number | null = null
  function flushTransform(): void {
    rafHandle = null
    if (pendingTransform !== null) {
      drawing.attr('transform', pendingTransform)
      // Counter-scale node labels so they stay at constant visual size when zoomed out
      // Cap counter-scale so labels don't grow unboundedly when zoomed far out
      const labelScale = Math.min(1 / pendingK, 4)
      drawing
        .selectAll<SVGGElement, Node>('.node-label-group')
        .attr('transform', d => {
          const { cx, cy } = nodeLabelAnchor(d)
          return `translate(${cx},${cy}) scale(${labelScale})`
        })
      // Hide per-base detail (mismatches, sequence text) when the zoom is too
      // far out for the glyphs to be readable. Only touch the styles when
      // crossing the threshold so we're not writing attrs every frame. This is
      // a property of the current viewport, not of the drawing: svgExport puts
      // the layers back before serializing a figure.
      const shouldHide = pendingK < MISMATCH_HIDE_BELOW_K
      if (shouldHide !== detailHidden) {
        detailHidden = shouldHide
        const display = shouldHide ? 'none' : ''
        drawing
          .select<SVGGElement>('g.mismatches-layer')
          .style('display', display)
        drawing
          .select<SVGGElement>('g.sequence-labels-layer')
          .style('display', display)
        debugLog(
          `detail layers ${shouldHide ? 'hidden' : 'shown'} (zoom k=${pendingK.toFixed(2)}, threshold=${MISMATCH_HIDE_BELOW_K})`,
        )
      }
      pendingTransform = null
    }
  }
  // Track whether the current gesture has actually moved. We only want to
  // disable hit-testing on the content for real pans/zooms — a plain click
  // fires 'start' + 'end' with no 'zoom' in between, and if we'd disabled
  // pointer-events on 'start' the resulting `click` event would never reach
  // the node path (mouseup target would differ from mousedown target).
  let gestureMoved = false
  function zoomed(event: d3.D3ZoomEvent<Element, unknown>): void {
    const { x, y, k } = event.transform
    debugLog(
      `[zoom] zoomed k=${k.toFixed(3)} tx=${x.toFixed(1)} ty=${y.toFixed(1)}`,
    )
    pendingTransform = String(event.transform)
    pendingK = k
    if (!gestureMoved) {
      gestureMoved = true
      // Disable hit-testing on the transformed content for the rest of this
      // gesture. With ~600k SVG children, per-event hit-testing is what makes
      // pan/zoom feel sticky; the outer SVG still receives pointer events
      // (it's the zoom target), so the gesture itself keeps working.
      drawing.style('pointer-events', 'none')
    }
    rafHandle ??= requestAnimationFrame(flushTransform)
  }

  zoom = d3.zoom()
  zoom.on('start', () => {
    gestureMoved = false
  })
  zoom.on('zoom', zoomed)
  zoom.on('end', () => {
    // Make sure the final transform is applied before re-enabling hit-testing,
    // otherwise a tooltip can fire against stale geometry.
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle)
      flushTransform()
    }
    if (gestureMoved) {
      drawing.style('pointer-events', null)
    }
  })

  function configureZoomBounds(): void {
    if (!parentElement) return
    // Configure panning and zooming, given the SVG parent's size on the page.

    root.attr('height', parentElement.clientHeight)
    root.attr('width', parentElement.clientWidth)

    const minScaleFactor = minZoom()
    debugLog('[zoom] configureZoomBounds:', {
      viewport: { w: parentElement.clientWidth, h: parentElement.clientHeight },
      content: {
        x: [imageBounds.minX, imageBounds.maxX],
        y: [imageBounds.minY, imageBounds.maxY],
      },
      minScaleFactor,
    })

    // We need to set an extent here because auto-determination of the region
    // to zoom breaks on the React testing jsdom.
    //
    // Use the actual content bounds as the translate extent. When content fits
    // within the viewport at the current zoom level, d3 centers it; when it
    // overflows, panning is bounded to the real content region. Previous code
    // inflated the boundaries to clientWidth/minScaleFactor, which created
    // phantom pannable space beyond the actual content — the user could pan
    // into empty space and lose track of the visualization.
    zoom
      .extent([
        [0, 0],
        [parentElement.clientWidth, parentElement.clientHeight],
      ])
      .scaleExtent([minScaleFactor, MAX_ZOOM])
      .translateExtent([
        [imageBounds.minX, imageBounds.minY - RAIL_SPACE],
        [
          imageBounds.maxX,
          Math.max(
            imageBounds.maxY,
            parentElement.clientHeight / minScaleFactor,
          ),
        ],
      ])
  }

  // Initially configure panning and zooming
  configureZoomBounds()
  root.call(zoom).on('dblclick.zoom', null)
  zoomRoot = root
  // @ts-expect-error — d3 Selection<SVGGElement> is not structurally assignable to Selection<Element> due to callback this-type invariance, but works at runtime.
  svg = drawing

  // createTubeMap already released the previous draw's bindings, so attaching
  // fresh ones here cannot stack up.
  const wheelHandler = (e: WheelEvent): void => {
    e.preventDefault()
  }
  parentElement.addEventListener('wheel', wheelHandler)
  // jsdom, under the tests and the CLI, has no ResizeObserver
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          configureZoomBounds()
        })
      : null
  resizeObserver?.observe(parentElement)
  cleanupParentBindings = () => {
    parentElement.removeEventListener('wheel', wheelHandler)
    resizeObserver?.disconnect()
  }

  // On the first draw, fit vertically and centre horizontally. On subsequent
  // draws (e.g. visOptions changes, or any parent re-render that gives us a
  // new prop reference) preserve the user's existing pan/zoom — recreating
  // the tube map should not silently reset the viewport.
  //
  // Fit-to-height matters for layouts that pile up vertically (e.g. a tiny
  // graph with thousands of stacked reads): at scale=1 the visible 1200×800
  // window would sit far above the content and the user would see a blank
  // canvas. We deliberately *don't* fit horizontally — horizontal panning is
  // the natural way to explore a tube map, so we'd rather render at natural
  // scale and let the user pan than shrink everything to unreadable widths.
  //
  // The fit puts the content where the zoom's translate extent would, the top
  // of the ruler's rail at the top of the viewport, so neither the first redraw
  // nor the first wheel event nudges it.
  const totalHeight = imageBounds.maxY - imageBounds.minY + RAIL_SPACE
  const initialScale = Math.min(
    1,
    totalHeight > 0 ? parentElement.clientHeight / totalHeight : 1,
  )
  const scaledWidth = (imageBounds.maxX - imageBounds.minX) * initialScale
  const leftMargin = Math.max(0, (parentElement.clientWidth - scaledWidth) / 2)
  const initialTransform =
    preserveViewport && previousTransform !== undefined
      ? previousTransform
      : d3.zoomIdentity
          .translate(
            leftMargin - imageBounds.minX * initialScale,
            (RAIL_SPACE - imageBounds.minY) * initialScale,
          )
          .scale(initialScale)
  return () => {
    zoom.transform(root, initialTransform)
    // zoom.transform skips the extents, which a kept viewport falls outside
    // when the layout shrinks under it
    zoom.scaleBy(root, 1)
  }
}

// Zooms about the viewport centre, within the zoom's scale and translate extents
export function zoomBy(zoomFactor: number): void {
  if (zoomRoot) {
    zoom.scaleBy(zoomRoot.transition().duration(750), zoomFactor)
  }
}

// The scheme for a track's source file: whatever the UI last set, else the
// type-appropriate default. Computed rather than cached into config.colorSchemes
// so coloring stays a pure read of config.
function colorSchemeFor(track: ColorableTrack): ColorScheme {
  return (
    config.colorSchemes[track.sourceTrackID] ??
    defaultTrackColors(track.type ?? 'haplotype')
  )
}

function datumOf(track: ColorableTrack): DrawnTrack {
  return drawnTrack(track, inputTracks[0]?.id, config.readGroups)
}

function paintOf(
  track: ColorableTrack,
  datum: DrawnTrack,
  coloring = currentColoring(),
): Paint {
  const { color, alpha } = encodingFor(colorSchemeFor(track), coloring)[
    datum.mark
  ]
  return {
    color: color.map(datum),
    ...(alpha === undefined ? {} : { alpha: alpha.map(datum) }),
  }
}

const colorOf = (shape: { id: number }) => paints.get(shape.id)!.color
const alphaOf = (shape: { id: number }) => paints.get(shape.id)!.alpha ?? 1

// to avoid problems with wrong overlapping of tracks, draw them in order of their color
function drawReversalsByColor(
  corners: TrackCorner[],
  rectangles: TrackRectangle[],
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  // One pass to bucket by colour rather than a full scan of both lists per
  // colour. Colours are visited in first-appearance order, as before.
  const rectsByColor = groupBy(
    rectangles.filter(rect => rect.type === type),
    colorOf,
  )
  const cornersByColor = groupBy(
    corners.filter(corner => corner.type === type),
    colorOf,
  )
  for (const [color, colorRectangles] of rectsByColor) {
    appendTrackRectangles(colorRectangles, groupTrack)
    appendTrackCorners(cornersByColor.get(color) ?? [], groupTrack)
  }
}

// draws nodes by building svg-path for border and filling it with transparent white

function drawNodes(dNodes: Node[], groupNode: SvgGroupSelection): void {
  dNodes.forEach(node => {
    node.d = nodeOutlinePath(node)
  })

  groupNode
    .selectAll('node')
    .data(dNodes)
    .enter()
    .append('path')
    .attr('id', d => d.name)
    .attr('d', d => d.d ?? null)
    .on('mouseover', nodeMouseOver)
    .on('mouseout', nodeMouseOut)
    .on('click', nodeSingleClick)
    .on('contextmenu', nodeRightClick)
    .style('fill', d => colorNodes(d.name).fill ?? null)
    .style('fill-opacity', d => colorNodes(d.name)['fill-opacity'] ?? null)
    .style('stroke', d => colorNodes(d.name).outline ?? null)
    .style('stroke-width', '2px')
}

// Given a node name, return an object with "fill", "fill-opacity", and "outline"
// keys describing what colors should be used to draw it.
function colorNodes(nodeName: string): Record<string, string> {
  const nodesColors: Record<string, string> = {}
  if (config.coloredNodes.includes(nodeName)) {
    nodesColors.fill = '#ffc0cb'
    nodesColors.outline = '#ff0000'
  } else {
    nodesColors.fill = '#ffffff'
    nodesColors.outline = '#000000'
  }
  nodesColors['fill-opacity'] = '0.4'
  if (config.transparentNodesFlag) {
    nodesColors.fill = 'none'
  }
  return nodesColors
}

// Get any node object by name, or undefined if the graph has no such node.
function getNodeByName(nodeName: string): LayoutNode | undefined {
  const index = nodeMap.get(nodeName)
  return index === undefined ? undefined : nodes[index]
}

function nodeSingleClick(this: SVGElement): void {
  // Get the node name
  const nodeName = d3.select(this).attr('id')
  const currentNode = getNodeByName(nodeName)
  if (currentNode === undefined) {
    console.error('Missing node: ', nodeName)
    return
  }
  const nodeAttributes: InfoAttribute[] = [
    ['Node ID:', currentNode.name + (currentNode.switched ? '(reversed)' : '')],
    ['Node Length:', currentNode.sequenceLength + ' bases'],
    ['Haplotypes:', currentNode.degree],
  ]
  // In a coarsened view the reads a node holds are bands, and a band counts
  // an edge's crossings, which miss reads that stay inside the node
  if (coarsened === undefined) {
    nodeAttributes.push(
      [
        'Aligned Reads:',
        currentNode.incomingReads.length +
          currentNode.internalReads.length +
          currentNode.outgoingReads.length,
      ],
      ['Total Visits:', numReadsVisitNode(currentNode)],
      ['Coverage:', coverage(currentNode, reads)],
    )
  }

  config.showInfoCallback(nodeAttributes)
}

// Count the number of distinct reads that visit the given node object.
export interface NodeReadAttachments {
  incomingReads: [number, number][]
  outgoingReads: [number, number][]
  internalReads: number[]
}

function numReadsVisitNode(node: NodeReadAttachments): number {
  const countReads = new Set<number>()
  // incoming reads are reads that enter the node but don't start within it. They are represented as
  // an array of subarrays which have 2 elements: an index indicating the read index and read path's index.
  // The first node will not have any incoming reads.
  for (const readVisit of node.incomingReads) {
    countReads.add(readVisit[0])
  }
  // internal reads are reads that start and end within the node. They are represented as
  // an array of values which indicate the read index.
  for (const read of node.internalReads) {
    countReads.add(read)
  }
  // outgoing reads are reads that exit the node when the read starts within it. They are represented as
  // an array of subarrays which have 2 elements: an index indicating the read index and read path's index.
  // The last node will not have any outgoing reads.
  for (const readVisit of node.outgoingReads) {
    countReads.add(readVisit[0])
  }
  return countReads.size
}

export interface ReadCoverageInfo {
  sequenceNew?: { mismatches: Mismatch[] }[]
  firstNodeOffset?: number
  finalNodeCoverLength?: number
}

export interface NodeCoverageInfo extends NodeReadAttachments {
  sequenceLength: number
}

function subtractDeletions(read: ReadCoverageInfo | undefined): number {
  let delta = 0
  if (read?.sequenceNew) {
    for (const entry of read.sequenceNew) {
      for (const mm of entry.mismatches) {
        if (mm.type === 'deletion' && mm.length !== undefined) {
          delta -= mm.length
        }
      }
    }
  }
  return delta
}

// computes average number of reads passing through each base in the node
export function coverage(
  node: NodeCoverageInfo,
  allReads: ReadCoverageInfo[],
): number {
  if (node.sequenceLength === 0) {
    return 0.0
  }
  let countBases = 0
  for (const readVisit of node.incomingReads) {
    const currRead = allReads[readVisit[0]]
    const readPathIndex = readVisit[1]
    countBases += subtractDeletions(currRead)
    if (currRead?.sequenceNew) {
      const numNodes = currRead.sequenceNew.length
      //  if current node is the last node on the read path, add the finalNodeCoverLength number of bases
      if (
        numNodes === readPathIndex + 1 &&
        currRead.finalNodeCoverLength !== undefined
      ) {
        countBases += currRead.finalNodeCoverLength
        // otherwise add the node's sequence length (width of node in bases)
      } else {
        countBases += node.sequenceLength
      }
    }
  }
  // internal reads
  for (const readVisit of node.internalReads) {
    const currRead = allReads[readVisit]
    countBases += subtractDeletions(currRead)
    if (
      currRead?.finalNodeCoverLength !== undefined &&
      currRead.firstNodeOffset !== undefined
    ) {
      countBases += currRead.finalNodeCoverLength - currRead.firstNodeOffset
    }
  }
  // outgoing reads
  for (const readVisit of node.outgoingReads) {
    const currRead = allReads[readVisit[0]]
    countBases += subtractDeletions(currRead)
    // coverage of outgoing read would be the the distance between the end of the node and the
    //  starting point of the read within the node
    if (currRead?.firstNodeOffset !== undefined) {
      countBases += node.sequenceLength - currRead.firstNodeOffset
    }
  }
  // average coverage is total number of bases traversed by all reads divided by sequence length (width of node in bases)
  return Math.round((countBases / node.sequenceLength) * 100) / 100
}

// draw sequence labels for nodes
function drawLabels(dNodes: Node[]): void {
  if (config.nodeWidthOption === 'normal') {
    // Wrap in a layer so the zoom flush can hide the per-base sequence text
    // (and only it, not other top-level <text> elements) when zoomed out.
    svg
      .append('g')
      .attr('class', 'sequence-labels-layer')
      .selectAll('text')
      .data(dNodes)
      .enter()
      .append('text')
      .attr('x', d => d.x - 4)
      .attr('y', d => d.y + 4)
      .text(d => d.seq)
      .attr('font-family', fonts)
      .attr('font-size', '14px')
      .attr('fill', 'black')
      .style('pointer-events', 'none')
  }
}

const NODE_LABEL_FONT_SIZE = 12
const NODE_LABEL_PADDING = 3
const NODE_LABEL_Y_OFFSET = 14

// Shared anchor for a node's label: horizontally centred over the node, with
// a fixed gap above it. Used by drawNodeLabels (initial placement) and by the
// zoom flush (re-applied with a counter-scale on every transform).
function nodeLabelAnchor(d: Node): { cx: number; cy: number } {
  return { cx: d.x + d.pixelWidth / 2, cy: d.y - NODE_LABEL_Y_OFFSET }
}

// Where the label text lands, so its highlight rect can be sized to it. jsdom
// has no layout engine and so no getBBox, and the headless renderer draws node
// labels like any other client, so fall back to the same monospace assumption
// generateNodeWidth's 8.401 makes: 0.6em per character, on an alphabetic
// baseline at y=0 with the text centred on x=0.
function labelTextBox(
  textEl: SVGTextElement,
  label: string,
): { x: number; y: number; width: number; height: number } {
  const width = label.length * NODE_LABEL_FONT_SIZE * 0.6
  return typeof textEl.getBBox === 'function'
    ? textEl.getBBox()
    : {
        x: -width / 2,
        y: -NODE_LABEL_FONT_SIZE * 0.8,
        width,
        height: NODE_LABEL_FONT_SIZE,
      }
}

function drawNodeLabels(dNodes: Node[]): void {
  const groups = svg
    .append('g')
    .attr('class', 'node-labels')
    .selectAll('g')
    .data(dNodes)
    .enter()
    .append('g')
    .attr('class', 'node-label-group')
    // Positioned at the label anchor; zoom handler applies counter-scale here
    .attr('transform', d => {
      const { cx, cy } = nodeLabelAnchor(d)
      return `translate(${cx},${cy})`
    })
    .style('pointer-events', 'none')

  // Append rect first (sized after text is in DOM via getBBox)
  groups.append('rect').attr('fill', '#FFE500').attr('rx', 2)

  groups
    .append('text')
    .text(d => d.name)
    .attr('x', 0)
    .attr('y', 0)
    .attr('text-anchor', 'middle')
    .attr('font-family', fonts)
    .attr('font-size', `${NODE_LABEL_FONT_SIZE}px`)
    .attr('font-weight', 'bold')
    .attr('fill', 'black')

  // Size each rect to its text's actual bounding box
  groups.each(function (d) {
    const textEl = d3.select(this).select<SVGTextElement>('text').node()
    if (!textEl) return
    const { x, y, width, height } = labelTextBox(textEl, d.name)
    d3.select(this)
      .select('rect')
      .attr('x', x - NODE_LABEL_PADDING)
      .attr('y', y - NODE_LABEL_PADDING)
      .attr('width', width + NODE_LABEL_PADDING * 2)
      .attr('height', height + NODE_LABEL_PADDING * 2)
  })
}

// If nodes are spaced closely together (based on the threshold value) then those nodes would be grouped together
//  in a larger interval. If the nodes are spaced further apart (based on the threshold) then those nodes would form a
//  separate interval. If the distance between the nodes is equal to the threshold, then the nodes would be grouped together
//  in a larger interval
export type Interval = readonly [number, number]

export function axisIntervals(
  nodePixelCoordinates: readonly Interval[],
  threshold: number,
): Interval[] {
  if (nodePixelCoordinates.length === 0) {
    return []
  } else if (nodePixelCoordinates.length === 1) {
    return nodePixelCoordinates.map(p => [p[0], p[1]])
  } else {
    // Sort ascending by first element of each subarray.
    const sorted = nodePixelCoordinates.slice().sort((a, b) => a[0] - b[0])
    // https://keithwilliams-91944.medium.com/merge-intervals-solution-in-javascript-daa61b618ed4
    const first = sorted[0]
    const mergedIntervals: [number, number][] =
      first === undefined ? [] : [[first[0], first[1]]]
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]
      const last = mergedIntervals[mergedIntervals.length - 1]
      if (curr !== undefined && last !== undefined) {
        // compute the distance between the current interval and the current coordinate pair's starting x-value, and compare it to a threshold. If it's less than the threshold, merge the intervals.
        if (curr[0] - last[1] <= threshold) {
          // update ending position to the maximum of current end value and end of current interval - can be thought of as extending the interval
          last[1] = Math.max(last[1], curr[1])
        } else {
          // new interval
          mergedIntervals.push([curr[0], curr[1]])
        }
      }
    }
    return mergedIntervals
  }
}

function drawRuler(): void {
  const rulerTrack = tracks.find(track => track.name === trackForRuler)!

  // How often should we have a tick in bp?
  let markingInterval = 100
  if (config.nodeWidthOption === 'normal') markingInterval = 20
  // How close may markings be in image space?
  const markingClearance = 80

  // We need to call drawRulerMarking(base pair number, layout X coordinate)
  // for each tick mark we want in our legend. But we can't just walk the path
  // and X at the same time, placing ticks periodically because the ruler path
  // isn't nexessarily used for the layout backbone, and can go all over the
  // place, including backward through nodes.

  // So we walk along the path, place ticks, and then drop the ones that are
  // too close together.

  // This will hold pairs of base position, x coordinate.
  let ticks: [number, number][] = []
  const ticks_region: [number, number][] = []

  // We keep a cursor to the start of the current node traversal along the path
  let indexOfFirstBaseInNode: number = rulerTrack.indexOfFirstBase ?? 0
  // And the next index along the path that doesn't have a mark but could.
  let nextUnmarkedIndex: number = indexOfFirstBaseInNode

  function getCorrectXCoordinateOfBaseWithinNode(
    position: number,
    currentNode: Node,
    currentNodeIsReverse: boolean,
    is_region = false,
  ) {
    // What base along our traversal of this node should we be marking?
    const indexIntoVisitToMark = position - indexOfFirstBaseInNode

    const nodeSeqLen = currentNode.sequenceLength
    // What offset into the node should we mark at, relative to its forward-strand start?
    let offsetIntoNodeForward = currentNodeIsReverse
      ? // If going in reverse, take off bases of the node we use from the right side
        nodeSeqLen - 1 - indexIntoVisitToMark
      : // Otherwise, add them to the left side
        indexIntoVisitToMark

    if (config.nodeWidthOption !== 'normal' && !is_region) {
      // Actually always mark at an edge of the node, if we are scaling the node nonlinearly
      // and if we are not highlighting the input region
      offsetIntoNodeForward = currentNodeIsReverse ? nodeSeqLen - 1 : 0
    }

    // Where should we mark in the visualization?
    return clampedXCoordinateOfBaseWithinNode(
      currentNode,
      offsetIntoNodeForward,
    )
  }

  // Get the region in bp in the scale bar's coordinate space to highlight as
  // the target region. Will be null if we're using node IDs.
  const start_region = inputRegion[0] !== null ? Number(inputRegion[0]) : null
  const end_region = inputRegion[1] !== null ? Number(inputRegion[1]) : null

  const intervalsVisitedByNodes: Interval[] = []

  for (let i = 0; i < rulerTrack.indexSequence.length; i++) {
    // Walk along the ruler track in ascending coordinate order. vgExtractTracks
    // already reversed the sequence of a completely-reverse track for layout,
    // so ascending coordinates run back to front through it.
    const stepIndex = rulerTrack.isCompletelyReverse
      ? rulerTrack.indexSequence.length - 1 - i
      : i
    const nodeIndex = rulerTrack.indexSequence[stepIndex]!
    const currentNode = nodes[Math.abs(nodeIndex)]!

    // Adding node X start and end positions into an array
    intervalsVisitedByNodes.push(nodePixelCoordinatesInX(currentNode))

    // Each node may actually have the track's coordinates go through it
    // backward. In fact, the whole track may be laid out backward.
    // So xor the reverse flags, which we assume to be bools
    const currentNodeIsReverse =
      isReverse(rulerTrack.sequence[stepIndex]!) !==
      rulerTrack.isCompletelyReverse

    // For some displayus we want to mark each node only once.
    let alreadyMarkedNode = false

    const nodeSeqLen = currentNode.sequenceLength
    if (
      start_region !== null &&
      start_region >= indexOfFirstBaseInNode &&
      start_region < indexOfFirstBaseInNode + nodeSeqLen
    ) {
      // add start "region" tick
      const xCoordStart = getCorrectXCoordinateOfBaseWithinNode(
        start_region,
        currentNode,
        currentNodeIsReverse,
        true,
      )
      ticks_region.push([start_region, xCoordStart])
    }
    if (
      end_region !== null &&
      end_region >= indexOfFirstBaseInNode &&
      end_region < indexOfFirstBaseInNode + nodeSeqLen
    ) {
      // add end "region" tick
      const xCoordEnd = getCorrectXCoordinateOfBaseWithinNode(
        end_region,
        currentNode,
        currentNodeIsReverse,
        true,
      )
      ticks_region.push([end_region, xCoordEnd])
    }

    while (nextUnmarkedIndex < indexOfFirstBaseInNode + nodeSeqLen) {
      // We are thinking of marking a position on this node.

      // Where should we mark in the visualization?
      const xCoordOfMarking = getCorrectXCoordinateOfBaseWithinNode(
        nextUnmarkedIndex,
        currentNode,
        currentNodeIsReverse,
      )

      if (config.nodeWidthOption === 'normal' || !alreadyMarkedNode) {
        // This is a mark we are not filtering due to node compression.
        // Make the mark
        ticks.push([nextUnmarkedIndex, xCoordOfMarking])
        alreadyMarkedNode = true
      }

      // Think about the next place along the path we care about.
      nextUnmarkedIndex += markingInterval
    }
    // Advance to the next node
    indexOfFirstBaseInNode += nodeSeqLen
  }

  // merge intervals
  const mergedIntervals = axisIntervals(
    intervalsVisitedByNodes,
    config.nodeIntervalThreshold,
  )

  // Sort ticks on X coordinate
  ticks.sort(([, x1], [, x2]) => x1 - x2)

  // Filter ticks for a minimum X separation
  const separatedTicks: [number, number][] = []
  ticks.forEach(tick => {
    if (
      separatedTicks.length === 0 ||
      tick[1] - separatedTicks[separatedTicks.length - 1]![1] >=
        markingClearance
    ) {
      // Take only the first tick or ticks far enough from the previous tick taken.
      separatedTicks.push(tick)
    }
  })
  ticks = separatedTicks

  // plot ticks highlighting the region (if it is filled in)
  drawRulerMarkingRegion(ticks_region)

  // draw horizontal line for each interval

  const axisY = imageBounds.minY - 10
  mergedIntervals.forEach(interval => {
    svg
      .append('line')
      .attr('x1', interval[0])
      .attr('y1', axisY)
      .attr('x2', interval[1])
      .attr('y2', axisY)
      .attr('stroke-width', 1)
      .attr('stroke', 'black')

    // starting vertical line
    svg
      .append('line')
      .attr('x1', interval[0])
      .attr('y1', axisY - 5)
      .attr('x2', interval[0])
      .attr('y2', axisY + 5)
      .attr('stroke-width', 1)
      .attr('stroke', 'black')

    // ending vertical line
    svg
      .append('line')
      .attr('x1', interval[1])
      .attr('y1', axisY - 5)
      .attr('x2', interval[1])
      .attr('y2', axisY + 5)
      .attr('stroke-width', 1)
      .attr('stroke', 'black')
  })

  // Plot all the ticks
  for (let i = 0; i < ticks.length; i++) {
    const tick = ticks[i]!
    // Figure out how to align the tick text, to keep the outermost labels inside
    // the visible area
    let align
    if (i === 0) {
      align = 'start'
    } else if (i === ticks.length - 1) {
      align = 'end'
    } else {
      align = 'middle'
    }
    drawRulerMarking(tick[0], tick[1], align)
  }
}

/// Draw an axis tick for the given sequence position (in bp) at the given pixel X
/// coordinate. The text label can be aligned to the tick mark by its "start", "end",
/// or "middle".
function drawRulerMarking(
  sequencePosition: number,
  xCoordinate: number,
  align: string,
): void {
  const axisY = imageBounds.minY - 10
  svg
    .append('text')
    .attr('text-anchor', align)
    .attr('x', xCoordinate)
    .attr('y', imageBounds.minY - 18)
    .text(`${sequencePosition}`)
    .attr('font-family', fonts)
    .attr('font-size', '12px')
    .attr('fill', 'black')
    .style('pointer-events', 'none')

  // vertical line
  svg
    .append('line')
    .attr('x1', xCoordinate)
    .attr('y1', axisY - 5)
    .attr('x2', xCoordinate)
    .attr('y2', axisY + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
}

/// Draw ruler markings for the given requested region.
///
/// The requested region should be an array of 2 items, each of which is an
/// array of a sequence position and an image X coordinate. If the array is not
/// 2 items, no connecting line is drawn.
function drawRulerMarkingRegion(ticks_region: [number, number][]): void {
  // Each tick is a base coordinate and an image coordinate
  ticks_region.forEach(tick => {
    drawRulerMarkingEndpoint(tick[1])
  })

  const lineY = imageBounds.minY - NODE_MARGIN - 6

  if (ticks_region.length === 2) {
    svg
      .append('line')
      .attr('x1', ticks_region[0]![1])
      .attr('y1', lineY)
      .attr('x2', ticks_region[1]![1])
      .attr('y2', lineY)
      .attr('stroke-width', 4)
      .attr('stroke', '#FFFE3A')
  }
}

function drawRulerMarkingEndpoint(xCoordinate: number): void {
  const pointX = xCoordinate
  const pointY = imageBounds.minY - NODE_MARGIN - 1
  const arrowWidth = 8
  const arrowHeight = 10

  svg
    .append('path')
    .attr(
      'd',
      `M${pointX - arrowWidth} ${pointY - arrowHeight}` +
        ` L${pointX} ${pointY}` +
        ` L${pointX + arrowWidth} ${pointY - arrowHeight}`,
    )
    .attr('stroke-width', 0)
    .attr('fill', '#FFFE3A')
    .attr('stroke', 'none')
    .style('pointer-events', 'none')
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const buckets = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = buckets.get(k)
    if (bucket === undefined) {
      buckets.set(k, [item])
    } else {
      bucket.push(item)
    }
  }
  return buckets
}

// Stacked coarsened bands of near-equal share are near-equal colors, so each
// is drawn a little thinner than its lane, leaving a gap of page between
// neighbours along their length but not across their ends
const BAND_GAP = 1

function insetBandRectangle(rect: TrackRectangle): TrackRectangle {
  return isCoarsenedId(rect.id)
    ? {
        ...rect,
        yStart: rect.yStart + BAND_GAP / 2,
        yEnd: rect.yEnd - BAND_GAP / 2,
      }
    : rect
}

function insetBandCurve(curve: TrackCurve): TrackCurve {
  return isCoarsenedId(curve.id)
    ? {
        ...curve,
        yStart: curve.yStart + BAND_GAP / 2,
        yEnd: curve.yEnd + BAND_GAP / 2,
        width: curve.width - BAND_GAP,
      }
    : curve
}

function drawTrackRectangles(
  rectangles: TrackRectangle[],
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  appendTrackRectangles(
    rectangles.filter(rect => rect.type === type).map(insetBandRectangle),
    groupTrack,
  )
}

function appendTrackRectangles(
  rectangles: TrackRectangle[],
  groupTrack: SvgGroupSelection,
): void {
  groupTrack
    .selectAll('trackRectangles')
    .data(rectangles)
    .enter()
    .append('rect')
    .attr('x', d => d.xStart)
    .attr('y', d => d.yStart)
    .attr('width', d => d.xEnd - d.xStart + 1)
    .attr('height', d => d.yEnd - d.yStart + 1)
    .style('fill', colorOf)
    .style('fill-opacity', alphaOf)
    .attr('trackID', d => d.id)
    .attr('trackName', d => d.name ?? null)
    .attr('class', d => `track${d.id}`)
    .attr('color', colorOf)
    .on('mouseover', trackMouseOver)
    .on('mousemove', trackMouseMove)
    .on('mouseout', trackMouseOut)
    .on('dblclick', trackDoubleClick)
    .on('click', trackSingleClick)
    .on('contextmenu', trackRightClick)
}

// The diagonal cross-hatch a hovered track is filled with: a white tile with
// four small grey squares, rotated 45°
function defineHoverPattern(): void {
  const tile = 7
  const dot = 3
  const gap = 4
  const pattern = svg.append('defs').append('pattern').call(applyAttrs, {
    id: 'patternA',
    width: tile,
    height: tile,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern.append('rect').call(applyAttrs, {
    x: 0,
    y: 0,
    width: tile,
    height: tile,
    fill: '#FFFFFF',
  })
  for (const y of [0, gap]) {
    for (const x of [0, gap]) {
      pattern
        .append('rect')
        .call(applyAttrs, { x, y, width: dot, height: dot, fill: '#505050' })
    }
  }
}

function drawTrackCurves(
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  const flattenedGroups = curvePaths(shapes.curves.map(insetBandCurve), type)

  groupTrack
    .selectAll('trackCurves')
    .data(flattenedGroups)
    .enter()
    .append('path')
    .attr('d', d => d.path ?? null)
    .style('fill', colorOf)
    .style('fill-opacity', alphaOf)
    .attr('trackID', d => d.id)
    .attr('trackName', d => d.name ?? null)
    .attr('class', d => `track${d.id}`)
    .attr('color', colorOf)
    .on('mouseover', trackMouseOver)
    .on('mousemove', trackMouseMove)
    .on('mouseout', trackMouseOut)
    .on('dblclick', trackDoubleClick)
    .on('click', trackSingleClick)
    .on('contextmenu', trackRightClick)
}

function appendTrackCorners(
  corners: TrackCorner[],
  groupTrack: SvgGroupSelection,
): void {
  groupTrack
    .selectAll('trackCorners')
    .data(corners)
    .enter()
    .append('path')
    .attr('d', d => d.path)
    .style('fill', colorOf)
    .style('fill-opacity', alphaOf)
    .attr('trackID', d => d.id)
    .attr('trackName', d => d.name ?? null)
    .attr('class', d => `track${d.id}`)
    .attr('color', colorOf)
    .on('mouseover', trackMouseOver)
    .on('mousemove', trackMouseMove)
    .on('mouseout', trackMouseOut)
    .on('dblclick', trackDoubleClick)
    .on('click', trackSingleClick)
    .on('contextmenu', trackRightClick)
}

// Get any track object by ID.
// Because of reordering of input tracks, the ID doesn't always match the index.
function getTrackByID(trackID: number): Track | undefined {
  return tracks.find(t => t.id === trackID)
}

// Singleton hover tooltip. Attached lazily on first use; appended to <body>
// so it isn't clipped by the SVG viewport and inherits no inherited styles
// from the d3 nodes we're hovering.
let hoverTooltip: HTMLDivElement | undefined
function ensureHoverTooltip(): HTMLDivElement {
  if (hoverTooltip) return hoverTooltip
  const el = document.createElement('div')
  el.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:9999',
    'background:rgba(30,30,30,0.92)',
    'color:#fff',
    'font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    'padding:4px 8px',
    'border-radius:4px',
    'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
    'max-width:320px',
    'overflow-wrap:anywhere',
    'display:none',
  ].join(';')
  document.body.appendChild(el)
  hoverTooltip = el
  return el
}

function trackTooltipText(trackID: number): string {
  const t = getTrackByID(trackID)
  if (!t) return String(trackID)
  const display = formatTrackDisplayName(t.name, t.freq)
  const kind = t.type === 'read' ? 'read' : 'haplotype'
  return `${display} (${kind})`
}

function positionHoverTooltip(event: MouseEvent): void {
  const el = ensureHoverTooltip()
  // Anchor below-right of cursor; flip if it would clip the viewport edge.
  const pad = 12
  const { innerWidth, innerHeight } = window
  const rect = el.getBoundingClientRect()
  const x =
    event.clientX + pad + rect.width > innerWidth
      ? event.clientX - pad - rect.width
      : event.clientX + pad
  const y =
    event.clientY + pad + rect.height > innerHeight
      ? event.clientY - pad - rect.height
      : event.clientY + pad
  el.style.left = `${Math.max(0, x)}px`
  el.style.top = `${Math.max(0, y)}px`
}

// The elements making up the track currently under the cursor, remembered so
// mouseout can restore them without re-running the class selector over an SVG
// that may hold hundreds of thousands of elements.
let highlightedTrack: d3.Selection<
  d3.BaseType,
  unknown,
  HTMLElement,
  unknown
> | null = null

function clearTrackHighlight(): void {
  highlightedTrack?.each(function restoreFill() {
    const element = d3.select(this)
    element.style('fill', element.attr('color'))
  })
  highlightedTrack = null
}

// Highlight track on mouseover and show the hover tooltip.
function trackMouseOver(this: SVGElement, event: MouseEvent): void {
  const trackID = d3.select(this).attr('trackID')
  // TODO: We want to also .raise() here, but it makes Firefox 124.0.2 on Mac
  // lose the mouseout and immediately trigger another mouseover, if the mouse
  // is over a curved section of a read.
  // Clearing first also covers the Firefox case where mouseout never arrives.
  clearTrackHighlight()
  highlightedTrack = d3.selectAll(`.track${trackID}`)
  highlightedTrack.style('fill', 'url(#patternA)')

  const el = ensureHoverTooltip()
  const id = Number(trackID)
  if (isCoarsenedId(id)) {
    const meta = coarsenedEdgeMeta.get(id)
    el.textContent = meta?.label ?? ''
  } else {
    el.textContent = trackTooltipText(id)
  }
  el.style.display = 'block'
  positionHoverTooltip(event)
}

function trackMouseMove(event: MouseEvent): void {
  if (hoverTooltip?.style.display === 'block') positionHoverTooltip(event)
}

// Highlight node on mouseover
function nodeMouseOver(this: SVGElement): void {
  d3.select(this).style('stroke-width', '4px')
}

// Restore original track appearance on mouseout and hide tooltip.
function trackMouseOut(): void {
  clearTrackHighlight()
  if (hoverTooltip) hoverTooltip.style.display = 'none'
}

// Restore original node appearance on mouseout
function nodeMouseOut(this: SVGElement): void {
  d3.select(this).style('stroke-width', '2px')
}

// Move clicked track to first position
function trackDoubleClick(this: SVGElement): void {
  const trackID = Number(d3.select(this).attr('trackID'))
  const index = inputTracks.findIndex(track => track.id === trackID)
  // Reads and bands aren't input tracks
  if (index === -1) return
  debugLog(`moving index: ${index}`)
  moveTrackToFirstPosition(index)
  relayout()
}

// The nodes a path visits, as >1>2<3>4 with < for a reverse visit
function getPathInfo(sequence: readonly string[]): string {
  return sequence
    .map(node => (isReverse(node) ? `<${forward(node)}` : `>${node}`))
    .join('')
}

function trackSingleClick(this: SVGElement): void {
  // Get the track ID as a number
  const trackID = Number(d3.select(this).attr('trackID'))
  if (isCoarsenedId(trackID)) {
    // Coarsened band: the hover tooltip already shows the count + endpoints;
    // skip the info dialog so a heavy edge doesn't overload on click.
    return
  }
  const current_track = getTrackByID(trackID)
  if (current_track === undefined) {
    console.error('Missing track: ', trackID)
    return
  }
  const track_attributes: InfoAttribute[] = [['Name', current_track.name]]
  if (current_track.type === 'read') {
    track_attributes.push(['Sample Name', current_track.sample_name])
    track_attributes.push([
      'Primary Alignment?',
      current_track.is_secondary ? 'Secondary' : 'Primary',
    ])
    track_attributes.push(['Read Group', current_track.read_group])
    track_attributes.push(['Score', current_track.score])
    track_attributes.push(['CIGAR string', current_track.cigar_string])
    track_attributes.push(['Mapping Quality', current_track.mapping_quality])
    // The layout may have flipped nodes, and the whole read, to draw it
    const inputRead = inputReads.find(read => read.id === trackID)
    track_attributes.push([
      'Path Info',
      getPathInfo((inputRead ?? current_track).sequence),
    ])
  }
  config.showInfoCallback(track_attributes)
}

// Right-click on a read fires the context-menu callback with its name and the
// click coordinates, so the React layer can render a menu. A coarsened band is
// drawn as a read but names an edge.
function trackRightClick(this: SVGElement, event: MouseEvent): void {
  const trackID = Number(d3.select(this).attr('trackID'))
  const current_track = isCoarsenedId(trackID)
    ? undefined
    : getTrackByID(trackID)
  if (current_track?.type === 'read') {
    event.preventDefault()
    config.readContextMenuCallback({
      readName: current_track.name ?? '',
      x: event.clientX,
      y: event.clientY,
    })
  }
}

// Right-click on a node. Fires the node context-menu callback with the list of
// read names (from the unfiltered input) that pass through the node.
function nodeRightClick(this: SVGElement, event: MouseEvent): void {
  const nodeName = d3.select(this).attr('id')
  event.preventDefault()
  config.nodeContextMenuCallback({
    nodeName,
    readNames: getReadNamesThroughNodes([nodeName], 'any'),
    x: event.clientX,
    y: event.clientY,
  })
}

// extract info about nodes from vg-json
export interface ExtractedVgNode {
  name: string
  sequenceLength: number
  seq: string
}

export function vgExtractNodes(
  vg: VgJson,
  nameMap: Record<string, string> = {},
): ExtractedVgNode[] {
  const result: ExtractedVgNode[] = []
  vg.node.forEach(node => {
    const id = `${node.id}`
    result.push({
      name: nameMap[id] ?? id,
      sequenceLength: node.sequenceLength ?? node.sequence.length,
      seq: node.sequence,
    })
  })
  return result
}

export interface ExtractedVgTrack {
  id: number
  sequence: string[]
  isCompletelyReverse: boolean
  freq?: number
  sourceTrackID: number
  name?: string
  indexOfFirstBase?: number
}

// extract track info from vg-json
export function vgExtractTracks(
  vg: VgJson,
  pathSourceTrackId: number,
  haplotypeSourceTrackID: number,
): ExtractedVgTrack[] {
  const result: ExtractedVgTrack[] = []
  vg.path.forEach((path, index) => {
    const sequence: string[] = []
    let isCompletelyReverse = true
    for (const pos of path.mapping) {
      if (pos.position!.is_reverse === true) {
        sequence.push(reverse(`${pos.position!.node_id}`))
      } else {
        sequence.push(`${pos.position!.node_id}`)
        isCompletelyReverse = false
      }
    }
    if (isCompletelyReverse) {
      // Give the sequence in a reverse order for layout
      sequence.reverse()
      sequence.forEach((node, index2) => {
        sequence[index2] = forward(node)
      })
    }
    const track: ExtractedVgTrack = {
      id: index,
      sequence,
      isCompletelyReverse,
      // But haplotypes will have names starting with "thread_".
      sourceTrackID: path.name?.startsWith('thread_')
        ? haplotypeSourceTrackID
        : pathSourceTrackId,
    }
    // Even non-haplotype paths will be assigned a "freq" field by vg. See
    // <https://github.com/vgteam/vg/blob/6b34cd50e851eb9a91be3a605e040c9be1d4b78e/src/haplotype_extracter.cpp#L52-L55>.
    // We want to copy those through so that non-haplotype paths have a normal width.
    // Only set freq if path.freq is defined; otherwise calculateTrackWidth uses default width.
    if (path.freq !== undefined) {
      track.freq = path.freq
    }
    if (path.name !== undefined) {
      track.name = path.name
    }
    if (path.indexOfFirstBase !== undefined) {
      track.indexOfFirstBase = Number(path.indexOfFirstBase)
    }
    result.push(track)
  })
  return result
}

// converts readPath, a vg Path object expressed as a JS object, to a CIGAR string
type CigarOp = 'M' | 'I' | 'D'
type CigarToken = number | CigarOp

export function cigar_string(readPath: VgPath): string {
  debugLog('readPath mapping:', readPath.mapping)
  let cigar: CigarToken[] = []
  for (const mapping of readPath.mapping) {
    for (const edit of mapping.edit) {
      const from = edit.from_length
      const to = edit.to_length
      // from_length = to_length indicates a match (both may be 0)
      if (from !== undefined && from === to) {
        cigar = append_cigar_operation(from, 'M', cigar)
      } else if (from !== undefined && to !== undefined && from > to) {
        // if from_length > to_length, this indicates a deletion
        const del = from - to
        if (to) {
          cigar = append_cigar_operation(to, 'M', cigar)
        }
        cigar = append_cigar_operation(del, 'D', cigar)
      } else if (from !== undefined && to !== undefined && from < to) {
        // if from_length < to_length, this indicates an insertion
        const ins = to - from
        if (from) {
          cigar = append_cigar_operation(from, 'M', cigar)
        }
        cigar = append_cigar_operation(ins, 'I', cigar)
      } else if (from !== undefined && from !== 0 && to === undefined) {
        // if to_length is undefined, this indicates a deletion
        cigar = append_cigar_operation(from, 'D', cigar)
      } else if (from === undefined && to !== undefined && to !== 0) {
        // if from_length is undefined, this indicates an insertion
        cigar = append_cigar_operation(to, 'I', cigar)
      }
    }
  }
  const cigarString = cigar.join('')
  debugLog('cigar string:', cigarString)
  return cigarString
}

function append_cigar_operation(
  length: number,
  operator: CigarOp,
  cigar: CigarToken[],
): CigarToken[] {
  const last_operation = cigar[cigar.length - 1]
  const last_length = cigar[cigar.length - 2]
  // if duplicate operations, add the two operations and replace the most recent operation with this
  if (last_operation === operator && typeof last_length === 'number') {
    cigar[cigar.length - 2] = last_length + length
  } else {
    cigar.push(length)
    cigar.push(operator)
  }
  return cigar
}

// Pull out reads from a server response into tube map internal format.
// Use myTracks, and idOffset to compute IDs for each read.
// Assign each read the given sourceTrackID.
export interface ExtractedVgRead {
  id: number
  sourceTrackID: number
  sequence: string[]
  sequenceNew: ReadSequenceEntry[]
  type: 'read'
  freq?: number
  name?: string
  firstNodeOffset: number
  finalNodeCoverLength: number
  mapping_quality: number
  is_secondary: boolean
  sample_name: string | null
  read_group: string | null
  cigar_string: string
  score: number
}

export function vgExtractReads(
  myNodes: { name: string }[],
  myTracks: { id: number }[],
  myReads: VgRead[],
  idOffset: number,
  sourceTrackID: number,
): ExtractedVgRead[] {
  debugLog('Reads:', myReads)
  const extracted: ExtractedVgRead[] = []

  const nodeNames = new Set<string>()
  myNodes.forEach(node => {
    nodeNames.add(node.name)
  })

  for (let i = 0; i < myReads.length; i += 1) {
    const read = myReads[i]
    if (read?.path) {
      const sequence: string[] = []
      const sequenceNew: ReadSequenceEntry[] = []
      let firstIndex = -1 // index within mapping of the first node id contained in nodeNames
      let lastIndex = -1 // index within mapping of the last node id contained in nodeNames
      read.path.mapping.forEach((pos, j) => {
        const position = pos.position
        if (position !== undefined) {
          const nodeIdStr = `${position.node_id}`
          if (nodeNames.has(nodeIdStr)) {
            let offset = 0
            const nodeName =
              position.is_reverse === true ? reverse(nodeIdStr) : nodeIdStr
            sequence.push(nodeName)
            if (firstIndex < 0) {
              firstIndex = j
              if (position.offset !== undefined) {
                const parsed =
                  typeof position.offset === 'number'
                    ? position.offset
                    : parseInt(position.offset, 10)
                position.offset = parsed
                offset = parsed
              }
            }
            lastIndex = j

            const mismatches: Mismatch[] = []
            let posWithinNode = offset
            pos.edit.forEach(element => {
              if (
                element.to_length !== undefined &&
                element.from_length === undefined
              ) {
                // insertion
                mismatches.push({
                  type: 'insertion',
                  pos: posWithinNode,
                  seq: element.sequence,
                })
              } else if (
                element.to_length === undefined &&
                element.from_length !== undefined
              ) {
                // deletion
                mismatches.push({
                  type: 'deletion',
                  pos: posWithinNode,
                  length: element.from_length,
                })
              } else if (element.sequence !== undefined) {
                // substitution
                if (element.sequence.length > 1) {
                  debugLog(
                    `found substitution at read ${i}, node ${j} = ${position.node_id}, seq = ${element.sequence}`,
                  )
                }
                mismatches.push({
                  type: 'substitution',
                  pos: posWithinNode,
                  seq: element.sequence,
                })
              }
              if (element.from_length !== undefined) {
                posWithinNode += element.from_length
              }
            })
            sequenceNew.push({ nodeName, mismatches })
          }
        }
      })
      if (sequence.length === 0) {
        debugLog(`read ${i} is empty`)
      } else {
        const firstMapping = read.path.mapping[firstIndex]
        const lastMapping = read.path.mapping[lastIndex]
        // where within node does read start
        const firstNodeOffset =
          firstMapping?.position?.offset !== undefined
            ? Number(firstMapping.position.offset)
            : 0
        // where within node does read end
        let finalNodeCoverLength =
          lastMapping?.position?.offset !== undefined
            ? Number(lastMapping.position.offset)
            : 0
        if (lastMapping !== undefined) {
          lastMapping.edit.forEach(edit => {
            if (edit.from_length !== undefined) {
              finalNodeCoverLength += edit.from_length
            }
          })
        }

        const track: ExtractedVgRead = {
          id: myTracks.length + extracted.length + idOffset,
          sourceTrackID,
          sequence,
          sequenceNew,
          type: 'read',
          firstNodeOffset,
          finalNodeCoverLength,
          mapping_quality: read.mapping_quality ?? 0,
          is_secondary: read.is_secondary ?? false,
          sample_name: read.sample_name ?? null,
          read_group: read.read_group ?? null,
          cigar_string: cigar_string(read.path),
          score: read.score ?? 0,
        }
        if (read.path.freq !== undefined) {
          track.freq = read.path.freq
        }
        if (read.name !== undefined) {
          track.name = read.name
        }
        extracted.push(track)
      }
    }
  }
  return extracted
}

// Below this zoom scale, a 12px mismatch glyph is <~6px on screen — unreadable
// noise. The zoom flush handler toggles the layer's `display` so the browser
// skips paint and hit-test for mismatches when the user is zoomed out far
// enough that they wouldn't be legible anyway. The elements stay in the DOM,
// so they reappear instantly when the user zooms back in.
const MISMATCH_HIDE_BELOW_K = 0.5

// Tracks the current display state of the per-base detail layers
// (mismatches + sequence text) so the flush only writes style attrs (and
// logs) when the shared threshold is actually crossed.
let detailHidden = false

function drawMismatches(): void {
  const layer = svg.append('g').attr('class', 'mismatches-layer')
  // Fresh layer starts visible — reset so the next flush will (re-)hide it
  // if the user is currently zoomed out below the threshold.
  detailHidden = false
  tracks.forEach(read => {
    const sequenceNew = read.sequenceNew
    if (read.type === 'read' && sequenceNew !== undefined) {
      sequenceNew.forEach((element, i) => {
        const nodeIndex = nodeMap.get(forward(element.nodeName))
        const node = nodeIndex === undefined ? undefined : nodes[nodeIndex]
        // Walk forward from the matching sequenceNew index to the path segment
        // that visits this node. Bounded: node merging can drop a visit, and an
        // unbounded walk would run off the end of the path.
        let pathIndex = i
        while (
          pathIndex < read.path.length &&
          read.path[pathIndex]!.node !== nodeIndex
        ) {
          pathIndex += 1
        }
        const segment = read.path[pathIndex]
        if (node !== undefined && segment?.y !== undefined) {
          const { y, isForward } = segment
          element.mismatches.forEach(edit => {
            // vg counts a reverse visit's positions from the node's right end
            const mm = isForward
              ? edit
              : mirroredMismatch(edit, node.sequenceLength)
            // Positions past the (possibly merged) node's end have no pixel
            // coordinate; drawing them would emit NaN attributes.
            const x = getXCoordinateOfBaseWithinNode(node, mm.pos)
            if (x !== null) {
              if (mm.type === 'insertion') {
                if (
                  config.showSoftClips ||
                  ((edit.pos !== read.firstNodeOffset || i !== 0) &&
                    (edit.pos !== read.finalNodeCoverLength ||
                      i !== sequenceNew.length - 1))
                ) {
                  drawInsertion(layer, x - 3, y + READ_WIDTH, node.y)
                }
              } else if (mm.type === 'deletion' && mm.length !== undefined) {
                const x2 = getXCoordinateOfBaseWithinNode(
                  node,
                  mm.pos + mm.length,
                )
                if (x2 !== null) {
                  drawDeletion(layer, x, x2, y + 4, node.y)
                }
              } else if (mm.type === 'substitution' && mm.seq !== undefined) {
                const x2 = getXCoordinateOfBaseWithinNode(
                  node,
                  mm.pos + mm.seq.length,
                )
                if (x2 !== null) {
                  drawSubstitution(
                    layer,
                    x + 1,
                    x2,
                    y + READ_WIDTH,
                    node.y,
                    mm.seq,
                  )
                }
              }
            }
          })
        }
      })
    }
  })
}

function drawInsertion(
  target: SvgGroupSelection,
  x: number,
  y: number,
  nodeY: number,
): void {
  target
    .append('text')
    .attr('x', x)
    .attr('y', y)
    .text('*')
    .attr('font-family', fonts)
    .attr('font-size', '12px')
    .attr('fill', 'black')
    .attr('nodeY', nodeY)
    .on('mouseover', insertionMouseOver)
    .on('mouseout', insertionMouseOut)
}

function drawSubstitution(
  target: SvgGroupSelection,
  x1: number,
  x2: number,
  y: number,
  nodeY: number,
  seq: string | undefined,
): void {
  target
    .append('text')
    .attr('x', x1)
    .attr('y', y)
    .text(seq ?? null)
    .attr('font-family', fonts)
    .attr('font-size', '12px')
    .attr('fill', 'black')
    .attr('nodeY', nodeY)
    .attr('rightX', x2)
    .on('mouseover', substitutionMouseOver)
    .on('mouseout', substitutionMouseOut)
}

function drawDeletion(
  target: SvgGroupSelection,
  x1: number,
  x2: number,
  y: number,
  nodeY: number,
): void {
  // draw horizontal block
  target
    .append('line')
    .attr('x1', x1)
    .attr('y1', y - 1)
    .attr('x2', x2)
    .attr('y2', y - 1)
    .attr('stroke-width', READ_WIDTH)
    .attr('stroke', 'grey')
    .attr('nodeY', nodeY)
    .on('mouseover', deletionMouseOver)
    .on('mouseout', deletionMouseOut)
}

// A vertical guide from a hovered mismatch up to its node. It takes no hover
// of its own, or drawing it over the mismatch would fire that mouseout.
function drawMismatchGuide(
  className: string,
  x: number,
  y: number,
  nodeY: number,
): void {
  svg
    .append('line')
    .attr('class', className)
    .attr('x1', x)
    .attr('y1', y)
    .attr('x2', x)
    .attr('y2', nodeY + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
    .style('pointer-events', 'none')
}

function insertionMouseOver(this: SVGElement): void {
  d3.select(this).attr('fill', 'red')
  const x = Number(d3.select(this).attr('x'))
  const y = Number(d3.select(this).attr('y'))
  const yTop = Number(d3.select(this).attr('nodeY'))
  drawMismatchGuide('insertionHighlight', x + 4, y - 10, yTop)
}

function deletionMouseOver(this: SVGElement): void {
  d3.select(this).attr('stroke', 'red')
  const x1 = Number(d3.select(this).attr('x1'))
  const x2 = Number(d3.select(this).attr('x2'))
  const y = Number(d3.select(this).attr('y1'))
  const yTop = Number(d3.select(this).attr('nodeY'))
  drawMismatchGuide('deletionHighlight', x1, y - 3, yTop)
  drawMismatchGuide('deletionHighlight', x2, y - 3, yTop)
}

function substitutionMouseOver(this: SVGElement): void {
  d3.select(this).attr('fill', 'red')
  const x1 = Number(d3.select(this).attr('x'))
  const x2 = Number(d3.select(this).attr('rightX'))
  const y = Number(d3.select(this).attr('y'))
  const yTop = Number(d3.select(this).attr('nodeY'))
  drawMismatchGuide('substitutionHighlight', x1 - 1, y - READ_WIDTH, yTop)
  drawMismatchGuide('substitutionHighlight', x2 + 1, y - READ_WIDTH, yTop)
}

function insertionMouseOut(this: SVGElement): void {
  d3.select(this).attr('fill', 'black')
  d3.selectAll('.insertionHighlight').remove()
}

function deletionMouseOut(this: SVGElement): void {
  d3.select(this).attr('stroke', 'grey')
  d3.selectAll('.deletionHighlight').remove()
}

function substitutionMouseOut(this: SVGElement): void {
  d3.select(this).attr('fill', 'black')
  d3.selectAll('.substitutionHighlight').remove()
}
