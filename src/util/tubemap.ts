
// ~1206 baseline) — mostly noUncheckedIndexedAccess in the lower half of
// the file (layout algorithms, drawing). Top-level signatures, top half,
// reads normalization, and hasOwnProperty narrowing are all done. See
// src/util/tubemap-phase2.md for the full plan.
/* eslint no-param-reassign: "off" */
/* eslint no-lonely-if: "off" */
/* eslint no-prototype-builtins: "off" */
/* eslint no-console: "off" */
/* eslint no-continue: "off" */

/* eslint max-len: "off" */
/* eslint no-loop-func: "off" */
/* eslint no-unused-vars: "off" */
/* eslint no-return-assign: "off" */
import * as d3 from 'd3'
import '../config-client.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _externalConfig from '../config-global.mjs'
import { defaultTrackColors } from '../common.ts'
import { greys, ygreys, blues, reds, plainColors, lightColors } from './palettes.ts'
import { formatTrackDisplayName } from './trackName.ts'
import isEqual from 'react-fast-compare'

// Replacement for d3-selection-multi (incompatible with d3 v7). Use via
// `selection.call(applyAttrs, {...})` — keeps the chain typed without
// modifying d3's prototype.
function applyAttrs<T extends d3.BaseType, U, V extends d3.BaseType, W>(
  sel: d3.Selection<T, U, V, W>,
  attrs: Record<string, string | number>,
): void {
  for (const [k, v] of Object.entries(attrs)) sel.attr(k, v)
}

const DEBUG = false

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

type MismatchType = 'insertion' | 'deletion' | 'substitution'

export interface Mismatch {
  type: MismatchType
  pos: number
  seq?: string
  length?: number
}

export interface ReadSequenceEntry {
  nodeName: string
  mismatches: Mismatch[]
}

export type TrackType = 'haplotype' | 'read'

export interface TrackRectangle {
  xStart: number
  yStart: number
  xEnd: number
  yEnd: number
  color: string
  alpha?: number
  id: number
  name?: string
  type?: TrackType
}

export interface TrackCurve {
  xStart: number
  yStart: number
  xEnd: number
  yEnd: number
  width: number
  color: string
  alpha?: number
  laneChange: number
  id: number
  name?: string
  type?: TrackType
  nodeStart: number | null | undefined
  nodeEnd: number | null | undefined
  path?: string
}

export interface TrackCorner {
  path: string
  color: string
  id: number
  name?: string
  type?: TrackType
}

export interface TrackFeature {
  start?: number
  end?: number
  type?: string
  name?: string
  continue?: boolean
}

export interface Segment {
  order: number
  lane?: number | null
  isForward: boolean
  node: number | null
  y?: number
  features?: TrackFeature[]
  betweenCycleReverseTraversal?: boolean
}

export interface BedRecord {
  track: string
  start: number
  end: number
  type: string
  name: string
}

// Loose input shape: just the basics produced by vgExtractTracks /
// vgExtractReads. Layout passes accrete indexSequence / path / width.
export interface InputTrack {
  id: number
  name?: string
  sequence: string[]
  type?: TrackType
  freq?: number
  hidden?: boolean
  sourceTrackID: number
  indexOfFirstBase?: number
  isCompletelyReverse?: boolean
  // Read-specific fields populated by vgExtractReads.
  sequenceNew?: ReadSequenceEntry[]
  firstNodeOffset?: number
  finalNodeCoverLength?: number
  mapping_quality?: number
  is_secondary?: boolean
  is_reverse?: boolean
  sample_name?: string | null
  read_group?: string | null
  cigar_string?: string
  score?: number
}

// Layout-complete track shape used inside createTubeMap.
export interface Track extends InputTrack {
  indexSequence: number[]
  path: Segment[]
  width: number
}

// Loose input shape passed to `create()`. Layout passes inside createTubeMap
// (generateNodeWidth → generateNodeOrder → generateLaneAssignment →
// generateNodeXCoords) accrete more fields, producing the full `Node` below.
// sequenceLength is optional because generateNodeWidth derives it from
// seq.length if missing.
export interface InputNode {
  name: string
  seq: string
  sequenceLength?: number
}

// Layout-complete node — fields used by drawing code after the pipeline.
// (Marked optional only for the genuinely conditional fields like switched/d.)
export interface Node extends InputNode {
  width: number
  pixelWidth: number
  order?: number
  y: number
  contentHeight: number
  x: number
  topLane: number
  successors: number[]
  predecessors: number[]
  tracks: number[]
  degree: number
  switched?: boolean
  incomingReads: [number, number][]
  outgoingReads: [number, number][]
  internalReads: number[]
  d?: string
}

// Node after generateNodeOrder() has run — order is guaranteed to be set.
export interface LayoutNode extends Node {
  order: number
}

export type InputRegion = (number | null)[]

export interface SegmentAssignment {
  trackID: number
  segmentID: number
  compareToFromSame: SegmentAssignment | null
  idealLane?: number
  idealY?: number | null
  lane?: number
}

export interface NodeAssignment {
  type: 'single' | 'multiple'
  node: number | null
  tracks: SegmentAssignment[]
  idealLane?: number
}

export interface ColorScheme {
  mainPalette: string
  auxPalette?: string
  colorReadsByMappingQuality?: boolean
  alphaReadsByMappingQuality?: boolean
}

export interface ReadGroup {
  color: string
  reads: Set<string>
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
  clickableNodesFlag: boolean
  showExonsFlag: boolean
  nodeWidthOption: 'normal' | 'compressed' | 'small' | 'fixed'
  showNodeLabels: boolean
  showReads: boolean
  showSoftClips: boolean
  colorSchemes: Record<number, ColorScheme>
  coloredNodes: string[]
  exonColors: string
  hideLegendFlag: boolean
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
  bed?: BedRecord[] | null
  clickableNodes?: boolean
  hideLegend?: boolean
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
type SvgGroupSelection = d3.Selection<SVGGElement, unknown, HTMLElement, unknown>

// Font stack we will use in the SVG
// We start with Courier New because it exists a lot more places than
// "Courier", and because tools like Inkscape can't interpret the text properly
// if they don't have the first font named here.
const fonts = '"Courier New", "Courier", "Lucida Console", monospace'

let svgID: string // the (html-tag) ID of the svg
let svg: AnySelection // the svg
export let zoom: d3.ZoomBehavior<Element, unknown>  
// inputNodes/nodes are 1-indexed: a hole at index 0 lets us use *signed*
// indices to mean orientation (-i = reverse of node i). inputNodes is sparse
// with undefined at [0]; nodes (a deep copy) inherits the same hole.
let inputNodes: (InputNode | undefined)[] = []
let inputTracks: InputTrack[] = []
let inputReads: InputTrack[] = []
let inputRegion: InputRegion = []
let nodes: LayoutNode[] = []
// Each track has a `path`, which is an array of Segment objects describing pieces of the path that need to be drawn, in order along the path.
let tracks: Track[] = []
// Each read also has a `path` list of Segments, but reads are organized vertically using a different system than non-read tracks.
let reads: Track[] = []
let numberOfNodes: number
let numberOfTracks: number
let nodeMap: Map<string, number>
let nodesPerOrder: number[][]
// Scratch array used only during generateNodeOrder. Indexed by node index;
// undefined = "not yet assigned." Copied into node.order at end of layout.
let nodeOrders: (number | undefined)[] = []
// Lane assignment info for tracks, in one list per horizontal "order" slot.
// Duplicates info in tracks' `path` lists but is organized by order. Reads do not use this.
let assignments: NodeAssignment[][] = []
let extraLeft: number[] = []
let extraRight: number[] = []
let maxOrder: number // horizontal order of the rightmost node

const config: TubeMapConfig = {
  mergeNodesFlag: true,
  transparentNodesFlag: false,
  clickableNodesFlag: false,
  showExonsFlag: false,
  // Options for the width of sequence nodes:
  // normal...scale node width linear with number of bases within node
  // compressed...scale node width with log2 of number of bases within node
  // small...scale node width with 1% of number of bases within node
  // fixed...set fixed node width to 1 base
  nodeWidthOption: 'normal',
  showNodeLabels: false,
  showReads: true,
  showSoftClips: true,
  colorSchemes: {},
  // colors corresponds with tracks(input files), [haplotype, read1, read2, ...]
  exonColors: 'lightColors',
  hideLegendFlag: false,
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

// variables for storing info which can be directly translated into drawing instructions
let trackRectangles: TrackRectangle[] = []
let trackCurves: TrackCurve[] = []
let trackCorners: TrackCorner[] = []
let trackVerticalRectangles: TrackRectangle[] = [] // drawn separately so they don't overlap horizontal rectangles
let trackRectanglesStep3: TrackRectangle[] = []

let maxYCoordinate = 0
let minYCoordinate = 0
let maxXCoordinate = 0
let trackForRuler: string | undefined

let bed: BedRecord[] | null = null

// main function to call from outside
// which starts the process of creating a tube map visualization
export function create(params: CreateParams): void {
  // mandatory parameters: svgID (really a selector, but must be an ID selector), nodes, tracks
  // optional parameters: bed, clickableNodes, reads, showLegend
  svgID = params.svgID
  svg = d3.select(params.svgID)
  inputNodes = deepCopy(params.nodes) // deep copy
  // Nodes are referenced in inputs by internal `name` attribute and not by index.
  // Internally in e.g. a path's indexSequence we need to reference nodes by *signed* index.
  // Which means that index 0 can never be allowed to be used, so we need to make sure it is not there.
  // So budge everything down
  inputNodes.unshift(undefined)
  // And then leave a hole in the array at 0 which we won't iterate over.
  delete inputNodes[0]
  inputTracks = deepCopy(params.tracks) // deep copy
  inputReads = params.reads ?? []
  inputRegion = params.region || []
  bed = params.bed || null
  config.clickableNodesFlag = params.clickableNodes || false
  config.hideLegendFlag = params.hideLegend || false
  createTubeMap()
}

// structuredClone preserves sparse-array holes; JSON round-trip would fill them with null.
function deepCopy<T>(val: T): T {
  return structuredClone(val)
}

// Return true if the given name names a reverse strand node, and false otherwise.
function isReverse(nodeName: string): boolean {
  const s = String(nodeName)
  return s.length >= 1 && s.startsWith('-')
}

// Get the forward version of a node name, which may be either forward or backward (negative)
function forward(nodeName: string): string {
  return isReverse(nodeName) ? String(nodeName).substring(1) : nodeName
}

// Get the reverse version of a node name, which may be either forward or backward (negative)
function reverse(nodeName: string): string {
  return isReverse(nodeName) ? nodeName : `-${nodeName}`
}

// Get the opposite orientation node name for the given node.
function flip(nodeName: string): string {
  return isReverse(nodeName) ? forward(nodeName) : reverse(nodeName)
}

// Signed-index orientation test. Uses 1/n to distinguish -0 from +0 since
// indexSequence entries can be negative-zero for reverse-strand visits of node 0.
function isForwardIndex(n: number): boolean {
  return (n || 1 / n) >= 0
}

// moves a specific track to the top. The subsequent createTubeMap() call
// will re-run straightenTrack against the new ordering.
function moveTrackToFirstPosition(index: number): void {
  inputTracks.unshift(inputTracks[index]!) // add element to beginning
  inputTracks.splice(index + 1, 1) // remove 1 element from the middle
}

// straighten track given by index by inverting inverted nodes
// only keep them inverted if this single track runs through them in both directions
// Operates on the per-render `nodes`/`tracks` copies; inputs are left untouched.
function straightenTrack(index: number): void {
  const nodesToInvert = new Set<string>()

  // find out which nodes should be inverted
  let currentSequence = tracks[index]!.sequence
  for (let i = 0; i < currentSequence.length; i += 1) {
    const cur = currentSequence[i]!
    if (isReverse(cur)) {
      const nodeName = forward(cur)
      const firstForwardIndex = currentSequence.indexOf(nodeName)
      if (firstForwardIndex === -1 || firstForwardIndex > i) {
        // only if this inverted node is no repeat
        nodesToInvert.add(nodeName)
      }
    }
  }

  // invert nodes in the tracks' sequence
  for (let i = 0; i < tracks.length; i += 1) {
    currentSequence = tracks[i]!.sequence
    for (let j = 0; j < currentSequence.length; j += 1) {
      const cur = currentSequence[j]!
      if (!isReverse(cur)) {
        if (nodesToInvert.has(cur)) {
          currentSequence[j] = reverse(cur)
        }
      } else if (nodesToInvert.has(forward(cur))) {
        currentSequence[j] = forward(cur)
      }
    }
  }

  // invert the sequence within the nodes
  nodes.forEach(node => {
    if (node && nodesToInvert.has(node.name)) {
      node.seq = node.seq.split('').reverse().join('')
    }
  })
}

export function changeTrackVisibility(trackID: number): void {
  const track = inputTracks.find(t => t.id === trackID)
  if (track) {
    track.hidden = !track.hidden
  }
  createTubeMap()
  emitTrackVisibility()
}

// to select/deselect all
export function changeAllTracksVisibility(value: boolean): void {
  for (const t of inputTracks) {
    t.hidden = !value
  }
  createTubeMap()
  emitTrackVisibility()
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
  return () => { visibilitySubscribers.delete(cb) }
}

function emitTrackVisibility(): void {
  if (config.hideLegendFlag) return
  const items: TrackVisibilityItem[] = []
  // Match createTubeMap's defaulting: tracks with no explicit type are
  // treated as haplotype (see the `t.type === undefined` branch above).
  // Use 'plain' highlight to match the color the draw loop actually uses.
  for (const t of inputTracks) {
    if (t.type === 'haplotype' || t.type === undefined) {
      items.push({
        id: t.id,
        name: t.name ?? String(t.id),
        color: generateTrackColor(t as Track, 'plain'),
        hidden: t.hidden === true,
        ...(t.freq !== undefined ? { freq: t.freq } : {}),
      })
    }
  }
  visibilitySnapshot = items
  for (const cb of visibilitySubscribers) cb()
}

export function changeExonVisibility(): void {
  config.showExonsFlag = !config.showExonsFlag
  createTubeMap()
}

// sets the flag for whether redundant nodes should be automatically removed or not
export function setMergeNodesFlag(value: boolean): void {
  if (config.mergeNodesFlag !== value) {
    config.mergeNodesFlag = value
    svg = d3.select(svgID)
    createTubeMap()
  }
}

// sets the flag for whether nodes should be fully transparent or not
export function setTransparentNodesFlag(value: boolean): void {
  if (config.transparentNodesFlag !== value) {
    config.transparentNodesFlag = value
    svg = d3.select(svgID)
    createTubeMap()
  }
}

// sets the flag for whether read soft clips should be displayed or not
export function setSoftClipsFlag(value: boolean): void {
  if (config.showSoftClips !== value) {
    config.showSoftClips = value
    svg = d3.select(svgID)
    createTubeMap()
  }
}

// sets the flag for whether reads should be displayed or not
export function setShowReadsFlag(value: boolean): void {
  if (config.showReads !== value) {
    config.showReads = value
    svg = d3.select(svgID)
    createTubeMap()
  }
}

export function setColorSet(fileID: number | string, newColor: ColorScheme): void {
  const currColor = config.colorSchemes[Number(fileID)]
  // update if any coloring parameter is different
  if (!currColor || !isEqual(currColor, newColor)) {
    config.colorSchemes[Number(fileID)] = newColor
    createTubeMap()
  }
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
  if (['normal', 'compressed', 'small', 'fixed'].includes(value)) {
    if (config.nodeWidthOption !== value) {
      config.nodeWidthOption = value
      if (svg !== undefined) {
        svg = d3.select(svgID)
        createTubeMap()
      }
    }
  }
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
      if (read.name && read.sequence) {
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
  const newValue = value && value.length > 0 ? value : null
  const oldKey =
    config.focusReadNames === null ? '' : config.focusReadNames.join('\0')
  const newKey = newValue === null ? '' : newValue.join('\0')
  if (oldKey !== newKey) {
    config.focusReadNames = newValue
    if (svg !== undefined) {
      svg = d3.select(svgID)
      createTubeMap()
    }
  }
}

interface ReadGroupInput {
  color: string
  reads: string[] | Set<string>
}

function readGroupsKey(groups: { color: string; reads: string[] }[]): string {
  return groups.map(g => `${g.color}${g.reads.join('\0')}`).join('')
}

// Set the named read groups for custom coloring. Accepts an array of
// { color, reads: string[] }; last group wins on overlap. Pass [] or null to
// clear all groups.
export function setReadGroups(
  value: ReadGroupInput[] | null | undefined,
): void {
  const incoming = value || []
  const oldKey = readGroupsKey(
    config.readGroups.map(g => ({
      color: g.color,
      reads: Array.from(g.reads),
    })),
  )
  const incomingNormalized = incoming.map(g => ({
    color: g.color,
    reads: Array.from(g.reads),
  }))
  const newKey = readGroupsKey(incomingNormalized)
  if (oldKey !== newKey) {
    config.readGroups = incomingNormalized.map(g => ({
      color: g.color,
      reads: new Set(g.reads),
    }))
    if (svg !== undefined) {
      svg = d3.select(svgID)
      createTubeMap()
    }
  }
}

export function setOtherReadsColor(value: string | null | undefined): void {
  const next = value || 'greys'
  if (config.otherReadsColor !== next) {
    config.otherReadsColor = next
    if (svg !== undefined) {
      svg = d3.select(svgID)
      createTubeMap()
    }
  }
}

export function setMappingQualityCutoff(value: number): void {
  if (config.mappingQualityCutoff !== value) {
    config.mappingQualityCutoff = value
    if (svg !== undefined) {
      svg = d3.select(svgID)
      createTubeMap()
    }
  }
}

// main
function createTubeMap(): void {
  trackRectangles = []
  trackCurves = []
  trackCorners = []
  trackVerticalRectangles = []
  trackRectanglesStep3 = []
  assignments = []
  extraLeft = []
  extraRight = []
  maxYCoordinate = 0
  minYCoordinate = 0
  maxXCoordinate = 0
  trackForRuler = undefined
  svg = d3.select(svgID)
  svg.selectAll('*').remove() // clear svg for (re-)drawing

  // early exit is necessary when visualization options such as colors are
  // changed before any graph has been rendered
  if (inputNodes.length === 0 || inputTracks.length === 0) return

  // Boundary promotion: layout passes below populate the Node/Track fields
  // (width, order, x/y, path, indexSequence, etc.) before any reader runs.
  nodes = deepCopy(inputNodes) as LayoutNode[]
  tracks = deepCopy(inputTracks) as Track[]
  reads = deepCopy(inputReads) as Track[]

  straightenTrack(0)

  reads = filterReads(reads)

  for (let i = tracks.length - 1; i >= 0; i -= 1) {
    const t = tracks[i]!
    if (t.type === undefined) {
      t.type = 'haplotype'
    }
    if (t.hidden === true) {
      tracks.splice(i, 1)
      continue
    }
    if (t.indexOfFirstBase !== undefined) {
      trackForRuler = t.name
    }
  }
  if (tracks.length === 0) return

  nodeMap = generateNodeMap()
  generateTrackIndexSequences(tracks)
  if (config.showReads && reads.length > 0) generateTrackIndexSequences(reads)
  generateNodeWidth()

  if (config.mergeNodesFlag) {
    generateNodeSuccessors()
    generateNodeOrder()
    if (config.showReads && reads.length > 0) reverseReversedReads()
    mergeNodes()
    nodeMap = generateNodeMap()
    generateNodeWidth()
    generateTrackIndexSequences(tracks)
    if (config.showReads && reads.length > 0) generateTrackIndexSequences(reads)
  }

  numberOfNodes = nodes.length
  numberOfTracks = tracks.length
  generateNodeSuccessors()
  generateNodeDegree()
  if (DEBUG) console.log(`${numberOfNodes} nodes.`)
  generateNodeOrder()
  maxOrder = getMaxOrder()

  // can cause problems when there is a reversed single track node
  // OTOH, can solve problems with complex inversion patterns
  switchNodeOrientation()
  generateNodeOrder()
  maxOrder = getMaxOrder()

  calculateTrackWidth()
  generateLaneAssignment()

  if (config.showExonsFlag && bed !== null) addTrackFeatures()

  if (config.showReads && reads.length > 0) {
    generateReadOnlyNodeAttributes()
    reverseReversedReads()
    generateTrackIndexSequences(reads)
    placeReads()
    tracks = tracks.concat(reads)
    // we do not have any reads to display
  } else {
    nodes.forEach(node => {
      if (node) {
        node.incomingReads = []
        node.outgoingReads = []
        node.internalReads = []
      }
    })
  }

  generateNodeXCoords()

  generateSVGShapesFromPath()
  if (DEBUG) {
    console.log('Tracks:')
    console.log(tracks)
    console.log('Nodes:')
    console.log(nodes)
    console.log('Lane assignment:')
    console.log(assignments)
  }
  getImageDimensions()
  alignSVG()
  defineSVGPatterns()

  // all drawn tracks are grouped
  const trackGroup = svg.append('g').attr('class', 'track')
  drawTrackRectangles(trackRectangles, 'haplotype', trackGroup)
  drawTrackCurves('haplotype', trackGroup)
  drawReversalsByColor(
    trackCorners,
    trackVerticalRectangles,
    'haplotype',
    trackGroup,
  )
  drawTrackRectangles(trackRectanglesStep3, 'haplotype', trackGroup)
  drawTrackRectangles(trackRectangles, 'read', trackGroup)
  drawTrackCurves('read', trackGroup)

  // draw only those nodes which have coords assigned to them
  const dNodes = removeUnusedNodes(nodes)
  drawReversalsByColor(
    trackCorners,
    trackVerticalRectangles,
    'read',
    trackGroup,
  )

  // all drawn nodes are grouped
  const nodeGroup = svg.append('g').attr('class', 'node')
  drawNodes(dNodes, nodeGroup)
  if (config.nodeWidthOption === 'normal' && !config.showNodeLabels)
    drawLabels(dNodes)
  if (config.showNodeLabels) drawNodeLabels(dNodes)
  if (trackForRuler !== undefined) drawRuler()
  if (config.nodeWidthOption === 'normal') drawMismatches() // TODO: call this before drawLabels and fix d3 data/append/enter stuff
  if (DEBUG) {
    console.log(`number of tracks: ${numberOfTracks}`)
    console.log(`number of nodes: ${numberOfNodes}`)
  }
  emitTrackVisibility()
}

// generates attributes (node.y, node.contentHeight) for nodes without tracks, only reads
function generateReadOnlyNodeAttributes(): void {
  nodesPerOrder = []
  for (let i = 0; i <= maxOrder; i += 1) {
    nodesPerOrder[i] = []
  }

  const orderY = new Map<number, number>()
  nodes.forEach(node => {
    if (node.y !== undefined) {
      setMapToMax(orderY, node.order, node.y + node.contentHeight)
    }
  })

  // for order values where there is no node with haplotypes, orderY is calculated via tracks
  tracks.forEach(track => {
    if (track.type === 'haplotype') {
      track.path.forEach(step => {
        setMapToMax(orderY, step.order, (step.y ?? 0) + track.width)
      })
    }
  })

  nodes.forEach((node, i) => {
    if (node.order >= 0 && node.y === undefined) {
      node.y = (orderY.get(node.order) ?? 0) + 25
      node.contentHeight = 0
      nodesPerOrder[node.order]!.push(i)
    }
  })
}

function setMapToMax<K>(map: Map<K, number>, key: K, value: number): void {
  const existing = map.get(key)
  if (existing === undefined) {
    map.set(key, value)
  } else {
    map.set(key, Math.max(existing, value))
  }
}

const READ_WIDTH = 7

// add info about reads to nodes (incoming, outgoing and internal reads)
function assignReadsToNodes(): void {
  nodes.forEach(node => {
    if (node) {
      node.incomingReads = []
      node.outgoingReads = []
      node.internalReads = []
    }
  })
  reads.forEach((read, idx) => {
    read.width = READ_WIDTH
    if (read.path.length === 1) {
      const firstNode = read.path[0]!.node
      if (firstNode !== null) {
        nodes[firstNode]!.internalReads.push(idx)
      }
    } else {
      read.path.forEach((element, pathIdx) => {
        if (pathIdx === 0) {
          const firstNode = read.path[0]!.node
          if (firstNode !== null) {
            nodes[firstNode]!.outgoingReads.push([idx, pathIdx])
          }
        } else {
          const elemNode = element.node
          if (elemNode !== null) {
            nodes[elemNode]!.incomingReads.push([idx, pathIdx])
          }
        }
      })
    }
  })
}

function removeNonPathNodesFromReads(): void {
  reads.forEach(read => {
    for (let i = read.sequence.length - 1; i >= 0; i -= 1) {
      const nodeName = forward(read.sequence[i]!)
      const idx = nodeMap.get(nodeName)
      if (idx === undefined || nodes[idx]!.degree === 0) {
        read.sequence.splice(i, 1)
      }
    }
  })
}

// calculate paths (incl. correct y coordinate) for all reads
function placeReads(): void {
  generateBasicPathsForReads()
  assignReadsToNodes()

  // sort nodes by order, then by y-coordinate
  const sortedNodes = nodes.slice()
  sortedNodes.sort(compareNodesByOrder)

  // Organize read IDs by source track
  const readsBySource = new Map<number, number[]>()
  for (let i = 0; i < reads.length; i++) {
    const source = reads[i]!.sourceTrackID
    const bucket = readsBySource.get(source)
    if (bucket === undefined) {
      readsBySource.set(source, [i])
    } else {
      bucket.push(i)
    }
  }

  const allSources = Array.from(readsBySource.keys()).sort((a, b) => a - b)

  // Space out read tracks if multiple exist
  const topMargin = allSources.length > 1 ? READ_WIDTH : 0
  sortedNodes.forEach(node => {
    if (!node) return
    // For each node
    for (const source of allSources) {
      // Go through all source tracks in order

      // Place the reads from this source in this node.
      // Use a margin to separate multiple read tracks if we have them.
      placeReadSet(readsBySource.get(source)!, node, topMargin)
    }
  })

  // place read segments which are without node
  const bottomY = calculateBottomY()
  const elementsWithoutNode: ElementWithoutNode[] = []
  reads.forEach((read, idx) => {
    const len = read.path.length

    // For each path index, precompute the nearest preceding/following segment
    // whose node is non-null and truthy. Falls back to the boundary segment when
    // none qualifies, matching the original walking-loop semantics.
    const prevSegment = new Array<Segment | undefined>(len)
    let lastValidPrev: Segment | undefined
    for (let i = 0; i < len; i++) {
      if (i === 0) {
        prevSegment[i] = undefined
      } else {
        prevSegment[i] = lastValidPrev ?? read.path[0]
      }
      const seg = read.path[i]!
      if (seg.node !== null && seg.node) lastValidPrev = seg
    }
    const nextSegment = new Array<Segment | undefined>(len)
    let firstValidNext: Segment | undefined
    for (let i = len - 1; i >= 0; i--) {
      if (i === len - 1) {
        nextSegment[i] = undefined
      } else {
        nextSegment[i] = firstValidNext ?? read.path[len - 1]
      }
      const seg = read.path[i]!
      if (seg.node !== null && seg.node) firstValidNext = seg
    }

    read.path.forEach((element, pathIdx) => {
      if (element.y === undefined) {
        const previousVisitToNode = prevSegment[pathIdx]
        const nextVisitToNode = nextSegment[pathIdx]

        // Specifically referring to segments between a cycle that's traversing from right to left
        const betweenCycleReverseTraversal = Boolean(
          // A segment can be between a cycle if it there are nodes on both sides
          nextVisitToNode &&
            previousVisitToNode &&
            nextVisitToNode.isForward !== undefined &&
            previousVisitToNode.isForward !== undefined &&
            // A segment is between a cycle if the next node it visits is behind the previous node it visited
            (previousVisitToNode.order > nextVisitToNode.order ||
              // A segment can also be between a cycle if it's visiting the same node it just visited in the same direction
              (nextVisitToNode.order === previousVisitToNode.order &&
                nextVisitToNode.isForward === previousVisitToNode.isForward)),
        )

        element.betweenCycleReverseTraversal = betweenCycleReverseTraversal

        elementsWithoutNode.push({
          readIndex: idx,
          pathIndex: pathIdx,
          previousY: previousVisitToNode?.y,
          previousNode: previousVisitToNode?.node,
        })
      }
    })
  })

  elementsWithoutNode.sort(compareNoNodeReads)
  elementsWithoutNode.forEach(element => {
    const read = reads[element.readIndex]!
    const segment = read.path[element.pathIndex]!
    segment.y = bottomY[segment.order]!
    bottomY[segment.order]! += read.width
  })

  if (DEBUG) {
    console.log('Reads:')
    console.log(reads)
  }
}

// Place a particular collection of reads, identified by a list of read
// numbers, into the given node at the right Y coordinates. All reads in all
// nodes above it, and no reads in any nodes below it, are already placed.
// Makes the given node bigger if needed and moves other nodes down if needed.
// If topMargin is set, applies that amount of spacing down from whatever is above the reads.
function placeReadSet(readIDs: number[], node: LayoutNode, topMargin: number): void {
  // Parse arguments
  if (!topMargin) {
    topMargin = 0
  }

  // Turn the read IDs into a set
  const toPlace = new Set(readIDs)

  // Get arrays of the read entry/exit/internal-ness records we want to work on
  let incomingReads = node.incomingReads.filter(([readID, pathIndex]) =>
    toPlace.has(readID),
  )
  const outgoingReads = node.outgoingReads.filter(([readID, pathIndex]) =>
    toPlace.has(readID),
  )
  const internalReads = node.internalReads.filter(readID => toPlace.has(readID))

  // Only actually use the top margin if we have any reads on the node.
  if (
    incomingReads.length === 0 &&
    outgoingReads.length === 0 &&
    internalReads.length === 0
  ) {
    topMargin = 0
  }

  // Determine where we start vertically in the node.
  // TODO: Why do we have to double this to keep reads out of adjacent lanes???
  const startY = node.y + node.contentHeight + topMargin * 2

  // sort incoming reads — decorate with a precomputed key so each compare is O(1).
  // The original comparator walks pathIdx backwards in lockstep on both sides, picking
  // the first step where either has a defined y (or reaches index 0). The walk's outcome
  // for a single entry is fully captured by:
  //   decisionStep: the smallest k>=1 where path[pathIdx-k].y is defined, or pathIdx+1
  //                 if no preceding segment has a defined y (the "reached 0" case).
  //   atZero: true iff decisionStep == pathIdx+1 (walked off the front).
  //   y:      the defined y at decisionStep, when !atZero.
  // Smaller decisionStep wins; ties prefer atZero (matches the `a[1]===0 return -1`
  // early-exit ordering); otherwise compare y's.
  const incomingKeys = incomingReads.map(entry => {
    const [readID, pathIdx] = entry
    const path = reads[readID]!.path
    let decisionStep = pathIdx + 1
    let foundY: number | undefined
    for (let k = 1; k <= pathIdx; k++) {
      const y = path[pathIdx - k]?.y
      if (y !== undefined) {
        decisionStep = k
        foundY = y
        break
      }
    }
    return { entry, decisionStep, atZero: foundY === undefined, y: foundY }
  })
  incomingKeys.sort((a, b) => {
    if (a.decisionStep !== b.decisionStep) return a.decisionStep - b.decisionStep
    if (a.atZero) return -1
    if (b.atZero) return 1
    return a.y! - b.y!
  })
  incomingReads = incomingKeys.map(k => k.entry)

  // place incoming reads
  let currentY = startY
  const occupiedUntil = new Map<number, number>()
  incomingReads.forEach(readElement => {
    const read = reads[readElement[0]]!
    read.path[readElement[1]]!.y = currentY
    setOccupiedUntil(occupiedUntil, read, readElement[1], currentY, node)
    currentY += READ_WIDTH
  })
  let maxY = currentY

  // sort outgoing reads
  outgoingReads.sort(compareReadOutgoingSegmentsByGoingTo)

  // place outgoing reads
  const occupiedFrom = new Map<number, number>()
  currentY = startY
  outgoingReads.forEach(readElement => {
    const read = reads[readElement[0]]!
    const firstNodeOffset = read.firstNodeOffset ?? 0
    // place in next lane
    read.path[readElement[1]]!.y = currentY
    occupiedFrom.set(currentY, firstNodeOffset)
    // if no conflicts
    const occUntil = occupiedUntil.get(currentY)
    if (occUntil === undefined || occUntil + 1 < firstNodeOffset) {
      currentY += READ_WIDTH
      maxY = Math.max(maxY, currentY)
    } else {
      // otherwise push down incoming reads to make place for outgoing Read
      occupiedUntil.set(currentY, 0)
      incomingReads.forEach(incReadElementIndices => {
        const incRead = reads[incReadElementIndices[0]]!
        const incReadPathElement = incRead.path[incReadElementIndices[1]]!
        if (incReadPathElement.y !== undefined && incReadPathElement.y >= currentY) {
          incReadPathElement.y += READ_WIDTH
          setOccupiedUntil(
            occupiedUntil,
            incRead,
            incReadElementIndices[1],
            incReadPathElement.y,
            node,
          )
        }
      })
      currentY += READ_WIDTH
      maxY += READ_WIDTH
    }
  })

  // sort internal reads
  internalReads.sort(compareInternalReads)

  // place internal reads
  internalReads.forEach(readIdx => {
    const currentRead = reads[readIdx]!
    const firstNodeOffset = currentRead.firstNodeOffset ?? 0
    const finalNodeCoverLength = currentRead.finalNodeCoverLength ?? 0
    currentY = startY
    while (
      firstNodeOffset < (occupiedUntil.get(currentY) ?? -Infinity) + 2 ||
      finalNodeCoverLength > (occupiedFrom.get(currentY) ?? Infinity) - 3
    ) {
      currentY += READ_WIDTH
    }
    currentRead.path[0]!.y = currentY
    occupiedUntil.set(currentY, finalNodeCoverLength)
    maxY = Math.max(maxY, currentY)
  })

  // adjust node height and move other nodes vertically down
  const heightIncrease = maxY - node.y - node.contentHeight
  node.contentHeight += heightIncrease
  adjustVertically3(node, heightIncrease)
}

// keeps track of where reads end within nodes
function setOccupiedUntil(
  map: Map<number, number>,
  read: Track,
  pathIndex: number,
  y: number,
  node: Node,
): void {
  if (pathIndex === read.path.length - 1) {
    // last node of current read
    map.set(y, read.finalNodeCoverLength ?? 0)
  } else {
    // read covers the whole node
    map.set(y, node.sequenceLength ?? 0)
  }
}

interface ElementWithoutNode {
  readIndex: number
  pathIndex: number
  previousY: number | undefined
  previousNode: number | null | undefined
}

// compare read segments which are outside of nodes to sort them in a good horizontal
// and then vertical display order.
function compareNoNodeReads(
  a: ElementWithoutNode,
  b: ElementWithoutNode,
): number {
  const readA = reads[a.readIndex]!
  const readB = reads[b.readIndex]!
  const segmentA = readA.path[a.pathIndex]!
  const segmentB = readB.path[b.pathIndex]!
  // Sort by order by segments
  if (segmentA.order !== segmentB.order) {
    return segmentA.order - segmentB.order
  }
  // Sort by reads' source track
  if (readA.sourceTrackID !== readB.sourceTrackID) {
    return readA.sourceTrackID - readB.sourceTrackID
  }
  // Sort by order of previous node
  if (a.previousNode && b.previousNode) {
    const prevNodeA = nodes[a.previousNode]
    const prevNodeB = nodes[b.previousNode]
    if (prevNodeA && prevNodeB && prevNodeA.order !== prevNodeB.order) {
      return prevNodeA.order - prevNodeB.order
    }
  }
  // We want to sort in reverse order when the segment is along the reverse-going part of a cycle.
  // This ensures a loop that starts on the outside, stays on the outside,
  // and rolls up in order with other loops.
  const aPrev = a.previousY ?? 0
  const bPrev = b.previousY ?? 0
  if (
    segmentA.betweenCycleReverseTraversal &&
    segmentB.betweenCycleReverseTraversal
  ) {
    return bPrev - aPrev
  } else {
    return aPrev - bPrev
  }
}

// compare read segments by where they are going to
function compareReadOutgoingSegmentsByGoingTo(
  [readIndexA, pathIndexA]: [number, number],
  [readIndexB, pathIndexB]: [number, number],
): number {
  // Expect two arrays both containing 2 integers.
  // The first index of each array contains the read index
  // The second index of each array contains the path index

  // Segments are first sorted by the y value of their last node,
  // then by the node they end on,
  // then by length in final node
  const readA = reads[readIndexA]!
  const readB = reads[readIndexB]!
  let previousValidYA: number | undefined
  let previousValidYB: number | undefined
  let lastPathIndexA = readA.path.length - 1
  let lastPathIndexB = readB.path.length - 1
  while (!previousValidYA && lastPathIndexA >= 0) {
    previousValidYA = readA.path[lastPathIndexA]?.y
    lastPathIndexA -= 1
  }
  while (!previousValidYB && lastPathIndexB >= 0) {
    previousValidYB = readB.path[lastPathIndexB]?.y
    lastPathIndexB -= 1
  }

  if (previousValidYA && previousValidYB) {
    return previousValidYA - previousValidYB
  }

  // Couldn't find a valid y value for at least one of the reads, sort by which node reads end on
  const initialNodeA = readA.path[pathIndexA]?.node
  const initialNodeB = readB.path[pathIndexB]?.node
  let nodeA: Node | null | undefined =
    initialNodeA != null ? nodes[initialNodeA] : null
  let nodeB: Node | null | undefined =
    initialNodeB != null ? nodes[initialNodeB] : null
  // Follow the reads' paths until we find the node they diverge at
  // Or, they go through all the same nodes and we do a tiebreaker at the end
  while (nodeA != null && nodeB != null && nodeA === nodeB) {
    if (pathIndexA < readA.path.length - 1) {
      pathIndexA += 1
      while (readA.path[pathIndexA]?.node === null) pathIndexA += 1 // skip null nodes in path
      const nextNodeIdx = readA.path[pathIndexA]?.node
      nodeA = nextNodeIdx != null ? nodes[nextNodeIdx] : null
    } else {
      nodeA = null
    }
    if (pathIndexB < readB.path.length - 1) {
      pathIndexB += 1
      while (readB.path[pathIndexB]?.node === null) pathIndexB += 1 // skip null nodes in path
      const nextNodeIdx = readB.path[pathIndexB]?.node
      nodeB = nextNodeIdx != null ? nodes[nextNodeIdx] : null
    } else {
      nodeB = null
    }
  }
  if (nodeA != null) {
    if (nodeB != null) return compareNodesByOrder(nodeA, nodeB)
    return 1 // nodeB is null, nodeA not null
  }
  if (nodeB != null) return -1 // nodeB not null, nodeA null
  // both nodes are null -> both end in the same node
  const beginDiff =
    (readA.firstNodeOffset ?? 0) - (readB.firstNodeOffset ?? 0)
  if (beginDiff !== 0) return beginDiff

  // break tie: both reads cover the same nodes and begin at the same position

  // One or both reads didn't have a previously valid Y value, compare by the endPosition of the read
  return (
    (readA.finalNodeCoverLength ?? 0) - (readB.finalNodeCoverLength ?? 0)
  )
}

// Compare tracks based on ordering at their first convergence
function compareTrackByInitialOrdering(trackA: Track, trackB: Track): number {
  // Find the first node where the two tracks converge, sort by layer
  if (!trackA.path) return -1
  if (!trackB.path) return 1

  const pathA = trackA.path
  const pathB = trackB.path

  let AIndex = 0
  let BIndex = 0
  while (AIndex < pathA.length && BIndex < pathB.length) {
    const a = pathA[AIndex]!
    const b = pathB[BIndex]!
    const trackAOrder = a.order
    const trackBOrder = b.order
    if (trackAOrder === trackBOrder && a.node && b.node) {
      return (b.y ?? 0) - (a.y ?? 0)
    } else if (trackAOrder < trackBOrder) {
      AIndex += 1
    } else if (trackAOrder > trackBOrder) {
      BIndex += 1
    } else {
      // Orders are equal but are traversing out of nodes
      AIndex += 1
      BIndex += 1
    }
  }

  // Tracks do not converge, keep the same ordering
  return 0
}

// compare 2 reads which are completely within a single node
function compareInternalReads(idxA: number, idxB: number): number {
  const a = reads[idxA]!
  const b = reads[idxB]!
  // compare by first base within first node
  const aFirst = a.firstNodeOffset ?? 0
  const bFirst = b.firstNodeOffset ?? 0
  if (aFirst < bFirst) return -1
  else if (aFirst > bFirst) return 1

  // compare by last base within last node
  const aLast = a.finalNodeCoverLength ?? 0
  const bLast = b.finalNodeCoverLength ?? 0
  if (aLast < bLast) return -1
  else if (aLast > bLast) return 1

  return 0
}

// determine biggest y-coordinate for each order-value
function calculateBottomY(): number[] {
  const bottomY: number[] = []
  for (let i = 0; i <= maxOrder; i += 1) {
    bottomY.push(0)
  }

  nodes.forEach(node => {
    if (node.y !== undefined) {
      bottomY[node.order] = Math.max(
        bottomY[node.order]!,
        node.y + node.contentHeight + 20,
      )
    }
  })

  tracks.forEach(track => {
    track.path.forEach(element => {
      bottomY[element.order] = Math.max(
        bottomY[element.order]!,
        (element.y ?? 0) + track.width,
      )
    })
  })
  return bottomY
}

// generate path-info for each read
// containing order, node and orientation, but no concrete coordinates
// TODO: Duplicates a lot of the same work as generateLaneAssignment() does for non-read tracks.
function generateBasicPathsForReads(): void {
  reads.forEach(read => {
    // add info for start of track
    let currentNodeIndex = Math.abs(read.indexSequence[0]!)
    let currentNodeIsForward = isForwardIndex(read.indexSequence[0]!)
    let currentNode = nodes[currentNodeIndex]!
    let previousNode = currentNode
    let previousNodeIsForward = currentNodeIsForward

    read.path = []
    read.path.push({
      order: currentNode.order,
      isForward: currentNodeIsForward,
      node: currentNodeIndex,
    })

    for (let i = 1; i < read.sequence.length; i += 1) {
      previousNode = currentNode
      previousNodeIsForward = currentNodeIsForward

      currentNodeIndex = Math.abs(read.indexSequence[i]!)
      currentNodeIsForward = isForwardIndex(read.indexSequence[i]!)
      currentNode = nodes[currentNodeIndex]!

      if (currentNode.order > previousNode.order) {
        if (!previousNodeIsForward) {
          // backward to forward at previous node
          read.path.push({
            order: previousNode.order,
            isForward: true,
            node: null,
          })
        }
        for (let j = previousNode.order + 1; j < currentNode.order; j += 1) {
          // forward without nodes
          read.path.push({ order: j, isForward: true, node: null })
        }
        if (!currentNodeIsForward) {
          // forward to backward at current node
          read.path.push({
            order: currentNode.order,
            isForward: true,
            node: null,
          })
          read.path.push({
            order: currentNode.order,
            isForward: false,
            node: currentNodeIndex,
          })
        } else {
          // current Node forward
          read.path.push({
            order: currentNode.order,
            isForward: true,
            node: currentNodeIndex,
          })
        }
      } else if (currentNode.order < previousNode.order) {
        if (previousNodeIsForward) {
          // turnaround from fw to bw at previous node
          read.path.push({
            order: previousNode.order,
            isForward: false,
            node: null,
          })
        }
        for (let j = previousNode.order - 1; j > currentNode.order; j -= 1) {
          // bachward without nodes
          read.path.push({ order: j, isForward: false, node: null })
        }
        if (currentNodeIsForward) {
          // backward to forward at current node
          read.path.push({
            order: currentNode.order,
            isForward: false,
            node: null,
          })
          read.path.push({
            order: currentNode.order,
            isForward: true,
            node: currentNodeIndex,
          })
        } else {
          // backward at current node
          read.path.push({
            order: currentNode.order,
            isForward: false,
            node: currentNodeIndex,
          })
        }
      } else {
        if (currentNodeIsForward !== previousNodeIsForward) {
          read.path.push({
            order: currentNode.order,
            isForward: currentNodeIsForward,
            node: currentNodeIndex,
          })
        } else {
          read.path.push({
            order: currentNode.order,
            isForward: !currentNodeIsForward,
            node: null,
          })
          read.path.push({
            order: currentNode.order,
            isForward: currentNodeIsForward,
            node: currentNodeIndex,
          })
        }
      }
    }
  })
}

// reverse reads which are reversed
function reverseReversedReads(): void {
  reads.forEach(read => {
    let pos = 0
    while (pos < read.sequence.length && read.sequence[pos]!.startsWith('-')) {
      pos += 1
    }
    if (pos === read.sequence.length) {
      // completely reversed read
      read.is_reverse = true
      read.sequence = read.sequence.reverse() // invert sequence
      for (let i = 0; i < read.sequence.length; i += 1) {
        read.sequence[i] = forward(read.sequence[i]!) // visit nodes forward
        // TODO: Do we really want to visit all the nodes forward here? Are we
        // sure we aren't in mixed orientation?
      }

      const sequenceNew = read.sequenceNew ?? []
      sequenceNew.reverse() // invert sequence
      read.sequenceNew = sequenceNew
      for (let i = 0; i < sequenceNew.length; i += 1) {
        const entry = sequenceNew[i]!
        entry.nodeName = forward(entry.nodeName) // visit nodes forward
        const nodeIdx = nodeMap.get(entry.nodeName)!
        const nodeWidth = nodes[nodeIdx]!.width
        entry.mismatches.forEach(mm => {
          if (mm.type === 'insertion') {
            mm.pos = nodeWidth - mm.pos
            mm.seq = mm.seq === undefined ? undefined : getReverseComplement(mm.seq)
          } else if (mm.type === 'deletion') {
            mm.pos = nodeWidth - mm.pos - (mm.length ?? 0)
          } else if (mm.type === 'substitution') {
            mm.pos = nodeWidth - mm.pos - (mm.seq?.length ?? 0)
            mm.seq = mm.seq === undefined ? undefined : getReverseComplement(mm.seq)
          }
          if (mm.seq !== undefined) {
            mm.seq = mm.seq.split('').reverse().join('')
          }
        })
      }

      // adjust firstNodeOffset and finalNodeCoverLength
      const temp = read.firstNodeOffset ?? 0
      let seqLength = nodes[nodeMap.get(read.sequence[0]!)!]!.sequenceLength ?? 0
      read.firstNodeOffset = seqLength - (read.finalNodeCoverLength ?? 0)
      seqLength =
        nodes[nodeMap.get(read.sequence[read.sequence.length - 1]!)!]!
          .sequenceLength ?? 0
      read.finalNodeCoverLength = seqLength - temp
    }
  })
}

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }

function getReverseComplement(s: string): string {
  let result = ''
  for (let i = s.length - 1; i >= 0; i -= 1) {
    result += COMPLEMENT[s.charAt(i)] ?? 'N'
  }
  return result
}

// for each track: generate sequence of node indices from seq. of node names
function generateTrackIndexSequences(tracksOrReads: Track[]): void {
  tracksOrReads.forEach(track => {
    track.indexSequence = []
    track.sequence.forEach(rawNodeName => {
      let nodeName = rawNodeName
      // if node was switched, reverse it here
      // Q? Is flipping the index enough? It looks like yes. Or should we also flip the node name in 'sequence'?
      const fwdIdx = nodeMap.get(forward(nodeName))!
      const switched = nodes[fwdIdx]?.switched ?? false
      if (switched) {
        nodeName = flip(nodeName)
      }
      // Get the index to visit the node. If the node is switched, this means
      // visiting it reverse. Otherwise, this means visiting it forward.
      const nodeIndex = nodeMap.get(forward(nodeName))!
      if (nodeIndex === 0) {
        // If a node index is ever 0, we can't visit it in reverse, so we don't allow that to happen.
        throw new Error('Node ' + forward(nodeName) + ' has prohibited index 0')
      }
      if (isReverse(nodeName) !== switched) {
        // If we visit the node in reverse XOR the node is switched, go through
        // it right to left as displayed.
        track.indexSequence.push(-nodeIndex)
      } else {
        // If either the node isn't switched and we go through it forward, or
        // the node is switched *and* we go through it backward, go through it
        // left to right as displayed.
        track.indexSequence.push(nodeIndex)
      }
    })
  })
}

// remove nodes with no tracks moving through them to avoid d3.js errors
function removeUnusedNodes(allNodes: LayoutNode[]): LayoutNode[] {
  const dNodes: LayoutNode[] = []
  for (const n of allNodes) {
    if (n?.x !== undefined) {
      dNodes.push(n)
    }
  }
  return dNodes
}

// get the minimum and maximum coordinates used in the image to calculate image dimensions
function getImageDimensions(): void {
  maxXCoordinate = -99
  minYCoordinate = 99
  maxYCoordinate = -99

  nodes.forEach(node => {
    if (!node) return
    if (node.x !== undefined) {
      maxXCoordinate = Math.max(maxXCoordinate, node.x + 20 + node.pixelWidth)
    }
    if (node.y !== undefined) {
      minYCoordinate = Math.min(minYCoordinate, node.y - 10)
      maxYCoordinate = Math.max(
        maxYCoordinate,
        node.y + node.contentHeight + 10,
      )
    }
  })

  tracks.forEach(track => {
    track.path.forEach(segment => {
      const y = segment.y ?? 0
      maxYCoordinate = Math.max(maxYCoordinate, y + track.width)
      minYCoordinate = Math.min(minYCoordinate, y)
    })
  })
}

// Minimum zoom is a scaling factor that determines how far the graph can be zoomed out. This function determines
// how small the graph needs to appear to fully fit onto the screen.
// This factor is based on maxXCoordinate and maxYCoordinate, and the size of the svg's parent.
function minZoom(): number {
  const svgElement = document.getElementById(svgID.substring(1))
  const parentElement =
    svgElement?.parentNode instanceof HTMLElement ? svgElement.parentNode : null
  if (!parentElement) {
    return 1
  }
  return Math.min(
    1,
    parentElement.clientWidth / maxXCoordinate,
    parentElement.clientHeight / (maxYCoordinate + RAIL_SPACE),
  )
}

// This needs to be the width of the ruler.
// TODO: Tell the ruler drawing code.
const RULER_WIDTH = 30
const NODE_MARGIN = 10
// This is how much space to let us pan, around the nodes as measure by getImageDimensions()
const RAIL_SPACE = RULER_WIDTH + NODE_MARGIN

// align visualization to the top and left within svg and resize svg to correct size
// enable zooming and panning
function alignSVG(): void {
  // Find the SVG element.
  // Trim off the leading "#" from the SVG ID.
  const svgElement = document.getElementById(svgID.substring(1))
  const parentElement =
    svgElement?.parentNode instanceof HTMLElement ? svgElement.parentNode : null
  if (!svgElement || !parentElement) return

  // d3-zoom stores the current transform on the SVG node as __zoom. It is
  // undefined until the first time we attach a zoom behaviour. By capturing it
  // before re-attaching, we can distinguish a first-time draw (needs the
  // centred initial transform) from a re-draw (should preserve the user's
  // pan/zoom across a re-create that was triggered by, e.g., a visOptions
  // change or a spurious parent re-render).
  const previousTransform = (svgElement as { __zoom?: d3.ZoomTransform })
    .__zoom

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
      svg.attr('transform', pendingTransform)
      // Counter-scale node labels so they stay at constant visual size when zoomed out
      // Cap counter-scale so labels don't grow unboundedly when zoomed far out
      const labelScale = Math.min(1 / pendingK, 4)
      svg.selectAll<SVGGElement, Node>('.node-label-group').attr('transform', d => {
        const cx = d.x + d.pixelWidth / 2
        const cy = d.y - 14
        return `translate(${cx},${cy}) scale(${labelScale})`
      })
      pendingTransform = null
    }
  }
  function zoomed(event: d3.D3ZoomEvent<Element, unknown>): void {
    pendingTransform = String(event.transform)
    pendingK = event.transform.k
    if (rafHandle === null) {
      rafHandle = requestAnimationFrame(flushTransform)
    }
  }

  // Disable pointer events on the transformed content during an active zoom
  // gesture. Hit-testing against ~600k child elements is what makes zoom feel
  // sticky; the outer SVG still receives pointer events (it's the zoom target),
  // so the gesture itself keeps working.
  function setInteractive(on: boolean): void {
    if (on) {
      svg.style('pointer-events', null)
    } else {
      svg.style('pointer-events', 'none')
    }
  }

  zoom = d3.zoom()
  zoom.on('start', () => { setInteractive(false) })
  zoom.on('zoom', zoomed)
  zoom.on('end', () => {
    // Make sure the final transform is applied before re-enabling hit-testing,
    // otherwise a tooltip can fire against stale geometry.
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle)
      flushTransform()
    }
    setInteractive(true)
  })

  function configureZoomBounds(): void {
    if (!parentElement) return
    // Configure panning and zooming, given the SVG parent's size on the page.

    svg.attr('height', parentElement.clientHeight)
    svg.attr('width', parentElement.clientWidth)

    const minScaleFactor = minZoom()

    // We need to set an extent here because auto-determination of the region
    // to zoom breaks on the React testing jsdom
    //
    // We also need the translate extent to always be larger than the zoom
    // extent. See <https://stackoverflow.com/a/53784776>.
    //
    // Really we would like to say that, given the zoom level, some part of the
    // drawing should always be on the screen. But that requires redefining the
    // translate extent (the area that d3 stops us from seeing out of) to be
    // smaller when zoomed in and larger when zoomed out. We can't let the
    // translate extent ever be smaller than the viewport at any zoom level, or
    // d3 will lock it to the center along that axis but content will go out of
    // bounds on the SVG image download.
    zoom
      .extent([
        [0, 0],
        [parentElement.clientWidth, parentElement.clientHeight],
      ])
      .scaleExtent([minScaleFactor, 8])
      .translateExtent([
        [0, minYCoordinate - RAIL_SPACE],
        [
          Math.max(maxXCoordinate, parentElement.clientWidth / minScaleFactor),
          Math.max(maxYCoordinate, parentElement.clientHeight / minScaleFactor),
        ],
      ])
  }

  // Initially configure panning and zooming
  configureZoomBounds()
  svg.call(zoom).on('dblclick.zoom', null)
  // @ts-expect-error — d3 Selection<SVGGElement> is not structurally assignable to Selection<Element> due to callback this-type invariance, but works at runtime.
  svg = svg.append('g')
  // Don't let scrolling bubble up from the visualization
  parentElement.addEventListener('wheel', e => {
    e.preventDefault()
  })

  // If the view area resizes, reconfigure the zoom
  if (window.ResizeObserver) {
    // This feature is in all current major browsers, but not in React's testing environment.
    const resizeObserver = new window.ResizeObserver(() => {
      configureZoomBounds()
    })
    resizeObserver.observe(parentElement)
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
  const totalHeight = maxYCoordinate - minYCoordinate + RAIL_SPACE
  const initialScale = Math.min(
    1,
    totalHeight > 0 ? parentElement.clientHeight / totalHeight : 1,
  )
  const containerWidth = parentElement.clientWidth
  const scaledWidth = maxXCoordinate * initialScale
  const xOffset =
    scaledWidth + 10 < containerWidth
      ? (containerWidth - scaledWidth - 10) / 2
      : 0
  const initialTransform =
    previousTransform ??
    d3.zoomIdentity
      .translate(xOffset, RAIL_SPACE - minYCoordinate * initialScale)
      .scale(initialScale)
  // @ts-expect-error — zoom.transform overload signature doesn't match call()'s generic constraint due to d3 type limitations.
  d3.select(document).select(svgID).call(zoom.transform, initialTransform)
}

export function zoomBy(zoomFactor: number): void {
  // Find the SVG element.
  // Trim off the leading "#" from the SVG ID.
  const svgElement = document.getElementById(svgID.substring(1))
  const parentElement =
    svgElement?.parentNode instanceof HTMLElement ? svgElement.parentNode : null
  if (!parentElement) return

  const maxZoom = 8
  const width = parentElement.clientWidth

  const node = d3.select<Element, unknown>(svgID).node()
  if (!node) return
  const transform = d3.zoomTransform(node)
  const translateK = Math.min(
    maxZoom,
    Math.max(transform.k * zoomFactor, minZoom()),
  )
  let translateX =
    width / 2.0 - ((width / 2.0 - transform.x) * translateK) / transform.k
  translateX = Math.min(translateX, 1 * translateK)
  translateX = Math.max(translateX, width - (maxXCoordinate + 2) * translateK)
  const translateY = (25 - minYCoordinate) * translateK
  d3.select(svgID)
    .transition()
    .duration(750)
    .call(
      // @ts-expect-error — zoom.transform doesn't match Transition.call()'s expected signature due to d3 type limitations.
      zoom.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(translateK),
    )
}

// map node names to node indices
function generateNodeMap(): Map<string, number> {
  nodeMap = new Map()
  nodes.forEach((node, index) => {
    if (node) {
      nodeMap.set(node.name, index)
    }
  })
  return nodeMap
}

// adds a successor-array to each node containing the indices of the nodes coming directly after the current node
function generateNodeSuccessors(): void {
  const successorSets: Set<number>[] = nodes.map(() => new Set())
  const predecessorSets: Set<number>[] = nodes.map(() => new Set())

  const addEdges = (track: Track): void => {
    for (let i = 0; i < track.indexSequence.length - 1; i += 1) {
      const current = Math.abs(track.indexSequence[i]!)
      const follower = Math.abs(track.indexSequence[i + 1]!)
      successorSets[current]!.add(follower)
      predecessorSets[follower]!.add(current)
    }
  }

  tracks.forEach(addEdges)
  if (config.showReads && reads.length > 0) {
    reads.forEach(addEdges)
  }

  nodes.forEach((node, i) => {
    if (node) {
      node.successors = Array.from(successorSets[i]!)
      node.predecessors = Array.from(predecessorSets[i]!)
    }
  })
}

function generateNodeOrderOfSingleTrack(sequence: number[]): void {
  let forwardOrder = 0
  let backwardOrder = 0
  let minOrder = 0

  sequence.forEach(nodeIndex => {
    const idx = Math.abs(nodeIndex)
    if (nodeIndex < 0) {
      if (nodeOrders[idx] === undefined) nodeOrders[idx] = backwardOrder
      const order = nodeOrders[idx]
      if (order < minOrder) minOrder = order
      forwardOrder = order
      backwardOrder = order - 1
    } else {
      if (nodeOrders[idx] === undefined) nodeOrders[idx] = forwardOrder
      const order = nodeOrders[idx]
      forwardOrder = order + 1
      backwardOrder = order
    }
  })
  if (minOrder < 0) {
    increaseOrderForAllNodes(-minOrder)
  }
}

// calculate the order-value of nodes contained in sequence which are to the left of the first node which already has an order-value
function generateNodeOrderTrackBeginning(sequence: number[]): number | null {
  let anchorIndex = 0
  let minOrder = 0

  while (
    anchorIndex < sequence.length &&
    nodeOrders[Math.abs(sequence[anchorIndex]!)] === undefined
  ) {
    anchorIndex += 1 // anchor = first node in common with existing graph
  }
  if (anchorIndex >= sequence.length) {
    return null
  }

  const anchorSeqVal = sequence[anchorIndex]!
  let currentOrder: number
  let increment: number
  if (anchorSeqVal >= 0) {
    // regular node
    currentOrder = nodeOrders[anchorSeqVal]! - 1
    increment = -1
  } else {
    // reverse node
    currentOrder = nodeOrders[-anchorSeqVal]! + 1
    increment = 1
  }

  for (let j = anchorIndex - 1; j >= 0; j -= 1) {
    // assign order to nodes which are left of anchor node
    const idx = Math.abs(sequence[j]!)
    if (nodeOrders[idx] === undefined) {
      nodeOrders[idx] = currentOrder
      minOrder = Math.min(minOrder, currentOrder)
      currentOrder += increment
    }
  }

  if (minOrder < 0) {
    increaseOrderForAllNodes(-minOrder)
  }
  return anchorIndex
}

// generate global sequence of nodes from left to right, starting with first track and adding other tracks sequentially
function generateNodeOrder(): void {
  let modifiedSequence: number[]
  let currentOrder: number
  let rightIndex: number
  let leftIndex: number
  let minOrder = 0
  const tracksAndReads =
    config.showReads && reads.length > 0 ? tracks.concat(reads) : tracks

  nodeOrders = new Array(nodes.length) // reset scratch; undefined = unassigned
  // Clear stale orders from previous runs so downstream `order === undefined`
  // guards still identify unassigned nodes. LayoutNode.order is non-optional
  // (set by this very pass), so we widen via the Node base type to allow the reset.
  ;(nodes as Node[]).forEach(node => {
    if (node) {
      node.order = undefined
    }
  })

  generateNodeOrderOfSingleTrack(tracks[0]!.indexSequence)

  for (let i = 1; i < tracksAndReads.length; i += 1) {
    if (DEBUG) console.log(`generating order for track ${i + 1}`)
    rightIndex = generateNodeOrderTrackBeginning(
      tracksAndReads[i]!.indexSequence,
    )!
    if (rightIndex === null) {
      if (tracksAndReads[i]!.type === 'haplotype') {
        generateNodeOrderOfSingleTrack(tracksAndReads[i]!.indexSequence)
      } else {
        tracksAndReads.splice(i, 1)
        reads.splice(i - tracks.length, 1)
        i -= 1
      }
      continue
    }
    modifiedSequence = uninvert(tracksAndReads[i]!.indexSequence)

    while (rightIndex < modifiedSequence.length) {
      // move right until the end of the sequence
      leftIndex = rightIndex
      rightIndex += 1
      while (
        rightIndex < modifiedSequence.length &&
        nodeOrders[modifiedSequence[rightIndex]!] === undefined
      ) {
        rightIndex += 1
      }

      if (rightIndex < modifiedSequence.length) {
        // middle segment between two anchors
        currentOrder = nodeOrders[modifiedSequence[leftIndex]!]! + 1
        for (let j = leftIndex + 1; j < rightIndex; j += 1) {
          nodeOrders[modifiedSequence[j]!] = currentOrder
          currentOrder += 1
        }

        if (
          nodeOrders[modifiedSequence[rightIndex]!]! >
          nodeOrders[modifiedSequence[leftIndex]!]!
        ) {
          if (
            nodeOrders[modifiedSequence[rightIndex]!]! < currentOrder
          ) {
            increaseOrderForSuccessors(
              modifiedSequence[rightIndex]!,
              modifiedSequence[rightIndex - 1]!,
              currentOrder,
            )
          }
        } else {
          if (
            tracksAndReads[i]!.indexSequence[rightIndex]! >= 0 &&
            !isSuccessor(
              modifiedSequence[rightIndex]!,
              modifiedSequence[leftIndex]!,
            )
          ) {
            // no real reversal
            increaseOrderForSuccessors(
              modifiedSequence[rightIndex]!,
              modifiedSequence[rightIndex - 1]!,
              currentOrder,
            )
          } else {
            // real reversal
            if (
              tracksAndReads[i]!.indexSequence[leftIndex]! < 0 ||
              (nodes[modifiedSequence[leftIndex + 1]!]!.degree < 2 &&
                nodeOrders[modifiedSequence[rightIndex]!]! <
                  nodeOrders[modifiedSequence[leftIndex]!]!)
            ) {
              currentOrder = nodeOrders[modifiedSequence[leftIndex]!]! - 1
              for (let j = leftIndex + 1; j < rightIndex; j += 1) {
                nodeOrders[modifiedSequence[j]!] = currentOrder
                minOrder = Math.min(minOrder, currentOrder)
                currentOrder -= 1
              }
            }
          }
        }
      } else {
        // right segment to the right of last anchor
        if (tracksAndReads[i]!.indexSequence[leftIndex]! >= 0) {
          // elongate towards the right
          currentOrder = nodeOrders[modifiedSequence[leftIndex]!]! + 1
          for (let j = leftIndex + 1; j < modifiedSequence.length; j += 1) {
            const idx = modifiedSequence[j]!
            if (nodeOrders[idx] === undefined) {
              nodeOrders[idx] = currentOrder
              currentOrder += 1
            }
          }
        } else {
          // elongate towards the left
          currentOrder = nodeOrders[modifiedSequence[leftIndex]!]! - 1
          for (let j = leftIndex + 1; j < modifiedSequence.length; j += 1) {
            const idx = modifiedSequence[j]!
            if (nodeOrders[idx] === undefined) {
              nodeOrders[idx] = currentOrder
              minOrder = Math.min(minOrder, currentOrder)
              currentOrder -= 1
            }
          }
        }
      }
    }
  }

  if (minOrder < 0) increaseOrderForAllNodes(-minOrder)

  // Assign -1 to nodes unreachable from any track so all nodes have a defined order.
  // -1 acts as a sentinel: downstream code uses `order >= 0` to skip these nodes.
  nodeOrders.forEach((order, i) => {
    if (order === undefined) nodeOrders[i] = -1
  })

  // Copy computed orders back onto node objects.
  nodeOrders.forEach((order, i) => {
    const node = nodes[i]
    if (node !== undefined) node.order = order!
  })
}

function isSuccessor(first: number, second: number): boolean {
  const visited: boolean[] = new Array(numberOfNodes).fill(false)
  const stack: number[] = [first]
  visited[first] = true
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === second) return true
    for (let i = 0; i < nodes[current]!.successors.length; i += 1) {
      const childIndex = nodes[current]!.successors[i]!
      if (!visited[childIndex]) {
        visited[childIndex] = true
        stack.push(childIndex)
      }
    }
  }
  return false
}

// get order number of the rightmost node
function getMaxOrder(): number {
  let max = -1
  nodeOrders.forEach(order => {
    if (order !== undefined && order > max) max = order
  })
  return max
}

// generates sequence keeping the order but switching all reversed (negative) nodes to forward nodes
function uninvert(sequence: number[]): number[] {
  return sequence.map(v => Math.abs(v))
}

// increases the order-value of all nodes by amount
function increaseOrderForAllNodes(amount: number): void {
  nodeOrders.forEach((order, i) => {
    if (order !== undefined) nodeOrders[i] = order + amount
  })
}

// increases the order-value for currentNode and (if necessary) successor nodes recursively
function increaseOrderForSuccessors(
  startingNode: number,
  tabuNode: number,
  newOrder: number,
): void {
  const increasedOrders = new Map<number, number>()
  const queue: [number, number][] = [[startingNode, newOrder]]

  while (queue.length > 0) {
    const [currentNode, currentOrder] = queue.shift()!
    const currentNodeOrder = nodeOrders[currentNode]

    if (currentNodeOrder !== undefined && currentNodeOrder < currentOrder) {
      if (
        !increasedOrders.has(currentNode) ||
        increasedOrders.get(currentNode)! < currentOrder
      ) {
        increasedOrders.set(currentNode, currentOrder)
        nodes[currentNode]!.successors.forEach(successor => {
          if (
            nodeOrders[successor]! > currentNodeOrder &&
            successor !== tabuNode
          ) {
            // only increase order of successors to the right of currentNode
            queue.push([successor, currentOrder + 1])
          }
        })
        if (currentNode !== startingNode) {
          nodes[currentNode]!.predecessors.forEach(predecessor => {
            if (
              nodeOrders[predecessor]! > currentNodeOrder &&
              predecessor !== tabuNode
            ) {
              // only increase order of predecessors to the right of currentNode
              queue.push([predecessor, currentOrder + 1])
            }
          })
        }
      }
    }
  }

  increasedOrders.forEach((value, key) => {
    nodeOrders[key] = value
  })
}

// calculates the node degree: the number of tracks passing through the node / the node height
function generateNodeDegree(): void {
  nodes.forEach(node => {
    node.tracks = []
  })

  tracks.forEach(track => {
    track.indexSequence.forEach(nodeIndex => {
      nodes[Math.abs(nodeIndex)]!.tracks.push(track.id)
    })
  })

  nodes.forEach(node => {
    if (node.tracks !== undefined) node.degree = node.tracks.length
  })
}

// Optimize the orientations for nodes in the global `nodes` for displaying the
// paths in the global `tracks` and the read paths, if applicable, in the
// global `reads`
function switchNodeOrientation(): void {
  const pivotPath = tracks[0]!
  let countPaths = tracks.slice(1, tracks.length)
  if (config.showReads && reads.length > 0) {
    countPaths = countPaths.concat(reads)
  }
  switchNodeOrientationForPaths(countPaths, pivotPath)
  if (config.showReads && reads.length > 0) {
    // Any changes should be committed back
    for (let i = 0; i < reads.length; i++) {
      if (reads[i] !== countPaths[i + tracks.length - 1]) {
        throw new Error('Read inequality')
      }
    }
  }
}

// If more of the given paths pass through a specific node in reverse direction than in
// regular direction, switch its orientation. Processes all paths' nodes in
// place, so if you want e.g. a first track with nodes fixed in that
// orientation, pass it as pivotPath.
// References and modifies the global nodes variable.
function switchNodeOrientationForPaths(paths: Track[], pivotPath: Track | null): void {
  const toSwitch = new Map<string, number>()
  const pivotNames = pivotPath ? new Set(pivotPath.sequence) : null
  let nodeName: string
  let prevNode: LayoutNode | undefined
  let nextNode: LayoutNode | undefined
  let currentNode: LayoutNode

  for (let i = 0; i < paths.length; i += 1) {
    for (let j = 0; j < paths[i]!.sequence.length; j += 1) {
      nodeName = paths[i]!.sequence[j]!
      nodeName = forward(nodeName)
      currentNode = nodes[nodeMap.get(nodeName)!]!
      if (pivotNames && !pivotNames.has(nodeName)) {
        // do not change orientation for nodes which are part of the pivot path
        if (j > 0) {
          prevNode = nodes[nodeMap.get(forward(paths[i]!.sequence[j - 1]!))!]!
        }
        if (j < paths[i]!.sequence.length - 1) {
          nextNode = nodes[nodeMap.get(forward(paths[i]!.sequence[j + 1]!))!]!
        }
        if (
          (j === 0 || prevNode!.order < currentNode.order) &&
          (j === paths[i]!.sequence.length - 1 ||
            currentNode.order < nextNode!.order)
        ) {
          // Node is visited in increasing order along the path
          if (!toSwitch.has(nodeName)) toSwitch.set(nodeName, 0)
          if (isReverse(paths[i]!.sequence[j]!)) {
            // Node is reverse, so increment
            toSwitch.set(nodeName, toSwitch.get(nodeName)! + 1)
          } else {
            // Node is forward, so decrement
            toSwitch.set(nodeName, toSwitch.get(nodeName)! - 1)
          }
        }
        if (
          (j === 0 || prevNode!.order > currentNode.order) &&
          (j === paths[i]!.sequence.length - 1 ||
            currentNode.order > nextNode!.order)
        ) {
          // Node is visited in *decreasing* order along the path, so is already backward
          if (!toSwitch.has(nodeName)) toSwitch.set(nodeName, 0)
          if (isReverse(paths[i]!.sequence[j]!)) {
            // Node is reverse, so decrement
            toSwitch.set(nodeName, toSwitch.get(nodeName)! - 1)
          } else {
            // Node is forward, so increment
            toSwitch.set(nodeName, toSwitch.get(nodeName)! + 1)
          }
        }
      }
    }
  }

  paths.forEach((path, pathIndex) => {
    path.sequence.forEach((node, nodeIndex) => {
      nodeName = forward(node)
      if (toSwitch.has(nodeName) && toSwitch.get(nodeName)! > 0) {
        // This node is backward more so flip it around
        paths[pathIndex]!.sequence[nodeIndex] = flip(node)
        paths[pathIndex]!.indexSequence[nodeIndex] =
          -paths[pathIndex]!.indexSequence[nodeIndex]!
      }
    })
  })

  // invert the sequence within the nodes and mark them as "switched"
  toSwitch.forEach((value, key) => {
    if (value > 0) {
      const nodeIdx = nodeMap.get(key)!
      const newSeq = getReverseComplement(nodes[nodeIdx]!.seq)
      nodes[nodeIdx]!.seq = newSeq
      nodes[nodeIdx]!.switched = true
    }
  })
}

// calculates the concrete values for the nodes' x-coordinates
function generateNodeXCoords(): void {
  let currentX = 0
  let nextX = 20
  let currentOrder = -1
  const sortedNodes = nodes.slice()
  sortedNodes.sort(compareNodesByOrder)
  const extra = calculateExtraSpace()

  sortedNodes.forEach(node => {
    if (node.order >= 0) {
      if (node.order > currentOrder) {
        currentOrder = node.order
        currentX = nextX + 10 * extra[node.order]!
      }
      node.x = currentX
      nextX = Math.max(nextX, currentX + 40 + node.pixelWidth)
    }
  })
}

// calculates additional horizontal space needed between two nodes
// two neighboring nodes have to be moved further apart if there is a lot going on in between them
// -> edges turning to vertical orientation should not overlap
function calculateExtraSpace(): number[] {
  const leftSideEdges: number[] = []
  const rightSideEdges: number[] = []
  const fallAngleAdjustment: number[] = []
  const extra: number[] = []

  for (let i = 0; i <= maxOrder; i += 1) {
    leftSideEdges.push(0)
    rightSideEdges.push(0)
    fallAngleAdjustment.push(0)
  }

  tracks.forEach(track => {
    for (let i = 1; i < track.path.length; i += 1) {
      const seg = track.path[i]!
      const prevSeg = track.path[i - 1]!
      // Track is going to the same node, account for space taken up by edges looping around
      if (seg.order === prevSeg.order) {
        // repeat or translocation
        if (seg.isForward) {
          leftSideEdges[seg.order] = leftSideEdges[seg.order]! + 1
        } else {
          rightSideEdges[seg.order] = rightSideEdges[seg.order]! + 1
        }
      } else {
        // Track is going to a different node; account for space needed to limit rise/fall angle
        const yDifference = Math.abs((seg.y ?? 0) - (prevSeg.y ?? 0))
        //TODO: Extra space should also be accounted when there are too many tracks curving at the nodes
        fallAngleAdjustment[seg.order] = Math.max(
          yDifference / 17.5,
          fallAngleAdjustment[seg.order]!,
        )
      }
    }
  })

  extra.push(Math.max(0, leftSideEdges[0]! - 1))
  for (let i = 1; i <= maxOrder; i += 1) {
    // Extra space uses space needed for edges(tracks looping), or space needed to limit rise/fall angle, whichever is larger
    extra.push(
      Math.max(
        Math.max(0, leftSideEdges[i]! - 1) +
          Math.max(0, rightSideEdges[i - 1]! - 1),
        fallAngleAdjustment[i]!,
      ),
    )
  }
  return extra
}

// create and fill assignment-variable, which contains info about tracks and lanes for each order-value
function generateLaneAssignment(): void {
  let segmentNumber: number
  let currentNodeIndex: number
  let currentNodeIsForward: boolean
  let currentNode: LayoutNode
  let previousNode: LayoutNode
  let previousNodeIsForward: boolean
  // For each horizontal order slot, for each track number, holds the
  // SegmentAssignment object for the visit of that track to that order slot.
  // When an order slot is visited multiple times, holds whatever
  // SegmentAssignment was created most recently.
  const prevSegmentPerOrderPerTrack: (SegmentAssignment | null)[][] = []

  // create empty variables
  for (let i = 0; i <= maxOrder; i += 1) {
    assignments[i] = []
    prevSegmentPerOrderPerTrack[i] = []
    for (let j = 0; j < numberOfTracks; j += 1) {
      prevSegmentPerOrderPerTrack[i]![j] = null
    }
  }

  tracks.forEach((track, trackNo) => {
    // Trace along each track and create Segment objects in the track's path
    // field, and SegmentAssignment objects in NodeAssignment objects in all
    // the order slots that are visited by the track. Set up all the
    // cross-reverencing indexes and work out when we need segments to let
    // tracks pass nodes and turn around, but leave all the assigned lane
    // values empty for now.

    // add info for start of track
    currentNodeIndex = Math.abs(track.indexSequence[0]!)
    currentNodeIsForward = isForwardIndex(track.indexSequence[0]!)
    currentNode = nodes[currentNodeIndex]!

    track.path = []
    track.path.push({
      order: currentNode.order,
      lane: null,
      isForward: currentNodeIsForward,
      node: currentNodeIndex,
    })
    addToAssignment(
      currentNode.order,
      currentNodeIndex,
      trackNo,
      0,
      prevSegmentPerOrderPerTrack,
    )

    segmentNumber = 1
    for (let i = 1; i < track.sequence.length; i += 1) {
      previousNode = currentNode
      previousNodeIsForward = currentNodeIsForward

      currentNodeIndex = Math.abs(track.indexSequence[i]!)
      currentNodeIsForward = isForwardIndex(track.indexSequence[i]!)
      currentNode = nodes[currentNodeIndex]!

      if (currentNode.order > previousNode.order) {
        if (!previousNodeIsForward) {
          // backward to forward at previous node
          track.path.push({
            order: previousNode.order,
            lane: null,
            isForward: true,
            node: null,
          })
          addToAssignment(
            previousNode.order,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
        for (let j = previousNode.order + 1; j < currentNode.order; j += 1) {
          // forward without nodes
          track.path.push({
            order: j,
            lane: null,
            isForward: true,
            node: null,
          })
          addToAssignment(
            j,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
        if (!currentNodeIsForward) {
          // forward to backward at current node
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: true,
            node: null,
          })
          addToAssignment(
            currentNode.order,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: false,
            node: currentNodeIndex,
          })
          addToAssignment(
            currentNode.order,
            currentNodeIndex,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        } else {
          // current Node forward
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: true,
            node: currentNodeIndex,
          })
          addToAssignment(
            currentNode.order,
            currentNodeIndex,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
      } else if (currentNode.order < previousNode.order) {
        if (previousNodeIsForward) {
          // turnaround from fw to bw at previous node
          track.path.push({
            order: previousNode.order,
            lane: null,
            isForward: false,
            node: null,
          })
          addToAssignment(
            previousNode.order,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
        for (let j = previousNode.order - 1; j > currentNode.order; j -= 1) {
          // bachward without nodes
          track.path.push({
            order: j,
            lane: null,
            isForward: false,
            node: null,
          })
          addToAssignment(
            j,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
        if (currentNodeIsForward) {
          // backward to forward at current node
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: false,
            node: null,
          })
          addToAssignment(
            currentNode.order,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: true,
            node: currentNodeIndex,
          })
          addToAssignment(
            currentNode.order,
            currentNodeIndex,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        } else {
          // backward at current node
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: false,
            node: currentNodeIndex,
          })
          addToAssignment(
            currentNode.order,
            currentNodeIndex,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
      } else {
        if (currentNodeIsForward !== previousNodeIsForward) {
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: currentNodeIsForward,
            node: currentNodeIndex,
          })
          addToAssignment(
            currentNode.order,
            currentNodeIndex,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        } else {
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: !currentNodeIsForward,
            node: null,
          })
          addToAssignment(
            currentNode.order,
            null,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
          track.path.push({
            order: currentNode.order,
            lane: null,
            isForward: currentNodeIsForward,
            node: currentNodeIndex,
          })
          addToAssignment(
            currentNode.order,
            currentNodeIndex,
            trackNo,
            segmentNumber,
            prevSegmentPerOrderPerTrack,
          )
          segmentNumber += 1
        }
      }
    }
  })

  // Now sweep left to right across order slots and assign vertical lanes to all the segments.
  for (let i = 0; i <= maxOrder; i += 1) {
    generateSingleLaneAssignment(assignments[i]!, i) // this is where the lanes get assigned
  }
}

function addToAssignment(
  order: number,
  nodeIndex: number | null,
  trackNo: number,
  segmentID: number,
  prevSegmentPerOrderPerTrack: (SegmentAssignment | null)[][],
): void {
  const compareToFromSame = prevSegmentPerOrderPerTrack[order]![trackNo] ?? null

  if (nodeIndex === null) {
    assignments[order]!.push({
      type: 'single',
      node: null,
      tracks: [{ trackID: trackNo, segmentID, compareToFromSame }],
    })
    prevSegmentPerOrderPerTrack[order]![trackNo] =
      assignments[order]![assignments[order]!.length - 1]!.tracks[0]!
  } else {
    for (let i = 0; i < assignments[order]!.length; i += 1) {
      if (assignments[order]![i]!.node === nodeIndex) {
        // add to existing node in assignment
        assignments[order]![i]!.type = 'multiple'
        assignments[order]![i]!.tracks.push({
          trackID: trackNo,
          segmentID,
          compareToFromSame,
        })
        prevSegmentPerOrderPerTrack[order]![trackNo] =
          assignments[order]![i]!.tracks[assignments[order]![i]!.tracks.length - 1]!
        return
      }
    }
    // create new node in assignment
    assignments[order]!.push({
      type: 'single',
      node: nodeIndex,
      tracks: [{ trackID: trackNo, segmentID, compareToFromSame }],
    })
    prevSegmentPerOrderPerTrack[order]![trackNo] =
      assignments[order]![assignments[order]!.length - 1]!.tracks[0]!
  }
}

// looks at assignment and sets idealY and idealLane by looking at where the tracks come from
function getIdealLanesAndCoords(assignment: NodeAssignment[], order: number): void {
  let index: number

  assignment.forEach(node => {
    node.idealLane = 0
    node.tracks.forEach(track => {
      if (track.segmentID === 0) {
        track.idealLane = track.trackID
        track.idealY = null
      } else {
        if (
          tracks[track.trackID]!.path[track.segmentID - 1]!.order ===
          order - 1
        ) {
          track.idealLane = tracks[track.trackID]!.path[track.segmentID - 1]!.lane ?? undefined
          track.idealY = tracks[track.trackID]!.path[track.segmentID - 1]!.y
        } else if (
          track.segmentID < tracks[track.trackID]!.path.length - 1 &&
          tracks[track.trackID]!.path[track.segmentID + 1]!.order === order - 1
        ) {
          track.idealLane = tracks[track.trackID]!.path[track.segmentID + 1]!.lane ?? undefined
          track.idealY = tracks[track.trackID]!.path[track.segmentID + 1]!.y
        } else {
          index = track.segmentID - 1
          while (
            index >= 0 &&
            tracks[track.trackID]!.path[index]!.order !== order - 1
          ) {
            index -= 1
          }
          if (index < 0) {
            track.idealLane = track.trackID
            track.idealY = null
          } else {
            track.idealLane = tracks[track.trackID]!.path[index]!.lane ?? undefined
            track.idealY = tracks[track.trackID]!.path[index]!.y
          }
        }
      }
      node.idealLane! += track.idealLane!
    })
    node.idealLane /= node.tracks.length
  })
}

// assigns the optimal lanes for a single horizontal position (=order)
// first an ideal lane is calculated for each track (which is ~ the lane of its predecessor)
// then the nodes are sorted by their average ideal lane
// and the whole construct is then moved up or down if necessary
function generateSingleLaneAssignment(assignment: NodeAssignment[], order: number): void {
  let currentLane = 0
  const potentialAdjustmentValues = new Set<number>()
  let currentY = 20
  let prevNameIsNull = false
  let prevTrack = -1

  getIdealLanesAndCoords(assignment, order)
  assignment.sort(compareByIdealLane)

  assignment.forEach(node => {
    if (node.node !== null) {
      nodes[node.node]!.topLane = currentLane
      if (prevNameIsNull) currentY -= 10
      nodes[node.node]!.y = currentY
      nodes[node.node]!.contentHeight = 0
      prevNameIsNull = false
    } else {
      if (prevNameIsNull) currentY -= 25
      else if (currentY > 20) currentY -= 10
      prevNameIsNull = true
    }

    node.tracks.sort(compareByIdealLane)
    node.tracks.forEach(track => {
      track.lane = currentLane
      if (track.trackID === prevTrack && node.node === null && prevNameIsNull) {
        currentY += 10
      }
      tracks[track.trackID]!.path[track.segmentID]!.lane = currentLane
      tracks[track.trackID]!.path[track.segmentID]!.y = currentY
      if (track.idealY != null) {
        potentialAdjustmentValues.add(track.idealY - currentY)
      }
      currentLane += 1
      currentY += tracks[track.trackID]!.width
      if (node.node !== null) {
        nodes[node.node]!.contentHeight += tracks[track.trackID]!.width
      }
      prevTrack = track.trackID
    })
    currentY += 25
  })

  adjustVertically(assignment, potentialAdjustmentValues)
}

// moves all tracks at a single horizontal location (=order) up/down to minimize lane changes
function adjustVertically(assignment: NodeAssignment[], potentialAdjustmentValues: Set<number>): void {
  let verticalAdjustment = 0
  let minAdjustmentCost = Number.MAX_SAFE_INTEGER

  potentialAdjustmentValues.forEach(moveBy => {
    if (getVerticalAdjustmentCost(assignment, moveBy) < minAdjustmentCost) {
      minAdjustmentCost = getVerticalAdjustmentCost(assignment, moveBy)
      verticalAdjustment = moveBy
    }
  })

  assignment.forEach(node => {
    if (node.node !== null) {
      nodes[node.node]!.y += verticalAdjustment
    }
    node.tracks.forEach(track => {
      const seg = tracks[track.trackID]!.path[track.segmentID]!
      seg.y = seg.y! + verticalAdjustment
    })
  })
}

// Budge down all nodes and out-of-node tracks below this node by this amount
function adjustVertically3(node: LayoutNode, adjustBy: number): void {
  if (node.order < 0 || assignments[node.order] === undefined) return
  assignments[node.order]!.forEach(assignmentNode => {
    if (assignmentNode.node !== null) {
      const aNode = nodes[assignmentNode.node]!
      if (aNode !== node && aNode.y > node.y) {
        aNode.y += adjustBy
        assignmentNode.tracks.forEach(track => {
          const seg = tracks[track.trackID]!.path[track.segmentID]!
          seg.y = seg.y! + adjustBy
        })
      }
    } else {
      // track-segment not within a node
      assignmentNode.tracks.forEach(track => {
        const seg = tracks[track.trackID]!.path[track.segmentID]!
        if (seg.y! >= node.y) {
          seg.y = seg.y! + adjustBy
        }
      })
    }
  })
  if (nodesPerOrder[node.order]!.length > 0) {
    nodesPerOrder[node.order]!.forEach(nodeIndex => {
      if (nodes[nodeIndex] !== node && nodes[nodeIndex]!.y > node.y) {
        nodes[nodeIndex]!.y += adjustBy
      }
    })
  }
}

// calculates cost of vertical adjustment as vertical distance * width of track
function getVerticalAdjustmentCost(assignment: NodeAssignment[], moveBy: number): number {
  let result = 0
  assignment.forEach(node => {
    node.tracks.forEach(track => {
      if (track.idealY != null && tracks[track.trackID]!.type !== 'read') {
        result +=
          Math.abs(
            track.idealY -
              moveBy -
              tracks[track.trackID]!.path[track.segmentID]!.y!,
          ) * tracks[track.trackID]!.width
      }
    })
  })
  return result
}

function compareByIdealLane(
  a: { idealLane?: number },
  b: { idealLane?: number },
): number {
  if (a.idealLane !== undefined) {
    if (b.idealLane !== undefined) {
      if (a.idealLane < b.idealLane) return -1
      else if (a.idealLane > b.idealLane) return 1
      return 0
    }
    return -1
  }
  if (b.idealLane !== undefined) {
    return 1
  }
  return 0
}

function compareNodesByOrder(
  a: { order?: number; y?: number } | null | undefined,
  b: { order?: number; y?: number } | null | undefined,
): number {
  if (!a) {
    if (!b) return 0
    return -1
  }
  if (!b) return 1

  if (a.order !== undefined) {
    if (b.order !== undefined) {
      if (a.order < b.order) return -1
      else if (a.order > b.order) return 1
      if (a.y !== undefined && b.y !== undefined) {
        if (a.y < b.y) return -1
        else if (a.y > b.y) return 1
      }
      return 0
    }
    return -1
  }
  if (b.order !== undefined) return 1
  return 0
}

function addTrackFeatures(): void {
  let nodeStart: number
  let nodeEnd: number
  let feature: TrackFeature = {}

  bed!.forEach(line => {
    let i = 0
    while (i < numberOfTracks && tracks[i]!.name !== line.track) i += 1
    if (i < numberOfTracks) {
      nodeStart = 0
      tracks[i]!.path.forEach(node => {
        if (node.node !== null) {
          feature = {}
          if (nodes[node.node]!.sequenceLength !== undefined) {
            nodeEnd = nodeStart + nodes[node.node]!.sequenceLength! - 1
          } else {
            nodeEnd = nodeStart + nodes[node.node]!.width - 1
          }

          if (nodeStart >= line.start && nodeStart <= line.end) {
            feature.start = 0
          }
          if (nodeStart < line.start && nodeEnd >= line.start) {
            feature.start = line.start - nodeStart
          }
          if (nodeEnd <= line.end && nodeEnd >= line.start) {
            feature.end = nodeEnd - nodeStart
            if (nodeEnd < line.end) feature.continue = true
          }
          if (nodeEnd > line.end && nodeStart <= line.end) {
            feature.end = line.end - nodeStart
          }
          if (feature.start !== undefined) {
            feature.type = line.type
            feature.name = line.name
            if (node.features === undefined) node.features = []
            node.features.push(feature)
          }
          nodeStart = nodeEnd + 1
        }
      })
    }
  })
}

function calculateTrackWidth(): void {
  // flag: if vg returns freq of 0 for all tracks, we will increase width manually
  let allAreFour = true

  const NARROW_WIDTH = 4
  const WIDE_WIDTH = 15

  tracks.forEach(track => {
    if (track.freq !== undefined) {
      // custom track width
      track.width = Math.round((Math.log(track.freq) + 1) * NARROW_WIDTH)
    } else {
      // default track width
      track.width = WIDE_WIDTH
      if (track.type !== undefined && track.type === 'read') {
        track.width = NARROW_WIDTH
      }
    }
    if (track.width !== NARROW_WIDTH) {
      allAreFour = false
    }
  })

  if (allAreFour) {
    tracks.forEach(track => {
      if (track.freq !== undefined) {
        track.width = WIDE_WIDTH
      }
    })
  }
}

function getColorSet(colorSetName: string | undefined): readonly string[] {
  if (!colorSetName) return greys
  // single color hex
  if (colorSetName.startsWith('#')) {
    return [colorSetName]
  }

  // set of color hexes
  switch (colorSetName) {
    case 'plainColors':
      return plainColors
    case 'reds':
      return reds
    case 'blues':
      return blues
    case 'greys':
      return greys
    case 'ygreys':
      return ygreys
    case 'lightColors':
      return lightColors
    default:
      return greys
  }
}

function generateTrackColor(track: Track, highlight?: string): string {
  if (typeof highlight === 'undefined') highlight = 'plain'
  let trackColor: string

  const sourceID = track.sourceTrackID
  if (!config.colorSchemes[sourceID]) {
    config.colorSchemes[sourceID] = defaultTrackColors(track.type!)
  }

  if (track.type !== undefined && track.type === 'read') {
    // Custom group coloring: last group wins on overlap. A group's color
    // can be a single hex (#rrggbb) or a palette name; getColorSet handles
    // both and we stagger across reads in the group via track.id.
    for (let i = config.readGroups.length - 1; i >= 0; i--) {
      if (config.readGroups[i]!.reads.has(track.name!)) {
        const groupColors = getColorSet(config.readGroups[i]!.color)
        return groupColors[track.id % groupColors.length]!
      }
    }
    // When any group is active, every read is colored through the group
    // system — ungrouped reads use otherReadsColor so strand/palette and
    // group-based coloring don't fight each other on screen.
    if (config.readGroups.length > 0) {
      const otherColors = getColorSet(config.otherReadsColor)
      return otherColors[track.id % otherColors.length]!
    }
    if (config.colorSchemes[sourceID].colorReadsByMappingQuality) {
      trackColor = d3.interpolateRdYlGn(
        Math.min(60, track.mapping_quality!) / 60,
      )
    } else {
      if (track.is_reverse !== undefined && track.is_reverse) {
        // get the color currently stored for this read source file, and stagger color using modulo
        const colorSet = getColorSet(config.colorSchemes[sourceID].auxPalette)
        trackColor = colorSet[track.id % colorSet.length]!
      } else {
        const colorSet = getColorSet(config.colorSchemes[sourceID].mainPalette)
        trackColor = colorSet[track.id % colorSet.length]!
      }
    }
  } else {
    if (!config.showExonsFlag || highlight !== 'plain') {
      // Don't repeat the color of the first track (reference) to highlight is better.
      // TODO: Allow using color 0 for other schemes not the same as the one for the reference path.
      // TODO: Stop reads from taking this color?
      const auxColorSet = getColorSet(config.colorSchemes[sourceID].auxPalette)
      const primaryColorSet = getColorSet(
        config.colorSchemes[sourceID].mainPalette,
      )
      if (track.id === 0) {
        trackColor = primaryColorSet[0]!
      } else {
        trackColor = auxColorSet[(track.id - 1) % auxColorSet.length]!
      }
    } else {
      const colorSet = getColorSet(config.exonColors)
      trackColor = colorSet[track.id % colorSet.length]!
    }
  }
  return trackColor
}

function generateTrackAlpha(track: Track, highlight?: string): number {
  if (typeof highlight === 'undefined') highlight = 'plain'
  let trackAlpha = 1

  const sourceID = track.sourceTrackID
  if (track.type !== undefined && track.type === 'read') {
    if (config.colorSchemes[sourceID]!.alphaReadsByMappingQuality) {
      trackAlpha = 0.1 + 0.9 * (Math.min(60, track.mapping_quality!) / 60)
    }
  }
  return trackAlpha
}

function getReadXStart(read: Track): number | null {
  const seg = read.path[0]!
  const node = nodes[seg.node!]!
  if (seg.isForward) {
    // read starts in forward direction
    return getXCoordinateOfBaseWithinNode(node, read.firstNodeOffset!)
  }
  // read starts in backward direction
  return getXCoordinateOfBaseWithinNode(
    node,
    node.sequenceLength! - read.firstNodeOffset!,
  )
}

function getReadXEnd(read: Track): number | null {
  const seg = read.path[read.path.length - 1]!
  const node = nodes[seg.node!]!
  if (seg.isForward) {
    // read ends in forward direction
    return getXCoordinateOfBaseWithinNode(node, read.finalNodeCoverLength!)
  }
  // read ends in backward direction
  return getXCoordinateOfBaseWithinNode(
    node,
    node.sequenceLength! - read.finalNodeCoverLength!,
  )
}

// returns the x coordinate (in pixels) of (the left side) of the given base
// position within the given node
function getXCoordinateOfBaseWithinNode(node: Node, base: number): number | null {
  if (base > node.sequenceLength!) return null // equality is allowed
  const [nodeLeftX, nodeRightX] = nodePixelCoordinatesInX(node)
  return nodeLeftX + (base / node.sequenceLength!) * (nodeRightX - nodeLeftX)
}

// transforms the info in the tracks' path attribute into actual coordinates
// and saves them in trackRectangles and trackCurves
function generateSVGShapesFromPath(): void {
  let xStart: number
  let xEnd: number
  let yStart: number
  let yEnd: number
  let trackColor: string
  let trackAlpha: number
  let highlight: string
  let dummy: { highlight: string; xStart: number }
  let reversalFlag: boolean

  for (let i = 0; i <= maxOrder; i += 1) {
    extraLeft.push(0)
    extraRight.push(0)
  }

  // generate x coords where each order starts and ends
  const orderStartX: number[] = []
  const orderEndX: number[] = []
  nodes.forEach(node => {
    if (node.x !== undefined) {
      orderStartX[node.order] = node.x
      if (orderEndX[node.order] === undefined) {
        orderEndX[node.order] = node.x + node.pixelWidth
      } else {
        orderEndX[node.order] = Math.max(
          orderEndX[node.order]!,
          node.x + node.pixelWidth,
        )
      }
    }
  })

  // Helps generation of verticalRectangles, correct increments of extraRight and extraLeft
  tracks.sort(compareTrackByInitialOrdering)

  tracks.forEach(track => {
    highlight = 'plain'
    trackColor = generateTrackColor(track, highlight)
    trackAlpha = generateTrackAlpha(track, highlight)

    // start of path
    yStart = track.path[0]!.y!
    if (track.type !== 'read') {
      if (track.sequence[0]!.startsWith('-')) {
        // The track starts with an inversed node
        xStart = orderEndX[track.path[0]!.order]! + 20
      } else {
        // The track starts with a forward node
        xStart = orderStartX[track.path[0]!.order]! - 20
      }
    } else {
      xStart = getReadXStart(track) ?? 0
    }

    // middle of path
    for (let i = 0; i < track.path.length; i += 1) {
      if (track.path[i]!.y! === yStart) {
        if (track.path[i]!.features !== undefined) {
          reversalFlag =
            i > 0 && track.path[i - 1]!.order === track.path[i]!.order
          dummy = createFeatureRectangle(
            track.path[i]!,
            orderStartX[track.path[i]!.order]!,
            orderEndX[track.path[i]!.order]!,
            highlight,
            track,
            xStart,
            yStart,
            trackColor,
            reversalFlag,
          )
          highlight = dummy.highlight
          xStart = dummy.xStart
        }
      } else {
        if (track.path[i - 1]!.isForward) {
          xEnd = orderEndX[track.path[i - 1]!.order]!
        } else {
          xEnd = orderStartX[track.path[i - 1]!.order]!
        }
        if (xEnd !== xStart) {
          trackColor = generateTrackColor(track, highlight)
          trackAlpha = generateTrackAlpha(track, highlight)
          trackRectangles.push({
            xStart: Math.min(xStart, xEnd),
            yStart,
            xEnd: Math.max(xStart, xEnd),
            yEnd: yStart + track.width - 1,
            color: trackColor,
            alpha: trackAlpha,
            // TODO: This is not actually the index of the track!
            id: track.id,
            name: track.name,
            type: track.type,
          })
        }

        if (track.path[i]!.order - 1 === track.path[i - 1]!.order) {
          // regular forward connection
          xStart = xEnd
          xEnd = orderStartX[track.path[i]!.order]!
          yEnd = track.path[i]!.y!
          trackColor = generateTrackColor(track, highlight)
          trackAlpha = generateTrackAlpha(track, highlight)
          trackCurves.push({
            xStart,
            yStart,
            xEnd: xEnd + 1,
            yEnd,
            width: track.width,
            color: trackColor,
            alpha: trackAlpha,
            laneChange: Math.abs(track.path[i]!.lane! - track.path[i - 1]!.lane!),
            id: track.id,
            name: track.name,
            type: track.type,
            nodeStart: track.path[i - 1]?.node,
            nodeEnd: track.path[i]?.node,
          })
          xStart = xEnd
          yStart = yEnd
        } else if (track.path[i]!.order + 1 === track.path[i - 1]!.order) {
          // regular backward connection
          xStart = xEnd
          xEnd = orderEndX[track.path[i]!.order]!
          yEnd = track.path[i]!.y!
          trackColor = generateTrackColor(track, highlight)
          trackAlpha = generateTrackAlpha(track, highlight)
          trackCurves.push({
            xStart: xStart + 1,
            yStart,
            xEnd,
            yEnd,
            width: track.width,
            color: trackColor,
            alpha: trackAlpha,
            laneChange: Math.abs(track.path[i]!.lane! - track.path[i - 1]!.lane!),
            id: track.id,
            name: track.name,
            type: track.type,
            nodeStart: track.path[i - 1]?.node,
            nodeEnd: track.path[i]?.node,
          })
          xStart = xEnd
          yStart = yEnd
        } else {
          // change of direction
          if (track.path[i - 1]!.isForward) {
            yEnd = track.path[i]!.y!
            generateForwardToReverse(
              xEnd,
              yStart,
              yEnd,
              track.width,
              trackColor,
              track.id,
              track.path[i]!.order,
              track.type,
              track.name,
            )
            xStart = orderEndX[track.path[i]!.order]!
            yStart = track.path[i]!.y!
          } else {
            yEnd = track.path[i]!.y!
            generateReverseToForward(
              xEnd,
              yStart,
              yEnd,
              track.width,
              trackColor,
              track.id,
              track.path[i]!.order,
              track.type,
              track.name,
            )
            xStart = orderStartX[track.path[i]!.order]!
            yStart = track.path[i]!.y!
          }
        }

        if (track.path[i]!.features !== undefined) {
          reversalFlag = track.path[i - 1]!.order === track.path[i]!.order
          dummy = createFeatureRectangle(
            track.path[i]!,
            orderStartX[track.path[i]!.order]!,
            orderEndX[track.path[i]!.order]!,
            highlight,
            track,
            xStart,
            yStart,
            trackColor,
            reversalFlag,
          )
          highlight = dummy.highlight
          xStart = dummy.xStart
        }
      }
    }

    // ending edges
    if (track.type !== 'read') {
      if (!track.path[track.path.length - 1]!.isForward) {
        // The track ends with an inversed node
        xEnd = orderStartX[track.path[track.path.length - 1]!.order]! - 20
      } else {
        // The track ends with a forward node
        xEnd = orderEndX[track.path[track.path.length - 1]!.order]! + 20
      }
    } else {
      xEnd = getReadXEnd(track) ?? 0
    }
    trackRectangles.push({
      xStart: Math.min(xStart, xEnd),
      yStart,
      xEnd: Math.max(xStart, xEnd),
      yEnd: yStart + track.width - 1,
      color: trackColor,
      alpha: trackAlpha,
      id: track.id,
      name: track.name,
      type: track.type,
    })
  })
}

function createFeatureRectangle(
  node: Segment,
  nodeXStart: number,
  nodeXEnd: number,
  highlight: string,
  track: Track,
  rectXStart: number,
  yStart: number,
  trackColor: string,
  reversalFlag: boolean,
): { highlight: string; xStart: number } {
  let nodeWidth: number
  let currentHighlight: string = highlight
  let c: string
  let co: string
  let featureXStart: number
  let featureXEnd: number

  nodeXStart -= 8
  nodeXEnd += 8
  if (nodes[node.node!]!.sequenceLength !== undefined) {
    nodeWidth = nodes[node.node!]!.sequenceLength!
  } else {
    nodeWidth = nodes[node.node!]!.width
  }

  node.features!.sort((a, b) => a.start! - b.start!)
  node.features!.forEach(feature => {
    if (currentHighlight !== feature.type) {
      // finish incoming rectangle
      c = generateTrackColor(track, currentHighlight)
      if (node.isForward) {
        featureXStart =
          nodeXStart +
          Math.round((feature.start! * (nodeXEnd - nodeXStart + 1)) / nodeWidth)

        // overwrite narrow post-inversion rectangle if highlight starts near beginning of node
        if (reversalFlag && featureXStart < nodeXStart + 8) {
          featureXEnd =
            nodeXStart +
            Math.round(
              ((feature.end! + 1) * (nodeXEnd - nodeXStart + 1)) / nodeWidth,
            ) -
            1
          co = generateTrackColor(track, feature.type)
          trackRectanglesStep3.push({
            xStart: featureXStart,
            yStart,
            xEnd: featureXEnd,
            yEnd: yStart + track.width - 1,
            color: co,
            id: track.id,
            name: track.name,
            type: track.type,
          })
        }

        if (featureXStart > rectXStart + 1) {
          trackRectanglesStep3.push({
            xStart: rectXStart,
            yStart,
            xEnd: featureXStart - 1,
            yEnd: yStart + track.width - 1,
            color: c,
            id: track.id,
            name: track.name,
            type: track.type,
          })
        }
      } else {
        featureXStart =
          nodeXEnd -
          Math.round((feature.start! * (nodeXEnd - nodeXStart + 1)) / nodeWidth)

        // overwrite narrow post-inversion rectangle if highlight starts near beginning of node
        if (reversalFlag && featureXStart > nodeXEnd - 8) {
          featureXEnd =
            nodeXEnd -
            Math.round(
              ((feature.end! + 1) * (nodeXEnd - nodeXStart + 1)) / nodeWidth,
            ) -
            1
          co = generateTrackColor(track, feature.type)
          trackRectanglesStep3.push({
            xStart: featureXEnd,
            yStart,
            xEnd: featureXStart,
            yEnd: yStart + track.width - 1,
            color: co,
            id: track.id,
            name: track.name,
            type: track.type,
          })
        }

        if (rectXStart > featureXStart + 1) {
          trackRectanglesStep3.push({
            xStart: featureXStart + 1,
            yStart,
            xEnd: rectXStart,
            yEnd: yStart + track.width - 1,
            color: c,
            id: track.id,
            name: track.name,
            type: track.type,
          })
        }
      }
      rectXStart = featureXStart
      currentHighlight = feature.type!
    }
    if (feature.end! < nodeWidth - 1 || feature.continue === undefined) {
      // finish internal rectangle
      c = generateTrackColor(track, currentHighlight)
      if (node.isForward) {
        featureXEnd =
          nodeXStart +
          Math.round(
            ((feature.end! + 1) * (nodeXEnd - nodeXStart + 1)) / nodeWidth,
          ) -
          1
        trackRectanglesStep3.push({
          xStart: rectXStart,
          yStart,
          xEnd: featureXEnd,
          yEnd: yStart + track.width - 1,
          color: c,
          id: track.id,
          name: track.name,
          type: track.type,
        })
      } else {
        featureXEnd =
          nodeXEnd -
          Math.round(
            ((feature.end! + 1) * (nodeXEnd - nodeXStart + 1)) / nodeWidth,
          ) -
          1
        trackRectanglesStep3.push({
          xStart: featureXEnd,
          yStart,
          xEnd: rectXStart,
          yEnd: yStart + track.width - 1,
          color: c,
          id: track.id,
          name: track.name,
          type: track.type,
        })
      }
      rectXStart = featureXEnd + 1
      currentHighlight = 'plain'
    }
  })
  return { xStart: rectXStart, highlight: currentHighlight }
}

const MIN_BEND_WIDTH = 7

function generateForwardToReverse(
  x: number,
  yStart: number,
  yEnd: number,
  trackWidth: number,
  trackColor: string,
  trackID: number,
  order: number,
  type: TrackType | undefined,
  trackName: string | undefined,
): void {
  x += 10 * extraRight[order]!
  const yTop = Math.min(yStart, yEnd)
  const yBottom = Math.max(yStart, yEnd)
  const radius = MIN_BEND_WIDTH

  trackVerticalRectangles.push({
    // elongate incoming rectangle a bit to the right
    xStart: x - 10 * extraRight[order]!,
    yStart,
    xEnd: x + 5,
    yEnd: yStart + trackWidth - 1,
    color: trackColor,
    id: trackID,
    name: trackName,
    type,
  })
  trackVerticalRectangles.push({
    // vertical rectangle
    xStart: x + 5 + radius,
    yStart: yTop + trackWidth + radius - 1,
    xEnd: x + 5 + radius + Math.min(MIN_BEND_WIDTH, trackWidth) - 1,
    yEnd: yBottom - radius + 1,
    color: trackColor,
    id: trackID,
    name: trackName,
    type,
  })
  trackVerticalRectangles.push({
    xStart: x - 10 * extraRight[order]!,
    yStart: yEnd,
    xEnd: x + 5,
    yEnd: yEnd + trackWidth - 1,
    color: trackColor,
    id: trackID,
    name: trackName,
    type,
  }) // elongate outgoing rectangle a bit to the right

  let d = `M ${x + 5} ${yBottom}`
  d += ` Q ${x + 5 + radius} ${yBottom} ${x + 5 + radius} ${yBottom - radius}`
  d += ` H ${x + 5 + radius + Math.min(MIN_BEND_WIDTH, trackWidth)}`
  d += ` Q ${x + 5 + radius + Math.min(MIN_BEND_WIDTH, trackWidth)} ${
    yBottom + trackWidth
  } ${x + 5} ${yBottom + trackWidth}`
  d += ' Z '
  trackCorners.push({ path: d, color: trackColor, id: trackID, type })

  d = `M ${x + 5} ${yTop}`
  d += ` Q ${x + 5 + radius + Math.min(MIN_BEND_WIDTH, trackWidth)} ${yTop} ${
    x + 5 + radius + Math.min(MIN_BEND_WIDTH, trackWidth)
  } ${yTop + trackWidth + radius}`
  d += ` H ${x + 5 + radius}`
  d += ` Q ${x + 5 + radius} ${yTop + trackWidth} ${x + 5} ${yTop + trackWidth}`
  d += ' Z '
  trackCorners.push({ path: d, color: trackColor, id: trackID, type })
  extraRight[order]! += 1
}

function generateReverseToForward(
  x: number,
  yStart: number,
  yEnd: number,
  trackWidth: number,
  trackColor: string,
  trackID: number,
  order: number,
  type: TrackType | undefined,
  trackName: string | undefined,
): void {
  const yTop = Math.min(yStart, yEnd)
  const yBottom = Math.max(yStart, yEnd)
  const radius = MIN_BEND_WIDTH
  x -= 10 * extraLeft[order]!

  trackVerticalRectangles.push({
    xStart: x - 6,
    yStart,
    xEnd: x + 10 * extraLeft[order]!,
    yEnd: yStart + trackWidth - 1,
    color: trackColor,
    id: trackID,
    name: trackName,
    type,
  }) // elongate incoming rectangle a bit to the left
  trackVerticalRectangles.push({
    xStart: x - 5 - radius - Math.min(MIN_BEND_WIDTH, trackWidth),
    yStart: yTop + trackWidth + radius - 1,
    xEnd: x - 5 - radius - 1,
    yEnd: yBottom - radius + 1,
    color: trackColor,
    id: trackID,
    name: trackName,
    type,
  }) // vertical rectangle
  trackVerticalRectangles.push({
    xStart: x - 6,
    yStart: yEnd,
    xEnd: x + 10 * extraLeft[order]!,
    yEnd: yEnd + trackWidth - 1,
    color: trackColor,
    id: trackID,
    name: trackName,
    type,
  }) // elongate outgoing rectangle a bit to the left

  // Path for bottom 90 degree bend
  let d = `M ${x - 5} ${yBottom}`
  d += ` Q ${x - 5 - radius} ${yBottom} ${x - 5 - radius} ${yBottom - radius}`
  d += ` H ${x - 5 - radius - Math.min(MIN_BEND_WIDTH, trackWidth)}`
  d += ` Q ${x - 5 - radius - Math.min(MIN_BEND_WIDTH, trackWidth)} ${
    yBottom + trackWidth
  } ${x - 5} ${yBottom + trackWidth}`
  d += ' Z '
  trackCorners.push({ path: d, color: trackColor, id: trackID, type })

  // Path for top 90 degree bend
  d = `M ${x - 5} ${yTop}`
  d += ` Q ${x - 5 - radius - Math.min(MIN_BEND_WIDTH, trackWidth)} ${yTop} ${
    x - 5 - radius - Math.min(MIN_BEND_WIDTH, trackWidth)
  } ${yTop + trackWidth + radius}`
  d += ` H ${x - 5 - radius}`
  d += ` Q ${x - 5 - radius} ${yTop + trackWidth} ${x - 5} ${yTop + trackWidth}`
  d += ' Z '
  trackCorners.push({ path: d, color: trackColor, id: trackID, type })
  extraLeft[order]! += 1
}

// to avoid problems with wrong overlapping of tracks, draw them in order of their color
function drawReversalsByColor(
  corners: TrackCorner[],
  rectangles: TrackRectangle[],
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  const co = new Set<string>()
  rectangles.forEach(rect => {
    co.add(rect.color)
  })
  co.forEach(c => {
    drawTrackRectangles(
      rectangles.filter(filterObjectByAttribute('color', c)),
      type,
      groupTrack,
    )
    drawTrackCorners(
      corners.filter(filterObjectByAttribute('color', c)),
      type,
      groupTrack,
    )
  })
}

// draws nodes by building svg-path for border and filling it with transparent white

function drawNodes(dNodes: Node[], groupNode: SvgGroupSelection): void {
  let x
  let y

  dNodes.forEach(node => {
    // top left arc
    node.d = `M ${node.x - 9} ${node.y} Q ${node.x - 9} ${node.y - 9} ${
      node.x
    } ${node.y - 9}`
    x = node.x
    y = node.y - 9

    // top straight
    if (node.width > 1) {
      x += node.pixelWidth
      node.d += ` L ${x} ${y}`
    }

    // top right arc
    node.d += ` Q ${x + 9} ${y} ${x + 9} ${y + 9}`
    x += 9
    y += 9

    // right straight
    if (node.contentHeight > 0) {
      y += node.contentHeight - 0
      node.d += ` L ${x} ${y}`
    }

    // bottom right arc
    node.d += ` Q ${x} ${y + 9} ${x - 9} ${y + 9}`
    x -= 9
    y += 9

    // bottom straight
    if (node.width > 1) {
      x -= node.pixelWidth
      node.d += ` L ${x} ${y}`
    }

    // bottom left arc
    node.d += ` Q ${x - 9} ${y} ${x - 9} ${y - 9}`
    x -= 9
    y -= 9

    // left straight
    if (node.contentHeight > 0) {
      y -= node.contentHeight - 0
      node.d += ` L ${x} ${y}`
    }
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
    .on('dblclick', nodeDoubleClick)
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

function getPopUpNodeText(node: Node): string {
  return `Node ID: ${node.name}` + (node.switched ? ` (reversed)` : ``) + `\n`
}

// Get any node object by name.
function getNodeByName(nodeName: string): Node | undefined {
  if (typeof nodeName !== 'string') {
    throw new Error('Node Names must be strings')
  }
  const index = nodeMap.get(nodeName)
  return index === undefined ? undefined : nodes[index]
}

function nodeSingleClick(this: SVGElement): void {
  /* jshint validthis: true */
  // Get the node name
  const nodeName = d3.select(this).attr('id')
  const currentNode = getNodeByName(nodeName)
  if (currentNode === undefined) {
    console.error('Missing node: ', nodeName)
    return
  }
  const nodeAttributes: InfoAttribute[] = [
    ['Node ID:', currentNode.name + (currentNode.switched ? '(reversed)' : '')],
    ['Node Length:', (currentNode.sequenceLength ?? 0) + ' bases'],
    ['Haplotypes:', currentNode.degree],
    [
      'Aligned Reads:',
      currentNode.incomingReads.length +
        currentNode.internalReads.length +
        currentNode.outgoingReads.length,
    ],
    ['Total Visits:', numReadsVisitNode(currentNode)],
    ['Coverage:', coverage({ ...currentNode, sequenceLength: currentNode.sequenceLength ?? 0 }, reads)],
  ]

  config.showInfoCallback(nodeAttributes)
}

// Count the number of distinct reads that visit the given node object.
export interface NodeReadAttachments {
  incomingReads: [number, number][]
  outgoingReads: [number, number][]
  internalReads: number[]
}

export function numReadsVisitNode(node: NodeReadAttachments): number {
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
      if (numNodes === readPathIndex + 1 && currRead.finalNodeCoverLength !== undefined) {
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
    if (currRead?.finalNodeCoverLength !== undefined && currRead.firstNodeOffset !== undefined) {
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
    svg
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
    .attr('transform', d => `translate(${d.x + d.pixelWidth / 2},${d.y - 14})`)
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
  groups.each(function () {
    const textEl = d3.select(this).select<SVGTextElement>('text').node()
    if (!textEl) return
    const { x, y, width, height } = textEl.getBBox()
    d3.select(this).select('rect')
      .attr('x', x - NODE_LABEL_PADDING)
      .attr('y', y - NODE_LABEL_PADDING)
      .attr('width', width + NODE_LABEL_PADDING * 2)
      .attr('height', height + NODE_LABEL_PADDING * 2)
  })
}

function nodePixelCoordinatesInX(node: Node): [number, number] {
  // Add and subtract 4 to account for stroke width - TODO: figure out what the 4 means
  const nodeLeftX = node.x - 4
  const nodeRightX = node.x + node.pixelWidth + 4
  return [nodeLeftX, nodeRightX]
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
  let rulerTrackIndex = 0
  while (tracks[rulerTrackIndex]!.name !== trackForRuler) rulerTrackIndex += 1
  const rulerTrack = tracks[rulerTrackIndex]!

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

    const nodeSeqLen = currentNode.sequenceLength ?? 0
    // What offset into the node should we mark at, relative to its forward-strand start?
    let offsetIntoNodeForward = currentNodeIsReverse
      ? // If going in reverse, take off bases of the node we use from the right side
        nodeSeqLen - 1 - indexIntoVisitToMark
      : // Otherwise, add them to the left side
        indexIntoVisitToMark

    if (config.nodeWidthOption !== 'normal' && !is_region) {
      // Actually always mark at an edge of the node, if we are scaling the node nonlinearly
      // and if we are not highlighting the input region
      offsetIntoNodeForward = currentNodeIsReverse
        ? nodeSeqLen - 1
        : 0
    }

    // Where should we mark in the visualization?
    const xCoordOfMarking = getXCoordinateOfBaseWithinNode(
      currentNode,
      offsetIntoNodeForward,
    )
    return xCoordOfMarking
  }

  // Get the region in bp in the scale bar's coordinate space to highlight as
  // the target region. Will be null if we're using node IDs.
  const start_region = inputRegion[0] !== null ? Number(inputRegion[0]) : null
  const end_region = inputRegion[1] !== null ? Number(inputRegion[1]) : null

  const intervalsVisitedByNodes: Interval[] = []

  for (let i = 0; i < rulerTrack.indexSequence.length; i++) {
    // Walk along the ruler track in ascending coordinate order.
    const nodeIndex =
      rulerTrack.indexSequence[
        rulerTrack.isCompletelyReverse
          ? rulerTrack.indexSequence.length - 1 - i
          : i
      ]!
    const currentNode = nodes[Math.abs(nodeIndex)]!

    // Adding node X start and end positions into an array
    intervalsVisitedByNodes.push(nodePixelCoordinatesInX(currentNode))

    // Each node may actually have the track's coordinates go through it
    // backward. In fact, the whole track may be laid out backward.
    // So xor the reverse flags, which we assume to be bools
    const currentNodeIsReverse =
      isReverse(rulerTrack.sequence[i]!) !== rulerTrack.isCompletelyReverse

    // For some displayus we want to mark each node only once.
    let alreadyMarkedNode = false

    const nodeSeqLen = currentNode.sequenceLength ?? 0
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
      ticks_region.push([start_region, xCoordStart ?? 0])
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
      ticks_region.push([end_region, xCoordEnd ?? 0])
    }

    while (
      nextUnmarkedIndex <
      indexOfFirstBaseInNode + nodeSeqLen
    ) {
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
        ticks.push([nextUnmarkedIndex, xCoordOfMarking ?? 0])
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
      tick[1] - separatedTicks[separatedTicks.length - 1]![1] >= markingClearance
    ) {
      // Take only the first tick or ticks far enough from the previous tick taken.
      separatedTicks.push(tick)
    }
  })
  ticks = separatedTicks

  // plot ticks highlighting the region (if it is filled in)
  drawRulerMarkingRegion(ticks_region)

  // draw horizontal line for each interval

  const axisY = minYCoordinate - 10
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
  const axisY = minYCoordinate - 10
  svg
    .append('text')
    .attr('text-anchor', align)
    .attr('x', xCoordinate)
    .attr('y', minYCoordinate - 18)
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
  ticks_region.forEach(tick => { drawRulerMarkingEndpoint(tick[0], tick[1]); })

  const lineY = minYCoordinate - NODE_MARGIN - 6

  if (ticks_region?.length === 2) {
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

function drawRulerMarkingEndpoint(
  sequencePosition: number,
  xCoordinate: number,
): void {
  const pointX = xCoordinate
  const pointY = minYCoordinate - NODE_MARGIN - 1
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

function filterObjectByAttribute<T>(
  attribute: keyof T,
  value: T[keyof T],
): (item: T) => boolean {
  return item => item[attribute] === value
}

function drawTrackRectangles(
  rectangles: TrackRectangle[],
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  rectangles = rectangles.filter(filterObjectByAttribute('type', type))

  groupTrack
    .selectAll('trackRectangles')
    .data(rectangles)
    .enter()
    .append('rect')
    .attr('x', d => d.xStart)
    .attr('y', d => d.yStart)
    .attr('width', d => d.xEnd - d.xStart + 1)
    .attr('height', d => d.yEnd - d.yStart + 1)
    .style('fill', d => d.color)
    .style('fill-opacity', d => d.alpha ?? null)
    .attr('trackID', d => d.id)
    .attr('trackName', d => d.name ?? null)
    .attr('class', d => `track${d.id}`)
    .attr('color', d => d.color)
    .on('mouseover', trackMouseOver)
    .on('mousemove', trackMouseMove)
    .on('mouseout', trackMouseOut)
    .on('dblclick', trackDoubleClick)
    .on('click', trackSingleClick)
    .on('contextmenu', trackRightClick)
}

function compareCurvesByXYStartValue(a: TrackCurve, b: TrackCurve): number {
  if (a.xStart < b.xStart) return 1
  else if (a.xStart > b.xStart) return -1
  else if (a.yStart > b.yStart) return 1
  else if (a.yStart < b.yStart) return -1
  return 0
}

function defineSVGPatterns(): void {
  const defs = svg.append('defs')
  let pattern = defs.append('pattern').call(applyAttrs, {
    id: 'patternA',
    width: '7',
    height: '7',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })

  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '7', height: '7', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '3', height: '3', fill: '#505050' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '3', height: '3', fill: '#505050' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '3', height: '3', fill: '#505050' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '3', height: '3', fill: '#505050' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'patternB',
    width: '8',
    height: '8',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '8', height: '8', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '3', height: '3', fill: '#1f77b4' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '5', width: '3', height: '3', fill: '#1f77b4' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '5', y: '0', width: '3', height: '3', fill: '#1f77b4' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '5', y: '5', width: '3', height: '3', fill: '#1f77b4' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'plaid0',
    width: '6',
    height: '6',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '6', height: '6', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '2', height: '2', fill: '#1f77b4' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '2', height: '2', fill: '#1f77b4' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '2', height: '2', fill: '#1f77b4' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '2', height: '2', fill: '#1f77b4' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'plaid1',
    width: '6',
    height: '6',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '6', height: '6', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '2', height: '2', fill: '#ff7f0e' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '2', height: '2', fill: '#ff7f0e' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '2', height: '2', fill: '#ff7f0e' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '2', height: '2', fill: '#ff7f0e' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'plaid2',
    width: '6',
    height: '6',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '6', height: '6', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '2', height: '2', fill: '#2ca02c' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '2', height: '2', fill: '#2ca02c' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '2', height: '2', fill: '#2ca02c' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '2', height: '2', fill: '#2ca02c' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'plaid3',
    width: '6',
    height: '6',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '6', height: '6', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '2', height: '2', fill: '#d62728' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '2', height: '2', fill: '#d62728' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '2', height: '2', fill: '#d62728' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '2', height: '2', fill: '#d62728' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'plaid4',
    width: '6',
    height: '6',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '6', height: '6', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '2', height: '2', fill: '#9467bd' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '2', height: '2', fill: '#9467bd' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '2', height: '2', fill: '#9467bd' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '2', height: '2', fill: '#9467bd' })

  pattern = defs.append('pattern').call(applyAttrs, {
    id: 'plaid5',
    width: '6',
    height: '6',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '6', height: '6', fill: '#FFFFFF' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '0', width: '2', height: '2', fill: '#8c564b' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '0', y: '4', width: '2', height: '2', fill: '#8c564b' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '0', width: '2', height: '2', fill: '#8c564b' })
  pattern
    .append('rect')
    .call(applyAttrs, { x: '4', y: '4', width: '2', height: '2', fill: '#8c564b' })
}

function drawTrackCurves(
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  const filteredTrackCurves = trackCurves.filter(
    filterObjectByAttribute('type', type),
  )

  const groupedCurves: Record<string, TrackCurve[]> = {}

  // Group track curves based on if they have the same start and end node
  filteredTrackCurves.forEach(curve => {
    // We're going to split this back into numbers so we should not use - as a separator.
    // TODO: Do we actually get negative oriented node numbers in here?
    const key = `${curve.nodeStart},${curve.nodeEnd}`
    if (!groupedCurves[key]) {
      groupedCurves[key] = []
    }
    groupedCurves[key].push(curve)
  })

  Object.values(groupedCurves).forEach(curveGroup => {
    // Control point adjustment range: 30% to 70% of the original x values
    let adjustValue = 0.3
    let adjustIncrement = 0.4 / curveGroup.length

    // Ignore Beziar Curve skewing when a group is not too big
    if (curveGroup.length <= 5) {
      adjustValue = 0.5
      adjustIncrement = 0
    }

    // Sort curve groups by their starting y value
    curveGroup.sort(compareCurvesByXYStartValue)

    curveGroup.forEach(curve => {
      let xAdjusted = null
      // NextAdjusted is used to try to draw a parallel curve on the way back
      let xNextAdjusted = null
      // Determine if the curve is going up or down
      if (curve.yStart < curve.yEnd) {
        xAdjusted =
          curve.xStart + (curve.xEnd - curve.xStart) * (1 - adjustValue)
        adjustValue += adjustIncrement
        xNextAdjusted =
          curve.xStart + (curve.xEnd - curve.xStart) * (1 - adjustValue)
      } else {
        xAdjusted = curve.xStart + (curve.xEnd - curve.xStart) * adjustValue
        adjustValue += adjustIncrement
        xNextAdjusted = curve.xStart + (curve.xEnd - curve.xStart) * adjustValue
      }
      let d = `M ${curve.xStart} ${curve.yStart}`
      d += ` C ${xAdjusted} ${curve.yStart} ${xAdjusted} ${curve.yEnd} ${curve.xEnd} ${curve.yEnd}`
      d += ` V ${curve.yEnd + curve.width}`
      d += ` C ${xNextAdjusted} ${curve.yEnd + curve.width} ${xNextAdjusted} ${
        curve.yStart + curve.width
      } ${curve.xStart} ${curve.yStart + curve.width}`
      d += ' Z'
      curve.path = d
    })
  })

  // Rebuild one flat list of curves ordered by group and then using the within-group sort.
  const groupKeys = []
  for (const key in groupedCurves) {
    groupKeys.push(key)
  }
  groupKeys.sort(function (a, b) {
    const aParts = a.split(',').map(Number)
    const bParts = b.split(',').map(Number)
    const a0 = aParts[0] ?? 0
    const a1 = aParts[1] ?? 0
    const b0 = bParts[0] ?? 0
    const b1 = bParts[1] ?? 0
    if (a0 < b0) {
      return -1
    } else if (a0 > b0) {
      return 1
    } else {
      if (a1 < b1) {
        return -1
      } else if (a1 > b1) {
        return 1
      } else {
        return 0
      }
    }
  })
  let flattenedGroups: TrackCurve[] = []
  for (const key of groupKeys) {
    flattenedGroups = flattenedGroups.concat(groupedCurves[key] ?? [])
  }

  groupTrack
    .selectAll('trackCurves')
    .data(flattenedGroups)
    .enter()
    .append('path')
    .attr('d', d => d.path ?? null)
    .style('fill', d => d.color)
    .style('fill-opacity', d => d.alpha ?? null)
    .attr('trackID', d => d.id)
    .attr('trackName', d => d.name ?? null)
    .attr('class', d => `track${d.id}`)
    .attr('color', d => d.color)
    .on('mouseover', trackMouseOver)
    .on('mousemove', trackMouseMove)
    .on('mouseout', trackMouseOut)
    .on('dblclick', trackDoubleClick)
    .on('click', trackSingleClick)
    .on('contextmenu', trackRightClick)
}

function drawTrackCorners(
  corners: TrackCorner[],
  type: TrackType | undefined,
  groupTrack: SvgGroupSelection,
): void {
  corners = corners.filter(filterObjectByAttribute('type', type))

  groupTrack
    .selectAll('trackCorners')
    .data(corners)
    .enter()
    .append('path')
    .attr('d', d => d.path)
    .style('fill', d => d.color)
    .attr('trackID', d => d.id)
    .attr('trackName', d => d.name ?? null)
    .attr('class', d => `track${d.id}`)
    .attr('color', d => d.color)
    .on('mouseover', trackMouseOver)
    .on('mousemove', trackMouseMove)
    .on('mouseout', trackMouseOut)
    .on('dblclick', trackDoubleClick)
    .on('click', trackSingleClick)
    .on('contextmenu', trackRightClick)
}

// Get a non-read input track index by the ID stored in their d3 objects.
function getInputTrackIndexByID(trackID: number | string): number | undefined {
  let index = 0
  while (
    index < inputTracks.length &&
    inputTracks[index]!.id !== Number(trackID)
  ) {
    index += 1
  }
  // There might not be a track
  if (index >= inputTracks.length) return
  return index
}

// Get any track object by ID.
// Because of reordering of input tracks, the ID doesn't always match the index.
function getTrackByID(trackID: number): Track | undefined {
  if (typeof trackID !== 'number') {
    throw new Error('Track IDs must be numbers')
  }
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
    'white-space:nowrap',
    'display:none',
  ].join(';')
  document.body.appendChild(el)
  hoverTooltip = el
  return el
}

function trackTooltipText(trackID: number): string {
  const t = inputTracks.find(x => x.id === trackID)
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
  const x = event.clientX + pad + rect.width > innerWidth
    ? event.clientX - pad - rect.width
    : event.clientX + pad
  const y = event.clientY + pad + rect.height > innerHeight
    ? event.clientY - pad - rect.height
    : event.clientY + pad
  el.style.left = `${Math.max(0, x)}px`
  el.style.top = `${Math.max(0, y)}px`
}

// Highlight track on mouseover and show the hover tooltip.
function trackMouseOver(this: SVGElement, event: MouseEvent): void {
  /* jshint validthis: true */
  const trackID = d3.select(this).attr('trackID')
  // TODO: We want to also .raise() here, but it makes Firefox 124.0.2 on Mac
  // lose the mouseout and immediately trigger another mouseover, if the mouse
  // is over a curved section of a read.
  d3.selectAll(`.track${trackID}`).style('fill', 'url(#patternA)')

  const el = ensureHoverTooltip()
  el.textContent = trackTooltipText(Number(trackID))
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
function trackMouseOut(this: SVGElement): void {
  const trackID = d3.select(this).attr('trackID')
  d3.selectAll(`.track${trackID}`).each(function clearTrackHighlight() {
    const c = d3.select(this).attr('color')
    d3.select(this).style('fill', c)
  })
  if (hoverTooltip) hoverTooltip.style.display = 'none'
}

// Restore original node appearance on mouseout
function nodeMouseOut(this: SVGElement): void {
  d3.select(this).style('stroke-width', '2px')
}

// Move clicked track to first position
function trackDoubleClick(this: SVGElement): void {
  /* jshint validthis: true */
  const trackID = d3.select(this).attr('trackID')
  const index = getInputTrackIndexByID(trackID)
  if (index === undefined) {
    // Must be a read. Skip it.
    return
  }
  if (DEBUG) console.log(`moving index: ${index}`)
  moveTrackToFirstPosition(index)
  createTubeMap()
}

// Takes a track and returns a string describing the nodes it passes through
// In the format of >1>2<3>4, with the integers being nodeIDs
function getPathInfo(track: Track): string {
  const result: string[] = []
  if (!track.sequence) {
    return ''
  }

  for (const nodeID of track.sequence) {
    // Node is approached backwards if "-" is present
    if (nodeID.startsWith('-')) {
      result.push('<', nodeID.substring(1))
    } else {
      result.push('>', nodeID)
    }
  }

  return result.join('')
}

function trackSingleClick(this: SVGElement): void {
  /* jshint validthis: true */
  // Get the track ID as a number
  const trackID = Number(d3.select(this).attr('trackID'))
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
    track_attributes.push(['Path Info', getPathInfo(current_track)])
  }
  config.showInfoCallback(track_attributes)
}

// Right-click on a track. For reads, fires the context-menu callback with the
// read's name and the click coordinates so the React layer can render a menu.
function trackRightClick(this: SVGElement, event: MouseEvent): void {
  /* jshint validthis: true */
  const trackID = Number(d3.select(this).attr('trackID'))
  const current_track = getTrackByID(trackID)
  if (current_track?.type === 'read') {
    event.preventDefault()
    config.readContextMenuCallback({
      readName: current_track.name ?? '',
      x: event.clientX,
      y: event.clientY,
    })
  }
}

// show track name when hovering mouse
// Long-hover (native) SVG tooltip text. The d3 datum binds the track name
// directly, so we don't need an inputTracks lookup here — but `freq` is on
// the InputTrack, so we fall back to the formatter without it.
function getPopUpTrackText(trackName: string | number | undefined): string {
  if (trackName === undefined) return ''
  return formatTrackDisplayName(String(trackName))
}

// Right-click on a node. Fires the node context-menu callback with the list of
// read names (from the unfiltered input) that pass through the node.
function nodeRightClick(this: SVGElement, event: MouseEvent): void {
  /* jshint validthis: true */
  const nodeName = d3.select(this).attr('id')
  event.preventDefault()
  config.nodeContextMenuCallback({
    nodeName,
    readNames: getReadNamesThroughNodes([nodeName], 'any'),
    x: event.clientX,
    y: event.clientY,
  })
}

// Redraw with current node moved to beginning
function nodeDoubleClick(this: SVGElement): void {
  /* jshint validthis: true */
  const nodeID = d3.select(this).attr('id')
  if (config.clickableNodesFlag) {
    if (config.showReads && reads.length > 0) {
      document.querySelector<HTMLInputElement>('#hgvmNodeID')!.value = nodeID
      document.getElementById('hgvmPostButton')!.click()
    } else {
      document.querySelector<HTMLInputElement>('#nodeID')!.value = nodeID
      document.getElementById('postButton')!.click()
    }
  }
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

// calculate node widths depending on sequence lengths and chosen calculation method
function generateNodeWidth(): void {
  nodes.forEach(node => {
    if (node.sequenceLength === undefined) {
      node.sequenceLength = node.seq.length
    }
  })

  switch (config.nodeWidthOption) {
    case 'compressed':
      nodes.forEach(node => {
        node.width = 1 + Math.log(node.sequenceLength!) / Math.log(2)
        node.pixelWidth = Math.round((node.width - 1) * 8.401)
      })
      break
    case 'small':
      nodes.forEach(node => {
        node.width = node.sequenceLength! / 100
        node.pixelWidth = Math.round((node.width - 1) * 8.401)
      })
      break
    case 'fixed':
      // when there's no reads in the node, it should be a little wider
      nodes.forEach(node => {
        node.width = 10
        node.pixelWidth = Math.round(node.width * 8.401)
      })
      break
    case 'normal': {
      // Font is monospace (see `fonts`), so width per character is constant.
      // Measure one character once instead of forcing a layout reflow per node.
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

      nodes.forEach(node => {
        node.width = node.sequenceLength!
        const len = node.seq?.length ?? 1
        node.pixelWidth = Math.round(charWidth * len)
      })
      break
    }
    default:
      throw new Error(`${config.nodeWidthOption} not implemented`)
  }
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
    path.mapping.forEach(pos => {
      if (pos.position!.is_reverse === true) {
        // Visit this node in reverse
        sequence.push(reverse(`${pos.position!.node_id}`))
      } else {
        // Visit this node forward
        sequence.push(`${pos.position!.node_id}`)
        // Remember that we visit at least one node in its local forward orientation
        isCompletelyReverse = false
      }
    })
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
      sourceTrackID:
        path.name?.startsWith('thread_')
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

function compareReadsByLeftEnd(a: Track, b: Track): number {
  let leftNodeA: string
  let leftNodeB: string
  let leftIndexA: number
  let leftIndexB: number

  if (isReverse(a.sequence[0]!)) {
    if (isReverse(a.sequence[a.sequence.length - 1]!)) {
      leftNodeA = forward(a.sequence[a.sequence.length - 1]!)
      leftIndexA =
        nodes[nodeMap.get(leftNodeA)!]!.sequenceLength! - a.finalNodeCoverLength!
    } else {
      leftNodeA = a.sequence[a.sequence.length - 1]!
      leftIndexA = 0
    }
  } else {
    leftNodeA = a.sequence[0]!
    leftIndexA = a.firstNodeOffset!
  }

  if (isReverse(b.sequence[0]!)) {
    if (isReverse(b.sequence[b.sequence.length - 1]!)) {
      leftNodeB = forward(b.sequence[b.sequence.length - 1]!)
      leftIndexB =
        nodes[nodeMap.get(leftNodeB)!]!.sequenceLength! - b.finalNodeCoverLength!
    } else {
      leftNodeB = b.sequence[b.sequence.length - 1]!
      leftIndexB = 0
    }
  } else {
    leftNodeB = b.sequence[0]!
    leftIndexB = b.firstNodeOffset!
  }

  if (leftNodeA < leftNodeB) return -1
  else if (leftNodeA > leftNodeB) return 1
  if (leftIndexA < leftIndexB) return -1
  else if (leftIndexA > leftIndexB) return 1
  return 0
}

function compareReadsByLeftEnd2(a: Track, b: Track): number {
  // compare by order of first node
  if (
    nodes[Math.abs(a.indexSequence[0]!)]!.order <
    nodes[Math.abs(b.indexSequence[0]!)]!.order
  ) {
    return -1
  } else if (
    nodes[Math.abs(a.indexSequence[0]!)]!.order >
    nodes[Math.abs(b.indexSequence[0]!)]!.order
  ) {
    return 1
  }

  // compare by first base within first node
  if (a.firstNodeOffset! < b.firstNodeOffset!) return -1
  else if (a.firstNodeOffset! > b.firstNodeOffset!) return 1

  // compare by order of last node
  if (
    nodes[Math.abs(a.indexSequence[a.indexSequence.length - 1]!)]!.order <
    nodes[Math.abs(b.indexSequence[b.indexSequence.length - 1]!)]!.order
  ) {
    return -1
  } else if (
    nodes[Math.abs(a.indexSequence[a.indexSequence.length - 1]!)]!.order >
    nodes[Math.abs(b.indexSequence[b.indexSequence.length - 1]!)]!.order
  ) {
    return 1
  }

  // compare by last base within last node
  if (a.finalNodeCoverLength! < b.finalNodeCoverLength!) return -1
  else if (a.finalNodeCoverLength! > b.finalNodeCoverLength!) return 1

  return 0
}

// converts readPath, a vg Path object expressed as a JS object, to a CIGAR string
type CigarOp = 'M' | 'I' | 'D'
type CigarToken = number | CigarOp

export function cigar_string(readPath: VgPath): string {
  if (DEBUG) {
    console.log('readPath mapping:', readPath.mapping)
  }
  let cigar: CigarToken[] = []
  for (const mapping of readPath.mapping) {
    for (const edit of mapping.edit) {
      const from = edit.from_length
      const to = edit.to_length
      // from_length is not 0, and from_length = to_length, this indicates a match
      if (from !== undefined && from !== 0 && from === to) {
        cigar = append_cigar_operation(from, 'M', cigar)
      } else if (from !== undefined && to !== undefined && from === to) {
        // from_length can be 0, and from_length = to_length, this indicates a match
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
  if (DEBUG) {
    console.log('cigar string:', cigar.join(''))
  }
  return cigar.join('')
}

function append_cigar_operation(
  length: number,
  operator: CigarOp,
  cigar: CigarToken[],
): CigarToken[] {
  const last_operation = cigar[cigar.length - 1]
  const last_length = cigar[cigar.length - 2]
  // if duplicate operations, add the two operations and replace the most recent operation with this
  if (
    last_operation === operator &&
    typeof last_length === 'number'
  ) {
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
  if (DEBUG) {
    console.log('Reads:')
    console.log(myReads)
  }
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
                if (element.sequence.length > 1 && DEBUG) {
                  console.log(
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
        if (DEBUG) {
          console.log(`read ${i} is empty`)
        }
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
          mapping_quality: read.mapping_quality || 0,
          is_secondary: read.is_secondary || false,
          sample_name: read.sample_name || null,
          read_group: read.read_group || null,
          cigar_string: cigar_string(read.path),
          score: read.score || 0,
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

// remove redundant nodes
// two nodes A and B can be merged if all tracks leaving A go directly into B
// and all tracks entering B come directly from A
// (plus no inversions involved)
function mergeNodes(): void {
  let nodeName: string
  let nodeName2: string
  const predSets: Set<string>[] = [] // array of set of predecessors of each node
  const succSets: Set<string>[] = [] // array of set of successors of each node
  for (let i = 0; i < nodes.length; i += 1) {
    predSets.push(new Set())
    succSets.push(new Set())
  }

  let tracksAndReads
  if (config.showReads && reads.length > 0) tracksAndReads = tracks.concat(reads)
  else tracksAndReads = tracks

  tracksAndReads.forEach(track => {
    for (let i = 0; i < track.sequence.length; i += 1) {
      if (!isReverse(track.sequence[i]!)) {
        // forward Node
        if (i > 0) {
          nodeName = track.sequence[i - 1]!
          predSets[nodeMap.get(track.sequence[i]!)!]!.add(nodeName)
          if (isReverse(nodeName)) {
            // add 2 predecessors, to make sure there is no node merging in this case
            predSets[nodeMap.get(track.sequence[i]!)!]!.add(forward(nodeName))
          }
        } else if (track.type === 'haplotype') {
          predSets[nodeMap.get(track.sequence[i]!)!]!.add('None')
        }
        if (i < track.sequence.length - 1) {
          nodeName = track.sequence[i + 1]!
          succSets[nodeMap.get(track.sequence[i]!)!]!.add(nodeName)
          if (isReverse(nodeName)) {
            // add 2 successors, to make sure there is no node merging in this case
            succSets[nodeMap.get(track.sequence[i]!)!]!.add(forward(nodeName))
          }
        } else if (track.type === 'haplotype') {
          succSets[nodeMap.get(track.sequence[i]!)!]!.add('None')
        }
      } else {
        // reverse Node
        nodeName = forward(track.sequence[i]!)
        if (i > 0) {
          nodeName2 = track.sequence[i - 1]!
          if (isReverse(nodeName2)) {
            succSets[nodeMap.get(nodeName)!]!.add(forward(nodeName2))
          } else {
            // add 2 successors, to make sure there is no node merging in this case
            succSets[nodeMap.get(nodeName)!]!.add(nodeName2)
            succSets[nodeMap.get(nodeName)!]!.add(reverse(nodeName2))
          }
        } else if (track.type === 'haplotype') {
          succSets[nodeMap.get(nodeName)!]!.add('None')
        }
        if (i < track.sequence.length - 1) {
          nodeName2 = track.sequence[i + 1]!
          if (isReverse(nodeName2)) {
            predSets[nodeMap.get(nodeName)!]!.add(forward(nodeName2))
          } else {
            predSets[nodeMap.get(nodeName)!]!.add(nodeName2)
            predSets[nodeMap.get(nodeName)!]!.add(reverse(nodeName2))
          }
        } else if (track.type === 'haplotype') {
          predSets[nodeMap.get(nodeName)!]!.add('None')
        }
      }
    }
  })

  // convert sets to arrays
  const pred: string[][] = predSets.map(s => Array.from(s))
  const succ: string[][] = succSets.map(s => Array.from(s))

  // update reads which pass through merging nodes
  if (config.showReads && reads.length > 0) {
    // sort nodes by order, then by y-coordinate
    const sortedNodes = nodes.slice()
    sortedNodes.sort(compareNodesByOrder)

    // iterate over all nodes and calculate their position within the new merged node
    const mergeOffset = new Map()
    const mergeOrigin = new Map() // maps to leftmost node of a node's "merging cascade"
    sortedNodes.forEach(node => {
      const predecessor = mergeableWithPred(nodeMap.get(node.name)!, pred, succ)
      if (predecessor) {
        mergeOffset.set(
          node.name,
          mergeOffset.get(predecessor) +
            nodes[nodeMap.get(predecessor)!]!.sequenceLength,
        )
        mergeOffset.set(
          '-' + node.name,
          mergeOffset.get(predecessor) +
            nodes[nodeMap.get(predecessor)!]!.sequenceLength,
        )
        mergeOrigin.set(node.name, mergeOrigin.get(predecessor))
        mergeOrigin.set(reverse(node.name), mergeOrigin.get(predecessor))
      } else {
        mergeOffset.set(node.name, 0)
        mergeOffset.set(reverse(node.name), 0)
        mergeOrigin.set(node.name, node.name)
        mergeOrigin.set(reverse(node.name), node.name)
      }
    })

    reads.forEach(read => {
      read.firstNodeOffset! += mergeOffset.get(read.sequence[0]!)
      read.finalNodeCoverLength! += mergeOffset.get(
        read.sequence[read.sequence.length - 1]!,
      )
      for (let i = read.sequence.length - 1; i >= 0; i -= 1) {
        const nodeName = forward(read.sequence[i]!)
        const predecessor = mergeableWithPred(nodeMap.get(nodeName)!, pred, succ)
        if (predecessor) {
          if (mergeableWithSucc(nodeMap.get(predecessor)!, pred, succ)) {
            if (i > 0) {
              read.sequence.splice(i, 1)
              // adjust position of mismatches
              read.sequenceNew![i]!.mismatches.forEach(mismatch => {
                mismatch.pos += nodes[nodeMap.get(predecessor)!]!.sequenceLength!
              })
              // append mismatches to previous entry's mismatches
              read.sequenceNew![i - 1]!.mismatches = read.sequenceNew![
                i - 1
              ]!.mismatches.concat(read.sequenceNew![i]!.mismatches)
              read.sequenceNew!.splice(i, 1)
            } else {
              read.sequence[0] = mergeOrigin.get(read.sequence[0]!)
              read.sequenceNew![i]!.mismatches.forEach(mismatch => {
                mismatch.pos += mergeOffset.get(read.sequenceNew![0]!.nodeName)
              })
              read.sequenceNew![0]!.nodeName = mergeOrigin.get(
                read.sequenceNew![0]!.nodeName,
              )
            }
          }
        }
      }
    })
  }

  // update node sequences + sequence lengths
  for (let i = 0; i < nodes.length; i += 1) {
    if (mergeableWithSucc(i, pred, succ) && !mergeableWithPred(i, pred, succ)) {
      let donor = i
      while (mergeableWithSucc(donor, pred, succ)) {
        donor = nodeMap.get(forward(succ[donor]![0]!))!
        if (nodes[i]!.sequenceLength !== undefined) {
          nodes[i]!.sequenceLength! += nodes[donor]!.sequenceLength!
        } else {
          nodes[i]!.width += nodes[donor]!.width
        }
        nodes[i]!.seq += nodes[donor]!.seq
      }
    }
  }

  // actually merge the nodes by removing the corresponding nodes from track data
  tracks.forEach(track => {
    for (let i = track.sequence.length - 1; i >= 0; i -= 1) {
      nodeName = forward(track.sequence[i]!)
      const nodeIndex = nodeMap.get(nodeName)!
      if (mergeableWithPred(nodeIndex, pred, succ)) {
        track.sequence.splice(i, 1)
      }
    }
  })

  // remove the nodes from node-array
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (mergeableWithPred(i, pred, succ)) {
      nodes.splice(i, 1)
    }
  }
}

function mergeableWithPred(
  index: number,
  pred: string[][],
  succ: string[][],
): string | false {
  if (pred[index]!.length !== 1) return false
  if (pred[index]![0] === 'None') return false
  const predecessor = forward(pred[index]![0]!)
  const predecessorIndex = nodeMap.get(predecessor)!
  if (succ[predecessorIndex]!.length !== 1) return false
  if (succ[predecessorIndex]![0] === 'None') return false
  return predecessor
}

function mergeableWithSucc(
  index: number,
  pred: string[][],
  succ: string[][],
): boolean {
  if (succ[index]!.length !== 1) return false
  if (succ[index]![0] === 'None') return false
  const successor = forward(succ[index]![0]!)
  const successorIndex = nodeMap.get(successor)!
  if (pred[successorIndex]!.length !== 1) return false
  if (pred[successorIndex]![0] === 'None') return false
  return true
}

function drawMismatches(): void {
  tracks.forEach((read, trackIdx) => {
    if (read.type === 'read') {
      read.sequenceNew!.forEach((element, i) => {
        element.mismatches.forEach(mm => {
          const nodeName = forward(element.nodeName)
          const nodeIndex = nodeMap.get(nodeName)!
          const node = nodes[nodeIndex]!
          const x = getXCoordinateOfBaseWithinNode(node, mm.pos)!
          let pathIndex = i
          while (read.path[pathIndex]!.node !== nodeIndex) {
            pathIndex += 1
          }
          const y = read.path[pathIndex]!.y!
          if (mm.type === 'insertion') {
            if (
              config.showSoftClips ||
              ((mm.pos !== read.firstNodeOffset || i !== 0) &&
                (mm.pos !== read.finalNodeCoverLength ||
                  i !== read.sequenceNew!.length - 1))
            ) {
              drawInsertion(x - 3, y + READ_WIDTH, mm.seq, node.y)
            }
          } else if (mm.type === 'deletion') {
            const x2 = getXCoordinateOfBaseWithinNode(node, mm.pos + mm.length!)!
            drawDeletion(x, x2, y + 4, node.y)
          } else if (mm.type === 'substitution') {
            const x2 = getXCoordinateOfBaseWithinNode(
              node,
              mm.pos + mm.seq!.length,
            )!
            drawSubstitution(x + 1, x2, y + READ_WIDTH, node.y, mm.seq)
          }
        })
      })
    }
  })
}

function drawInsertion(
  x: number,
  y: number,
  seq: string | undefined,
  nodeY: number,
): void {
  svg
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
  x1: number,
  x2: number,
  y: number,
  nodeY: number,
  seq: string | undefined,
): void {
  svg
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
  x1: number,
  x2: number,
  y: number,
  nodeY: number,
): void {
  // draw horizontal block
  svg
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

function insertionMouseOver(this: SVGElement): void {
  d3.select(this).attr('fill', 'red')
  const x = Number(d3.select(this).attr('x'))
  const y = Number(d3.select(this).attr('y'))
  const yTop = Number(d3.select(this).attr('nodeY'))
  svg
    .append('line')
    .attr('class', 'insertionHighlight')
    .attr('x1', x + 4)
    .attr('y1', y - 10)
    .attr('x2', x + 4)
    .attr('y2', yTop + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
}

function deletionMouseOver(this: SVGElement): void {
  d3.select(this).attr('stroke', 'red')
  const x1 = Number(d3.select(this).attr('x1'))
  const x2 = Number(d3.select(this).attr('x2'))
  const y = Number(d3.select(this).attr('y1'))
  const yTop = Number(d3.select(this).attr('nodeY'))
  svg
    .append('line')
    .attr('class', 'deletionHighlight')
    .attr('x1', x1)
    .attr('y1', y - 3)
    .attr('x2', x1)
    .attr('y2', yTop + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
  svg
    .append('line')
    .attr('class', 'deletionHighlight')
    .attr('x1', x2)
    .attr('y1', y - 3)
    .attr('x2', x2)
    .attr('y2', yTop + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
}

function substitutionMouseOver(this: SVGElement): void {
  d3.select(this).attr('fill', 'red')
  const x1 = Number(d3.select(this).attr('x'))
  const x2 = Number(d3.select(this).attr('rightX'))
  const y = Number(d3.select(this).attr('y'))
  const yTop = Number(d3.select(this).attr('nodeY'))
  svg
    .append('line')
    .attr('class', 'substitutionHighlight')
    .attr('x1', x1 - 1)
    .attr('y1', y - READ_WIDTH)
    .attr('x2', x1 - 1)
    .attr('y2', yTop + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
  svg
    .append('line')
    .attr('class', 'substitutionHighlight')
    .attr('x1', x2 + 1)
    .attr('y1', y - READ_WIDTH)
    .attr('x2', x2 + 1)
    .attr('y2', yTop + 5)
    .attr('stroke-width', 1)
    .attr('stroke', 'black')
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

function filterReads(reads: Track[]): Track[] {
  const focusNames = config.focusReadNames
    ? new Set(config.focusReadNames)
    : null
  return reads.filter(
    read =>
      !read.is_secondary &&
      (read.mapping_quality ?? 0) >= config.mappingQualityCutoff &&
      (!focusNames || (read.name !== undefined && focusNames.has(read.name))),
  )
}
