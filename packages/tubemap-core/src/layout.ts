// The tube map layout, from input nodes and tracks to drawable shapes. Ported
// from the original sequenceTubeMap JS, where it shared one module with the d3
// drawing. It runs in two phases, each on a fresh LayoutState: layoutTopology
// merges, orders, orients and sizes the nodes and fixes their x, and
// placeTubeMap stacks a chosen set of tracks and reads on that topology.
import { emptyTrackShapes } from './types.ts'

import type {
  HaplotypeShare,
  ImageBounds,
  InputNode,
  InputTrack,
  LayoutNode,
  Mismatch,
  Node,
  NodeAssignment,
  ReadSequenceEntry,
  Segment,
  SegmentAssignment,
  Track,
  TrackShapes,
  TrackType,
} from './types.ts'

const DEBUG = false as boolean

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    // oxlint-disable-next-line no-console
    console.log(...args)
  }
}

// Node and Track declare some fields that not every entry gets: layout places
// only the nodes a track or read reaches, and a normal read has no width until
// assignReadsToNodes.
type MaybeUnset<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
type MaybeUnplacedNode = MaybeUnset<LayoutNode, 'x' | 'y'>

export type NodeWidthOption = 'normal' | 'compressed' | 'small' | 'fixed'

// The fields of a placed track a renderer colors it by. Shapes carry only the
// track's id, so a renderer can recolor without laying out again.
export interface ColorableTrack {
  id: number
  sourceTrackID: number
  type?: TrackType
  name?: string
  mapping_quality?: number
  is_reverse?: boolean
  haplotypeShare?: HaplotypeShare
}

// The options a topology fixes. trackWidth, coarsenedReadView and ignoreStrand
// leave node order alone, but the topology measures x from placing every track
// and read under them.
export interface TopologyOptions {
  mergeNodes?: boolean
  showReads?: boolean
  coarsenedReadView?: boolean
  ignoreStrand?: boolean
  // normal: width is sequence length, at `charWidth` per base
  // compressed: log2 of sequence length
  // small: 1% of sequence length
  // fixed: every node one width
  nodeWidthOption?: NodeWidthOption
  charWidth?: number
  // a haplotype tube's width in layout px, where no `freq` scales it
  trackWidth?: number
}

// Which of a topology's reads a placement draws
export interface PlacementOptions {
  mappingQualityCutoff?: number
  focusReadNames?: string[] | null
}

export interface LayoutOptions extends TopologyOptions, PlacementOptions {}

// A coarsened band's count of contributing reads and its label, keyed by the
// band's synthetic track id
export type CoarsenedUnit = 'read' | 'haplotype'

export interface CoarsenedEdgeMeta {
  count: number
  label: string
}

// What the coarsened view drew as bands, how many reads or haplotypes it
// banded (counting a deduplicated walk `freq` times), and whether any band
// runs reverse-strand
export interface Coarsening {
  unit: CoarsenedUnit
  total: number
  reverse: boolean
}

export interface TubeMapLayout {
  // 1-indexed with a hole at 0: a signed index
  // is an oriented visit, and 0 has no sign
  nodes: LayoutNode[]
  // the haplotype tracks and placed reads together, sorted by where each
  // first meets the others, which is the order their shapes were made in
  tracks: Track[]
  // the placed reads alone
  reads: Track[]
  nodeMap: ReadonlyMap<string, number>
  shapes: TrackShapes
  bounds: ImageBounds
  maxOrder: number
  // the name of the track that carries a coordinate for the ruler
  trackForRuler: string | undefined
  coarsenedEdgeMeta: Map<number, CoarsenedEdgeMeta>
  // what the coarsened view drew as bands, if it drew any
  coarsened: Coarsening | undefined
}

// A node before placement gives it a y and the reads through it
export type TopologyNode = Omit<
  LayoutNode,
  | 'y'
  | 'contentHeight'
  | 'topLane'
  | 'incomingReads'
  | 'outgoingReads'
  | 'internalReads'
>

// A haplotype or read before placement gives it a width and lanes
export type TopologyTrack = Omit<Track, 'path' | 'width'>

// What every placement of one input shares: the merged, ordered and oriented
// nodes with their widths and x positions, and the oriented haplotypes and
// reads. A placement reads it and never changes it.
export interface TubeMapTopology {
  options: Required<TopologyOptions>
  // 1-indexed with a hole at 0, like TubeMapLayout.nodes. A node no track or
  // read reaches has order UNREACHABLE_ORDER and no x.
  nodes: readonly TopologyNode[]
  // the visible haplotypes, track 0 read left to right
  tracks: readonly TopologyTrack[]
  // every primary alignment that shares a node with a track, unfiltered
  reads: readonly TopologyTrack[]
  // whether any reads were loaded: the coarsened view bands haplotypes only
  // when none were, not when a filter hides them all
  hasReads: boolean
  nodeMap: ReadonlyMap<string, number>
  maxOrder: number
  trackForRuler: string | undefined
}

type LayoutConfig = Required<TopologyOptions>

function configFrom(options: TopologyOptions): LayoutConfig {
  return {
    mergeNodes: options.mergeNodes ?? true,
    showReads: options.showReads ?? true,
    coarsenedReadView: options.coarsenedReadView ?? false,
    ignoreStrand: options.ignoreStrand ?? false,
    nodeWidthOption: options.nodeWidthOption ?? 'normal',
    charWidth: options.charWidth ?? 8.401,
    trackWidth: options.trackWidth ?? 15,
  }
}

// The working state of one topology or placement, shared by its passes.
interface LayoutState {
  config: LayoutConfig
  // Sparse like TubeMapLayout.nodes, but forEach, map and sort skip the hole
  // and noUncheckedIndexedAccess already types indexed reads as possibly
  // undefined, so only for...of would ever see it.
  nodes: LayoutNode[]
  // Each track's `path` lists the Segments to draw, in order along the path.
  tracks: Track[]
  // Reads have a `path` too, but stack vertically by a different system.
  reads: Track[]
  nodeMap: ReadonlyMap<string, number>
  nodesPerOrder: number[][]
  // generateNodeOrder's scratch, by node index; undefined until assigned.
  nodeOrders: (number | undefined)[]
  // Lane assignments for tracks (not reads), one list per order slot.
  assignments: NodeAssignment[][]
  extraLeft: number[]
  extraRight: number[]
  // horizontal order of the rightmost node
  maxOrder: number
  shapes: TrackShapes
  imageBounds: ImageBounds
  trackForRuler: string | undefined
  coarsenedEdgeMeta: Map<number, CoarsenedEdgeMeta>
}

function emptyState(config: LayoutConfig): LayoutState {
  return {
    config,
    nodes: [],
    tracks: [],
    reads: [],
    nodeMap: new Map(),
    nodesPerOrder: [],
    nodeOrders: [],
    assignments: [],
    extraLeft: [],
    extraRight: [],
    maxOrder: -1,
    shapes: emptyTrackShapes(),
    imageBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    trackForRuler: undefined,
    coarsenedEdgeMeta: new Map(),
  }
}

// placeTubeMap(layoutTopology(...), options). Undefined when nothing visible
// is left to draw.
export function layoutTubeMap(
  inputNodes: readonly InputNode[],
  inputTracks: readonly InputTrack[],
  inputReads: readonly InputTrack[] = [],
  options: LayoutOptions = {},
): TubeMapLayout | undefined {
  const topology = layoutTopology(inputNodes, inputTracks, inputReads, options)
  return topology && placeTubeMap(topology, options)
}

// Each topology's placement of every track and read, which fixed its x
const measurements = new WeakMap<TubeMapTopology, TubeMapLayout>()

// Merge, order and orient the nodes under the visible `inputTracks` and, when
// `showReads`, every primary alignment in `inputReads`, then size them and
// fix their x positions. Undefined when nothing visible is left to draw.
// Neither input is modified. Track 0 is the reference the layout straightens.
// The x gaps between order slots make room for the tracks' turns and slopes,
// so the topology takes its x positions from placing every track and read.
export function layoutTopology(
  inputNodes: readonly InputNode[],
  inputTracks: readonly InputTrack[],
  inputReads: readonly InputTrack[] = [],
  options: TopologyOptions = {},
): TubeMapTopology | undefined {
  const topology = arrangeTopology(inputNodes, inputTracks, inputReads, options)
  if (topology === undefined) {
    return undefined
  }
  const everything = place(topology, topology.reads, 'measure')
  everything.nodes.forEach((node, i) => {
    if (node.order >= 0) {
      topology.nodes[i]!.x = node.x
    }
  })
  measurements.set(topology, everything)
  return topology
}

// Lay out the topology's haplotypes and the reads `options` keep at the
// topology's x positions, stacking each read under the nodes it visits. When
// the filters keep every read, this returns the placement layoutTopology
// measured x from, the same object on every such call.
export function placeTubeMap(
  topology: TubeMapTopology,
  options: PlacementOptions = {},
): TubeMapLayout {
  const reads = selectReads(topology, options)
  const measured = measurements.get(topology)
  return measured !== undefined && reads.length === topology.reads.length
    ? measured
    : place(topology, reads, 'topology')
}

function arrangeTopology(
  inputNodes: readonly InputNode[],
  inputTracks: readonly InputTrack[],
  inputReads: readonly InputTrack[],
  options: TopologyOptions,
): TubeMapTopology | undefined {
  const state = emptyState(configFrom(options))

  if (inputNodes.length === 0 || inputTracks.length === 0) {
    return undefined
  }

  // Boundary promotion: layout passes below populate the Node/Track fields
  // (width, order, x/y, path, indexSequence, etc.) before any reader runs.
  //
  // Nodes are referenced in inputs by internal `name` attribute and not by
  // index. Internally in e.g. a path's indexSequence we need to reference
  // nodes by *signed* index, so index 0 can never be used: budge everything
  // down and leave a hole (rather than an `undefined` entry) at 0, which we
  // won't iterate over. Made after the copy, because not every structuredClone
  // keeps a hole.
  structuredClone(inputNodes).forEach((node, i) => {
    node.seq ??= ''
    node.sequenceLength ??= node.seq.length
    state.nodes[i + 1] = node as LayoutNode
  })
  state.tracks = structuredClone(inputTracks) as Track[]
  // Secondary alignments never draw, so drop them before the deep copy, the
  // most expensive step in a redraw.
  state.reads = state.config.showReads
    ? (structuredClone(
        inputReads.filter(read => read.is_secondary !== true),
      ) as Track[])
    : []

  for (let i = state.tracks.length - 1; i >= 0; i -= 1) {
    const t = state.tracks[i]!
    t.type ??= 'haplotype'
    if (t.hidden === true) {
      state.tracks.splice(i, 1)
      continue
    }
    if (t.indexOfFirstBase !== undefined) {
      state.trackForRuler = t.name
    }
  }
  if (state.tracks.length === 0) {
    return undefined
  }

  // Run against the visible tracks only, so hiding the reference doesn't leave
  // the layout straightened around a track that is no longer drawn.
  straightenTrack(state, 0)

  state.nodeMap = generateNodeMap(state)
  generateTrackIndexSequences(state, state.tracks)
  generateTrackIndexSequences(state, state.reads)
  generateNodeWidth(state)

  if (state.config.mergeNodes) {
    generateNodeSuccessors(state)
    generateNodeOrder(state)
    reverseReversedReads(state)
    mergeNodes(state)
    state.nodeMap = generateNodeMap(state)
    generateNodeWidth(state)
    generateTrackIndexSequences(state, state.tracks)
    generateTrackIndexSequences(state, state.reads)
  }

  generateNodeSuccessors(state)
  generateNodeDegree(state)
  generateNodeOrder(state)

  // can cause problems when there is a reversed single track node
  // OTOH, can solve problems with complex inversion patterns
  switchNodeOrientation(state)
  generateNodeOrder(state)
  reverseReversedReads(state)
  generateTrackIndexSequences(state, state.reads)

  return {
    options: state.config,
    nodes: state.nodes,
    tracks: state.tracks,
    reads: state.reads,
    hasReads: inputReads.length > 0,
    nodeMap: state.nodeMap,
    maxOrder: getMaxOrder(state),
    trackForRuler: state.trackForRuler,
  }
}

function selectReads(
  topology: TubeMapTopology,
  { mappingQualityCutoff = 0, focusReadNames = null }: PlacementOptions,
): readonly TopologyTrack[] {
  const focus = focusReadNames ? new Set(focusReadNames) : null
  return topology.reads.filter(
    read =>
      (read.mapping_quality ?? 0) >= mappingQualityCutoff &&
      (focus === null || (read.name !== undefined && focus.has(read.name))),
  )
}

// Place copies of the topology's nodes, tracks and the given reads, measuring
// x from them or taking the topology's.
function place(
  topology: TubeMapTopology,
  reads: readonly TopologyTrack[],
  x: 'measure' | 'topology',
): TubeMapLayout {
  const state = emptyState(topology.options)
  topology.nodes.forEach((node, i) => {
    state.nodes[i] = { ...node } as LayoutNode
  })
  state.tracks = topology.tracks.map(track => ({ ...track }) as Track)
  state.reads = reads.map(read => ({ ...read }) as Track)
  state.nodeMap = topology.nodeMap
  state.maxOrder = topology.maxOrder
  state.trackForRuler = topology.trackForRuler

  // Coarsened (Sankey) mode normally collapses the *read* list into synthetic
  // per-edge bands (below). A haplotype-only graph has no reads to coarsen,
  // so a coarsened request there instead coarsens every haplotype but the
  // reference: that one keeps its normal per-track lane (so it still carries
  // the ruler) while the rest are pulled out of `tracks` here, before
  // calculateTrackWidth/generateLaneAssignment ever see them, and rejoin the
  // layout below through the same reads-style overlay used for coarsened
  // reads.
  let coarsened: Coarsening | undefined
  const coarsenHaplotypes =
    state.config.showReads &&
    state.config.coarsenedReadView &&
    !topology.hasReads
  if (coarsenHaplotypes) {
    const rulerIndex =
      state.trackForRuler === undefined
        ? -1
        : state.tracks.findIndex(t => t.name === state.trackForRuler)
    const refIndex = rulerIndex === -1 ? 0 : rulerIndex
    const ref = state.tracks[refIndex]!
    // A deduplicated reference walk also stands for the haplotypes identical to
    // it through the window; those belong in the bands, not the reference lane.
    const refDuplicates = (ref.freq ?? 1) - 1
    const refSigns = firstVisitSigns(state, ref)
    const altHaplotypes = state.tracks
      .filter((_, i) => i !== refIndex)
      .map(walk => orientedLike(refSigns, walk))
    if (refDuplicates > 0) altHaplotypes.push({ ...ref, freq: refDuplicates })
    if (altHaplotypes.length > 0) {
      const { bands, total } = buildCoarsenedSyntheticBands(
        state,
        altHaplotypes,
        'haplotype',
      )
      // A haplotype that only ever visits one node produces no edge, so an
      // all-single-node set of alts would otherwise leave `reads` empty and
      // fall through to the no-overlay branch below, which never gives their
      // nodes a y/contentHeight. Keep them off to the side instead of
      // dropping them silently.
      if (bands.length > 0) {
        state.tracks = [ref]
        state.reads = bands
        coarsened = { unit: 'haplotype', total, reverse: false }
      }
    }
  }

  calculateTrackWidth(state)
  generateLaneAssignment(state)
  // also places the nodes that only filtered-out reads visit
  generateReadOnlyNodeAttributes(state)

  // Coarsened (Sankey) mode: collapse the read list (or, when coarsening
  // haplotypes, the alt haplotypes pulled out above) to one synthetic "read"
  // per (srcSigned → dstSigned) edge BEFORE the normal read placement runs.
  // Each synthetic read traverses exactly two nodes, so the rest of the
  // pipeline (placeReads, generateSVGShapesFromPath, curve drawing) handles
  // it like any normal read: it gets a lane, picks up the "right-down-left-
  // up-right" topology for loops automatically, and uses the same elegant
  // bezier. Node heights end up proportional to *edge* count (typically
  // tens) rather than *read* or *haplotype* count (potentially thousands).
  if (
    state.config.coarsenedReadView &&
    state.reads.length > 0 &&
    !coarsenHaplotypes
  ) {
    const { bands, total } = buildCoarsenedSyntheticBands(
      state,
      state.reads,
      'read',
    )
    state.reads = bands
    coarsened = { unit: 'read', total, reverse: false }
  }
  if (coarsened !== undefined) {
    reverseReversedReads(state)
    generateTrackIndexSequences(state, state.reads)
    if (!state.config.ignoreStrand) {
      coarsened.reverse = state.reads.some(band => band.is_reverse === true)
    }
  }

  if (state.reads.length > 0) {
    placeReads(state)
    state.tracks = state.tracks.concat(state.reads)
  } else {
    state.nodes.forEach(node => {
      node.incomingReads = []
      node.outgoingReads = []
      node.internalReads = []
    })
  }

  if (x === 'measure') {
    generateNodeXCoords(state)
  }

  generateSVGShapesFromPath(state)
  debugLog('Tracks:', state.tracks)
  debugLog('Nodes:', state.nodes)
  debugLog('Lane assignment:', state.assignments)
  getImageDimensions(state)
  return {
    nodes: state.nodes,
    tracks: state.tracks,
    reads: state.reads,
    nodeMap: state.nodeMap,
    shapes: state.shapes,
    bounds: state.imageBounds,
    maxOrder: state.maxOrder,
    trackForRuler: state.trackForRuler,
    coarsenedEdgeMeta: state.coarsenedEdgeMeta,
    coarsened,
  }
}

// Return true if the given name names a reverse strand node, and false otherwise.
export function isReverse(nodeName: string): boolean {
  return nodeName.startsWith('-')
}

// Get the forward version of a node name, which may be either forward or backward (negative)
export function forward(nodeName: string): string {
  return isReverse(nodeName) ? nodeName.substring(1) : nodeName
}

// Get the reverse version of a node name, which may be either forward or backward (negative)
export function reverse(nodeName: string): string {
  return isReverse(nodeName) ? nodeName : `-${nodeName}`
}

// Get the opposite orientation node name for the given node.
export function flip(nodeName: string): string {
  return isReverse(nodeName) ? forward(nodeName) : reverse(nodeName)
}

// Whether a signed node index visits its node forward. Index 0 is never a
// node, so no visit is -0.
export function isForwardIndex(n: number): boolean {
  return n > 0
}

// Turn around every node the given track visits in reverse before it visits
// it forward, so that track reads left to right, and flip every track's and
// read's visits to those nodes to match, as switchNodeOrientationForPaths
// does for the nodes it switches.
function straightenTrack(state: LayoutState, index: number): void {
  const nodesToInvert = new Set<string>()
  const visitedForward = new Set<string>()
  for (const visit of state.tracks[index]!.sequence) {
    if (!isReverse(visit)) {
      visitedForward.add(visit)
    } else if (!visitedForward.has(forward(visit))) {
      nodesToInvert.add(forward(visit))
    }
  }
  if (nodesToInvert.size === 0) return

  for (const { sequence } of [...state.tracks, ...state.reads]) {
    for (let j = 0; j < sequence.length; j += 1) {
      if (nodesToInvert.has(forward(sequence[j]!))) {
        sequence[j] = flip(sequence[j]!)
      }
    }
  }

  state.nodes.forEach(node => {
    if (nodesToInvert.has(node.name)) {
      node.seq = getReverseComplement(node.seq)
    }
  })
}

// generates attributes (node.y, node.contentHeight) for nodes without tracks, only reads
function generateReadOnlyNodeAttributes(state: LayoutState): void {
  state.nodesPerOrder = []
  for (let i = 0; i <= state.maxOrder; i += 1) {
    state.nodesPerOrder[i] = []
  }

  const orderY = new Map<number, number>()
  state.nodes.forEach((node: MaybeUnplacedNode) => {
    if (node.y !== undefined) {
      setMapToMax(orderY, node.order, node.y + node.contentHeight)
    }
  })

  // for order values where there is no node with haplotypes, orderY is calculated via tracks
  state.tracks.forEach(track => {
    if (track.type === 'haplotype') {
      track.path.forEach(step => {
        setMapToMax(orderY, step.order, (step.y ?? 0) + track.width)
      })
    }
  })

  state.nodes.forEach((node: MaybeUnplacedNode, i) => {
    if (node.order >= 0 && node.y === undefined) {
      node.y = (orderY.get(node.order) ?? 0) + 25
      node.contentHeight = 0
      state.nodesPerOrder[node.order]!.push(i)
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

export const READ_WIDTH = 7

// add info about reads to nodes (incoming, outgoing and internal reads)
function assignReadsToNodes(state: LayoutState): void {
  state.nodes.forEach(node => {
    node.incomingReads = []
    node.outgoingReads = []
    node.internalReads = []
  })
  state.reads.forEach((read: MaybeUnset<Track, 'width'>, idx) => {
    // coarsened bands arrive sized by their crossing count
    if (read.width === undefined || read.width === 0) {
      read.width = READ_WIDTH
    }
    if (read.path.length === 1) {
      const firstNode = read.path[0]!.node
      if (firstNode !== null) {
        state.nodes[firstNode]!.internalReads.push(idx)
      }
    } else {
      read.path.forEach((element, pathIdx) => {
        if (pathIdx === 0) {
          const firstNode = read.path[0]!.node
          if (firstNode !== null) {
            state.nodes[firstNode]!.outgoingReads.push([idx, pathIdx])
          }
        } else {
          const elemNode = element.node
          if (elemNode !== null) {
            state.nodes[elemNode]!.incomingReads.push([idx, pathIdx])
          }
        }
      })
    }
  })
}

// calculate paths (incl. correct y coordinate) for all reads
function placeReads(state: LayoutState): void {
  state.reads.forEach(read => {
    read.path = basicPath(state, read)
  })
  assignReadsToNodes(state)

  // placed nodes by order, then by y-coordinate
  const sortedNodes = state.nodes.filter(node => node.order >= 0)
  sortedNodes.sort(compareNodesByOrder)

  // Organize read IDs by source track
  const readsBySource = new Map<number, Set<number>>()
  for (let i = 0; i < state.reads.length; i++) {
    const source = state.reads[i]!.sourceTrackID
    const bucket = readsBySource.get(source)
    if (bucket === undefined) {
      readsBySource.set(source, new Set([i]))
    } else {
      bucket.add(i)
    }
  }

  const allSources = Array.from(readsBySource.keys()).sort((a, b) => a - b)

  // Space out read tracks if multiple exist
  const topMargin = allSources.length > 1 ? READ_WIDTH : 0
  sortedNodes.forEach(node => {
    for (const source of allSources) {
      // Go through all source tracks in order

      // Place the reads from this source in this node.
      // Use a margin to separate multiple read tracks if we have them.
      placeReadSet(state, readsBySource.get(source)!, node, topMargin)
    }
  })

  // place read segments which are without node
  const bottomY = calculateBottomY(state)
  const elementsWithoutNode: ElementWithoutNode[] = []
  state.reads.forEach((read, idx) => {
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

  elementsWithoutNode.sort((a, b) => compareNoNodeReads(state, a, b))
  elementsWithoutNode.forEach(element => {
    const read = state.reads[element.readIndex]!
    const segment = read.path[element.pathIndex]!
    segment.y = bottomY[segment.order]!
    bottomY[segment.order]! += read.width
  })

  debugLog('Reads:', state.reads)
}

// Place a particular collection of reads, identified by a list of read
// numbers, into the given node at the right Y coordinates. All reads in all
// nodes above it, and no reads in any nodes below it, are already placed.
// Makes the given node bigger if needed and moves other nodes down if needed.
// If topMargin is set, applies that amount of spacing down from whatever is above the reads.
function placeReadSet(
  state: LayoutState,
  toPlace: Set<number>,
  node: LayoutNode,
  topMargin: number,
): void {
  // Get arrays of the read entry/exit/internal-ness records we want to work on
  let incomingReads = node.incomingReads.filter(([readID]) =>
    toPlace.has(readID),
  )
  const outgoingReads = node.outgoingReads.filter(([readID]) =>
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
  //   y:            the defined y at decisionStep, or undefined for "reached 0".
  // Smaller decisionStep wins; ties put the "reached 0" entries first;
  // otherwise compare y's.
  const incomingKeys = incomingReads.map(entry => {
    const [readID, pathIdx] = entry
    const path = state.reads[readID]!.path
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
    return { entry, decisionStep, y: foundY }
  })
  incomingKeys.sort(compareIncomingReadKeys)
  incomingReads = incomingKeys.map(k => k.entry)

  // place incoming reads
  let currentY = startY
  const occupiedUntil = new Map<number, number>()
  incomingReads.forEach(readElement => {
    const read = state.reads[readElement[0]]!
    read.path[readElement[1]]!.y = currentY
    setOccupiedUntil(occupiedUntil, read, readElement[1], currentY, node)
    currentY += read.width
  })
  let maxY = currentY

  // sort outgoing reads
  outgoingReads.sort((a, b) =>
    compareReadOutgoingSegmentsByGoingTo(state, a, b),
  )

  // place outgoing reads
  const occupiedFrom = new Map<number, number>()
  currentY = startY
  outgoingReads.forEach(readElement => {
    const read = state.reads[readElement[0]]!
    const firstNodeOffset = read.firstNodeOffset ?? 0
    // place in next lane
    read.path[readElement[1]]!.y = currentY
    occupiedFrom.set(currentY, firstNodeOffset)
    // if no conflicts. The original predicate was strict-less-than, which
    // treats two reads that exactly touch (incoming ends at base K, outgoing
    // starts at base K+1) as conflicting. They don't overlap, so they can
    // share a lane — relax to <=. This also matters for coarsened Sankey
    // bands at single-base nodes (e.g. a 1bp "G" node): with edge-only offsets
    // the math becomes 0+1 < 1 (conflict, wrong) vs. 0+1 <= 1 (no conflict).
    const occUntil = occupiedUntil.get(currentY)
    if (occUntil === undefined || occUntil + 1 <= firstNodeOffset) {
      currentY += read.width
      maxY = Math.max(maxY, currentY)
    } else {
      // otherwise push down incoming reads to make place for outgoing Read
      occupiedUntil.set(currentY, 0)
      incomingReads.forEach(incReadElementIndices => {
        const incRead = state.reads[incReadElementIndices[0]]!
        const incReadPathElement = incRead.path[incReadElementIndices[1]]!
        if (
          incReadPathElement.y !== undefined &&
          incReadPathElement.y >= currentY
        ) {
          incReadPathElement.y += read.width
          setOccupiedUntil(
            occupiedUntil,
            incRead,
            incReadElementIndices[1],
            incReadPathElement.y,
            node,
          )
        }
      })
      currentY += read.width
      maxY += read.width
    }
  })

  // sort internal reads
  internalReads.sort((a, b) => compareInternalReads(state, a, b))

  // place internal reads
  internalReads.forEach(readIdx => {
    const currentRead = state.reads[readIdx]!
    const firstNodeOffset = currentRead.firstNodeOffset ?? 0
    const finalNodeCoverLength = currentRead.finalNodeCoverLength ?? 0
    currentY = startY
    while (
      firstNodeOffset < (occupiedUntil.get(currentY) ?? -Infinity) + 2 ||
      finalNodeCoverLength > (occupiedFrom.get(currentY) ?? Infinity) - 3
    ) {
      currentY += currentRead.width || READ_WIDTH
    }
    currentRead.path[0]!.y = currentY
    occupiedUntil.set(currentY, finalNodeCoverLength)
    maxY = Math.max(maxY, currentY)
  })

  // adjust node height and move other nodes vertically down
  const heightIncrease = maxY - node.y - node.contentHeight
  node.contentHeight += heightIncrease
  adjustVertically3(state, node, heightIncrease)
}

// The decorated sort key for one incoming read segment; see the comment in
// placeReadSet for how it is derived. Exported for testing.
export interface IncomingReadKey {
  decisionStep: number
  y: number | undefined
}

// Smaller decisionStep wins. On a tie, entries that walked off the front of the
// path (no defined y) sort first and tie with each other; otherwise compare y.
export function compareIncomingReadKeys(
  a: IncomingReadKey,
  b: IncomingReadKey,
): number {
  if (a.decisionStep !== b.decisionStep) {
    return a.decisionStep - b.decisionStep
  }
  if (a.y === undefined || b.y === undefined) {
    return (a.y === undefined ? 0 : 1) - (b.y === undefined ? 0 : 1)
  }
  return a.y - b.y
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
    map.set(y, node.sequenceLength)
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
  state: LayoutState,
  a: ElementWithoutNode,
  b: ElementWithoutNode,
): number {
  const readA = state.reads[a.readIndex]!
  const readB = state.reads[b.readIndex]!
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
    const prevNodeA = state.nodes[a.previousNode]
    const prevNodeB = state.nodes[b.previousNode]
    if (prevNodeA && prevNodeB && prevNodeA.order !== prevNodeB.order) {
      return prevNodeA.order - prevNodeB.order
    }
  }
  // Segments on the reverse-going part of a cycle go below the rest, in
  // reverse order, so a loop that starts on the outside stays there and rolls
  // up in order with the other loops.
  const aPrev = a.previousY ?? 0
  const bPrev = b.previousY ?? 0
  const aReverse = segmentA.betweenCycleReverseTraversal === true
  const bReverse = segmentB.betweenCycleReverseTraversal === true
  if (aReverse !== bReverse) {
    return aReverse ? 1 : -1
  }
  return aReverse ? bPrev - aPrev : aPrev - bPrev
}

// compare read segments by where they are going to
function compareReadOutgoingSegmentsByGoingTo(
  state: LayoutState,
  [readIndexA, pathIndexA]: [number, number],
  [readIndexB, pathIndexB]: [number, number],
): number {
  // Expect two arrays both containing 2 integers.
  // The first index of each array contains the read index
  // The second index of each array contains the path index

  // Segments are first sorted by the y value of their last node,
  // then by the node they end on,
  // then by length in final node
  const readA = state.reads[readIndexA]!
  const readB = state.reads[readIndexB]!
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
  let nodeA: LayoutNode | null | undefined =
    initialNodeA != null ? state.nodes[initialNodeA] : null
  let nodeB: LayoutNode | null | undefined =
    initialNodeB != null ? state.nodes[initialNodeB] : null
  // Follow the reads' paths until we find the node they diverge at
  // Or, they go through all the same nodes and we do a tiebreaker at the end
  while (nodeA != null && nodeB != null && nodeA === nodeB) {
    if (pathIndexA < readA.path.length - 1) {
      pathIndexA += 1
      while (readA.path[pathIndexA]?.node === null) pathIndexA += 1 // skip null nodes in path
      const nextNodeIdx = readA.path[pathIndexA]?.node
      nodeA = nextNodeIdx != null ? state.nodes[nextNodeIdx] : null
    } else {
      nodeA = null
    }
    if (pathIndexB < readB.path.length - 1) {
      pathIndexB += 1
      while (readB.path[pathIndexB]?.node === null) pathIndexB += 1 // skip null nodes in path
      const nextNodeIdx = readB.path[pathIndexB]?.node
      nodeB = nextNodeIdx != null ? state.nodes[nextNodeIdx] : null
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
  const beginDiff = (readA.firstNodeOffset ?? 0) - (readB.firstNodeOffset ?? 0)
  if (beginDiff !== 0) return beginDiff

  // break tie: both reads cover the same nodes and begin at the same position

  // One or both reads didn't have a previously valid Y value, compare by the endPosition of the read
  return (readA.finalNodeCoverLength ?? 0) - (readB.finalNodeCoverLength ?? 0)
}

// Compare tracks based on ordering at their first convergence
function compareTrackByInitialOrdering(trackA: Track, trackB: Track): number {
  // Find the first node where the two tracks converge, sort by layer.
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
function compareInternalReads(
  state: LayoutState,
  idxA: number,
  idxB: number,
): number {
  const a = state.reads[idxA]!
  const b = state.reads[idxB]!
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
function calculateBottomY(state: LayoutState): number[] {
  const bottomY: number[] = []
  for (let i = 0; i <= state.maxOrder; i += 1) {
    bottomY.push(0)
  }

  state.nodes.forEach((node: MaybeUnplacedNode) => {
    if (node.y !== undefined) {
      bottomY[node.order] = Math.max(
        bottomY[node.order]!,
        node.y + node.contentHeight + 20,
      )
    }
  })

  state.tracks.forEach(track => {
    track.path.forEach(element => {
      bottomY[element.order] = Math.max(
        bottomY[element.order]!,
        (element.y ?? 0) + track.width,
      )
    })
  })
  return bottomY
}

// The segments a track draws, in order: one per node visit, plus one per
// order slot it passes or turns around in without visiting a node. They carry
// no lanes or coordinates yet.
function basicPath(state: LayoutState, track: Track): Segment[] {
  const path: Segment[] = []
  const pass = (order: number, isForward: boolean): void => {
    path.push({ order, isForward, node: null })
  }
  const visit = (order: number, isForward: boolean, node: number): void => {
    path.push({ order, isForward, node })
  }

  let currentNodeIndex = Math.abs(track.indexSequence[0]!)
  let currentNodeIsForward = isForwardIndex(track.indexSequence[0]!)
  let currentNode = state.nodes[currentNodeIndex]!
  visit(currentNode.order, currentNodeIsForward, currentNodeIndex)

  for (let i = 1; i < track.sequence.length; i += 1) {
    const previousNode = currentNode
    const previousNodeIsForward = currentNodeIsForward
    currentNodeIndex = Math.abs(track.indexSequence[i]!)
    currentNodeIsForward = isForwardIndex(track.indexSequence[i]!)
    currentNode = state.nodes[currentNodeIndex]!
    const { order } = currentNode

    if (order > previousNode.order) {
      if (!previousNodeIsForward) pass(previousNode.order, true)
      for (let j = previousNode.order + 1; j < order; j += 1) pass(j, true)
      if (!currentNodeIsForward) pass(order, true)
    } else if (order < previousNode.order) {
      if (previousNodeIsForward) pass(previousNode.order, false)
      for (let j = previousNode.order - 1; j > order; j -= 1) pass(j, false)
      if (currentNodeIsForward) pass(order, false)
    } else if (currentNodeIsForward === previousNodeIsForward) {
      pass(order, !currentNodeIsForward)
    }
    visit(order, currentNodeIsForward, currentNodeIndex)
  }
  return path
}

// reverse reads which are reversed
function reverseReversedReads(state: LayoutState): void {
  state.reads.forEach(read => {
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
      for (const entry of sequenceNew) {
        entry.nodeName = forward(entry.nodeName) // visit nodes forward
        reverseMismatches(
          entry.mismatches,
          nodeByName(state, entry.nodeName).sequenceLength,
        )
      }

      // adjust firstNodeOffset and finalNodeCoverLength
      const temp = read.firstNodeOffset ?? 0
      const firstLen = nodeByName(state, read.sequence[0]!).sequenceLength
      read.firstNodeOffset = firstLen - (read.finalNodeCoverLength ?? 0)
      const lastLen = nodeByName(
        state,
        read.sequence[read.sequence.length - 1]!,
      ).sequenceLength
      read.finalNodeCoverLength = lastLen - temp
    }
  })
}

// Flip a node's mismatches onto the opposite strand: positions are measured
// from the other end of the node, and sequences are reverse-complemented.
// sequenceLength (not node.width, which is only equal to it in 'normal'
// node-width mode) is the right pivot because mismatch positions are base
// offsets.
export function reverseMismatches(
  mismatches: Mismatch[],
  sequenceLength: number,
): void {
  mismatches.forEach(mm => {
    Object.assign(mm, mirroredMismatch(mm, sequenceLength))
  })
}

export function mirroredMismatch(
  mm: Mismatch,
  sequenceLength: number,
): Mismatch {
  const span =
    mm.type === 'insertion'
      ? 0
      : mm.type === 'deletion'
        ? (mm.length ?? 0)
        : (mm.seq?.length ?? 0)
  return {
    ...mm,
    pos: sequenceLength - mm.pos - span,
    ...(mm.seq !== undefined && { seq: getReverseComplement(mm.seq) }),
  }
}

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }

function getReverseComplement(s: string): string {
  let result = ''
  for (let i = s.length - 1; i >= 0; i -= 1) {
    result += COMPLEMENT[s.charAt(i)] ?? 'N'
  }
  return result
}

// for each track: generate sequence of node indices from seq. of node names.
// Tracks revisit the same names, so each name resolves once per call.
function generateTrackIndexSequences(
  state: LayoutState,
  tracksOrReads: Track[],
): void {
  const signedIndexOf = new Map<string, number>()
  tracksOrReads.forEach(track => {
    track.indexSequence = track.sequence.map(nodeName => {
      let signed = signedIndexOf.get(nodeName)
      if (signed === undefined) {
        const index = state.nodeMap.get(forward(nodeName))
        if (index === undefined) {
          throw new Error(
            `Track ${track.name ?? track.id} visits unknown node ${nodeName}`,
          )
        }
        signed = isReverse(nodeName) ? -index : index
        signedIndexOf.set(nodeName, signed)
      }
      return signed
    })
  })
}

// Tracks enter and leave a node this far outside it horizontally. Note that
// getImageDimensions() below only adds it on the right: the pannable area
// understates the left edge of the drawing by this much.
const NODE_HORIZONTAL_SLACK = 20

// get the minimum and maximum coordinates used in the image to calculate image dimensions
function getImageDimensions(state: LayoutState): void {
  // Sentinels, deliberately crossed: if nothing below runs, minZoom() and
  // alignSVG() detect the empty content rather than computing a negative scale.
  const bounds: ImageBounds = { minX: 99, maxX: -99, minY: 99, maxY: -99 }

  state.nodes.forEach((node: MaybeUnplacedNode) => {
    if (node.x !== undefined) {
      bounds.minX = Math.min(bounds.minX, node.x)
      bounds.maxX = Math.max(
        bounds.maxX,
        node.x + NODE_HORIZONTAL_SLACK + node.pixelWidth,
      )
    }
    if (node.y !== undefined) {
      bounds.minY = Math.min(bounds.minY, node.y - 10)
      bounds.maxY = Math.max(bounds.maxY, node.y + node.contentHeight + 10)
    }
  })

  state.tracks.forEach(track => {
    track.path.forEach(segment => {
      const y = segment.y ?? 0
      bounds.maxY = Math.max(bounds.maxY, y + track.width)
      bounds.minY = Math.min(bounds.minY, y)
    })
  })

  state.imageBounds = bounds
}

// Resolve a (possibly reverse-oriented) node name to its layout node. Every
// caller runs after generateNodeMap, so a miss is a programming error.
function nodeByName(state: LayoutState, nodeName: string): LayoutNode {
  const index = state.nodeMap.get(forward(nodeName))
  const node = index === undefined ? undefined : state.nodes[index]
  if (node === undefined) {
    throw new Error(`Unknown node ${nodeName}`)
  }
  return node
}

// map node names to node indices
function generateNodeMap(state: LayoutState): Map<string, number> {
  const nodeMap = new Map<string, number>()
  state.nodes.forEach((node, index) => {
    nodeMap.set(node.name, index)
  })
  return nodeMap
}

// adds a successor-array to each node containing the indices of the nodes coming directly after the current node
function generateNodeSuccessors(state: LayoutState): void {
  const successorSets: Set<number>[] = state.nodes.map(() => new Set())
  const predecessorSets: Set<number>[] = state.nodes.map(() => new Set())

  const addEdges = (track: Track): void => {
    for (let i = 0; i < track.indexSequence.length - 1; i += 1) {
      const current = Math.abs(track.indexSequence[i]!)
      const follower = Math.abs(track.indexSequence[i + 1]!)
      successorSets[current]!.add(follower)
      predecessorSets[follower]!.add(current)
    }
  }

  state.tracks.forEach(addEdges)
  state.reads.forEach(addEdges)

  state.nodes.forEach((node, i) => {
    node.successors = Array.from(successorSets[i]!)
    node.predecessors = Array.from(predecessorSets[i]!)
  })
}

function generateNodeOrderOfSingleTrack(
  state: LayoutState,
  sequence: number[],
): void {
  let forwardOrder = 0
  let backwardOrder = 0
  let minOrder = 0

  sequence.forEach(nodeIndex => {
    const idx = Math.abs(nodeIndex)
    if (nodeIndex < 0) {
      const order = (state.nodeOrders[idx] ??= backwardOrder)
      if (order < minOrder) minOrder = order
      forwardOrder = order
      backwardOrder = order - 1
    } else {
      const order = (state.nodeOrders[idx] ??= forwardOrder)
      forwardOrder = order + 1
      backwardOrder = order
    }
  })
  if (minOrder < 0) {
    increaseOrderForAllNodes(state, -minOrder)
  }
}

// calculate the order-value of nodes contained in sequence which are to the left of the first node which already has an order-value
function generateNodeOrderTrackBeginning(
  state: LayoutState,
  sequence: number[],
): number | null {
  let anchorIndex = 0
  let minOrder = 0

  while (
    anchorIndex < sequence.length &&
    state.nodeOrders[Math.abs(sequence[anchorIndex]!)] === undefined
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
    currentOrder = state.nodeOrders[anchorSeqVal]! - 1
    increment = -1
  } else {
    // reverse node
    currentOrder = state.nodeOrders[-anchorSeqVal]! + 1
    increment = 1
  }

  for (let j = anchorIndex - 1; j >= 0; j -= 1) {
    // assign order to nodes which are left of anchor node
    const idx = Math.abs(sequence[j]!)
    if (state.nodeOrders[idx] === undefined) {
      state.nodeOrders[idx] = currentOrder
      minOrder = Math.min(minOrder, currentOrder)
      currentOrder += increment
    }
  }

  if (minOrder < 0) {
    increaseOrderForAllNodes(state, -minOrder)
  }
  return anchorIndex
}

// Sentinel order for nodes no track or read reaches.
export const UNREACHABLE_ORDER = -1

// Replace every unassigned entry with UNREACHABLE_ORDER, producing a dense
// array. Holes matter here: `new Array(n)` is all holes and forEach/map skip
// them, so an in-place forEach would leave the sentinel unset.
export function fillUnassignedOrders(
  orders: readonly (number | undefined)[],
): number[] {
  const filled: number[] = []
  for (const order of orders) {
    filled.push(order ?? UNREACHABLE_ORDER)
  }
  return filled
}

// generate global sequence of nodes from left to right, starting with first track and adding other tracks sequentially
function generateNodeOrder(state: LayoutState): void {
  let modifiedSequence: number[]
  let currentOrder: number
  let rightIndex: number | null
  let leftIndex: number
  let minOrder = 0
  const tracksAndReads = state.tracks.concat(state.reads)
  const reachability: ReachabilityScratch = {
    stamp: new Int32Array(state.nodes.length),
    generation: 0,
  }

  // fill() makes the array dense: `new Array(n)` alone is all holes, which
  // forEach skips, so neither the sentinel pass nor the copy-back below ran.
  state.nodeOrders = new Array<number | undefined>(state.nodes.length).fill(
    undefined,
  )
  // Widened to Node, whose order is optional, to clear the previous run's orders
  state.nodes.forEach((node: Node) => {
    node.order = undefined
  })

  generateNodeOrderOfSingleTrack(state, state.tracks[0]!.indexSequence)

  for (let i = 1; i < tracksAndReads.length; i += 1) {
    debugLog(`generating order for track ${i + 1}`)
    rightIndex = generateNodeOrderTrackBeginning(
      state,
      tracksAndReads[i]!.indexSequence,
    )
    if (rightIndex === null) {
      if (i < state.tracks.length) {
        generateNodeOrderOfSingleTrack(state, tracksAndReads[i]!.indexSequence)
      } else {
        tracksAndReads.splice(i, 1)
        state.reads.splice(i - state.tracks.length, 1)
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
        state.nodeOrders[modifiedSequence[rightIndex]!] === undefined
      ) {
        rightIndex += 1
      }

      if (rightIndex < modifiedSequence.length) {
        // middle segment between two anchors
        currentOrder = state.nodeOrders[modifiedSequence[leftIndex]!]! + 1
        for (let j = leftIndex + 1; j < rightIndex; j += 1) {
          state.nodeOrders[modifiedSequence[j]!] = currentOrder
          currentOrder += 1
        }

        if (
          state.nodeOrders[modifiedSequence[rightIndex]!]! >
          state.nodeOrders[modifiedSequence[leftIndex]!]!
        ) {
          if (state.nodeOrders[modifiedSequence[rightIndex]!]! < currentOrder) {
            increaseOrderForSuccessors(
              state,
              modifiedSequence[rightIndex]!,
              modifiedSequence[rightIndex - 1]!,
              currentOrder,
            )
          }
        } else {
          if (
            tracksAndReads[i]!.indexSequence[rightIndex]! >= 0 &&
            !isSuccessor(
              state,
              modifiedSequence[rightIndex]!,
              modifiedSequence[leftIndex]!,
              reachability,
            )
          ) {
            // no real reversal
            increaseOrderForSuccessors(
              state,
              modifiedSequence[rightIndex]!,
              modifiedSequence[rightIndex - 1]!,
              currentOrder,
            )
          } else {
            // real reversal
            if (
              tracksAndReads[i]!.indexSequence[leftIndex]! < 0 ||
              (state.nodes[modifiedSequence[leftIndex + 1]!]!.degree < 2 &&
                state.nodeOrders[modifiedSequence[rightIndex]!]! <
                  state.nodeOrders[modifiedSequence[leftIndex]!]!)
            ) {
              currentOrder = state.nodeOrders[modifiedSequence[leftIndex]!]! - 1
              for (let j = leftIndex + 1; j < rightIndex; j += 1) {
                state.nodeOrders[modifiedSequence[j]!] = currentOrder
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
          currentOrder = state.nodeOrders[modifiedSequence[leftIndex]!]! + 1
          for (let j = leftIndex + 1; j < modifiedSequence.length; j += 1) {
            const idx = modifiedSequence[j]!
            if (state.nodeOrders[idx] === undefined) {
              state.nodeOrders[idx] = currentOrder
              currentOrder += 1
            }
          }
        } else {
          // elongate towards the left
          currentOrder = state.nodeOrders[modifiedSequence[leftIndex]!]! - 1
          for (let j = leftIndex + 1; j < modifiedSequence.length; j += 1) {
            const idx = modifiedSequence[j]!
            if (state.nodeOrders[idx] === undefined) {
              state.nodeOrders[idx] = currentOrder
              minOrder = Math.min(minOrder, currentOrder)
              currentOrder -= 1
            }
          }
        }
      }
    }
  }

  if (minOrder < 0) increaseOrderForAllNodes(state, -minOrder)

  // Nodes unreachable from any track get UNREACHABLE_ORDER so every node ends
  // up with a defined order; downstream code uses `order >= 0` to skip them.
  const finalOrders = fillUnassignedOrders(state.nodeOrders)
  state.nodeOrders = finalOrders
  finalOrders.forEach((order, i) => {
    const node = state.nodes[i]
    if (node !== undefined) {
      node.order = order
    }
  })
}

// Reusable visited-set for the reachability searches in generateNodeOrder.
// Stamping with a generation counter avoids reallocating (and re-zeroing) an
// array of nodes.length booleans on every call.
interface ReachabilityScratch {
  stamp: Int32Array
  generation: number
}

function isSuccessor(
  state: LayoutState,
  first: number,
  second: number,
  scratch: ReachabilityScratch,
): boolean {
  scratch.generation += 1
  const { stamp, generation } = scratch
  const stack: number[] = [first]
  stamp[first] = generation
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === second) return true
    for (const childIndex of state.nodes[current]!.successors) {
      if (stamp[childIndex] !== generation) {
        stamp[childIndex] = generation
        stack.push(childIndex)
      }
    }
  }
  return false
}

// get order number of the rightmost node
function getMaxOrder(state: LayoutState): number {
  let max = -1
  state.nodeOrders.forEach(order => {
    if (order !== undefined && order > max) max = order
  })
  return max
}

// generates sequence keeping the order but switching all reversed (negative) nodes to forward nodes
function uninvert(sequence: number[]): number[] {
  return sequence.map(v => Math.abs(v))
}

// increases the order-value of all nodes by amount
function increaseOrderForAllNodes(state: LayoutState, amount: number): void {
  state.nodeOrders.forEach((order, i) => {
    if (order !== undefined) state.nodeOrders[i] = order + amount
  })
}

// increases the order-value for currentNode and (if necessary) successor nodes recursively
function increaseOrderForSuccessors(
  state: LayoutState,
  startingNode: number,
  tabuNode: number,
  newOrder: number,
): void {
  const increasedOrders = new Map<number, number>()
  // Walked with a head pointer rather than shift(), which is O(length) per pop.
  const queue: [number, number][] = [[startingNode, newOrder]]
  let head = 0

  while (head < queue.length) {
    const [currentNode, currentOrder] = queue[head]!
    head += 1
    const currentNodeOrder = state.nodeOrders[currentNode]

    if (currentNodeOrder !== undefined && currentNodeOrder < currentOrder) {
      if (
        !increasedOrders.has(currentNode) ||
        increasedOrders.get(currentNode)! < currentOrder
      ) {
        increasedOrders.set(currentNode, currentOrder)
        state.nodes[currentNode]!.successors.forEach(successor => {
          if (
            state.nodeOrders[successor]! > currentNodeOrder &&
            successor !== tabuNode
          ) {
            // only increase order of successors to the right of currentNode
            queue.push([successor, currentOrder + 1])
          }
        })
        if (currentNode !== startingNode) {
          state.nodes[currentNode]!.predecessors.forEach(predecessor => {
            if (
              state.nodeOrders[predecessor]! > currentNodeOrder &&
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
    state.nodeOrders[key] = value
  })
}

// calculates the node degree: the number of tracks passing through the node / the node height
function generateNodeDegree(state: LayoutState): void {
  state.nodes.forEach(node => {
    node.tracks = []
  })

  state.tracks.forEach(track => {
    track.indexSequence.forEach(nodeIndex => {
      state.nodes[Math.abs(nodeIndex)]!.tracks.push(track.id)
    })
  })

  state.nodes.forEach(node => {
    node.degree = node.tracks.length
  })
}

// Orient the nodes to suit the tracks and reads
function switchNodeOrientation(state: LayoutState): void {
  switchNodeOrientationForPaths(
    state,
    [...state.tracks.slice(1), ...state.reads],
    state.tracks[0]!,
  )
}

// If more of the given paths pass through a specific node in reverse direction than in
// regular direction, switch its orientation. Nodes the pivot path visits
// forward keep theirs. Processes all paths' nodes in place, reading each
// visit's node from its indexSequence, which must match its sequence.
function switchNodeOrientationForPaths(
  state: LayoutState,
  paths: Track[],
  pivotPath: Track,
): void {
  const scores = new Int32Array(state.nodes.length)
  const onPivot = new Uint8Array(state.nodes.length)
  for (const nodeName of pivotPath.sequence) {
    const index = isReverse(nodeName) ? undefined : state.nodeMap.get(nodeName)
    if (index !== undefined) onPivot[index] = 1
  }

  for (const path of paths) {
    const { sequence, indexSequence } = path
    const last = indexSequence.length - 1
    for (let j = 0; j <= last; j += 1) {
      const index = Math.abs(indexSequence[j]!)
      if (onPivot[index] === 1) continue
      const order = state.nodes[index]!.order
      const prevOrder =
        j > 0 ? state.nodes[Math.abs(indexSequence[j - 1]!)]!.order : undefined
      const nextOrder =
        j < last
          ? state.nodes[Math.abs(indexSequence[j + 1]!)]!.order
          : undefined
      // A reverse visit votes for switching when the path runs left to right
      // through the node, and against when it runs right to left.
      const vote = isReverse(sequence[j]!) ? 1 : -1
      if (
        (prevOrder === undefined || prevOrder < order) &&
        (nextOrder === undefined || order < nextOrder)
      ) {
        scores[index]! += vote
      }
      if (
        (prevOrder === undefined || prevOrder > order) &&
        (nextOrder === undefined || order > nextOrder)
      ) {
        scores[index]! -= vote
      }
    }
  }

  for (const path of paths) {
    const { sequence, indexSequence } = path
    for (let j = 0; j < indexSequence.length; j += 1) {
      if (scores[Math.abs(indexSequence[j]!)]! > 0) {
        sequence[j] = flip(sequence[j]!)
        indexSequence[j] = -indexSequence[j]!
      }
    }
  }

  state.nodes.forEach((node, index) => {
    if (scores[index]! > 0) {
      node.seq = getReverseComplement(node.seq)
      node.switched = true
    }
  })
}

// calculates the concrete values for the nodes' x-coordinates
function generateNodeXCoords(state: LayoutState): void {
  let currentX = 0
  let nextX = 20
  let currentOrder = -1
  const sortedNodes = state.nodes.slice()
  sortedNodes.sort(compareNodesByOrder)
  const extra = calculateExtraSpace(state)

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
function calculateExtraSpace(state: LayoutState): number[] {
  const leftSideEdges: number[] = []
  const rightSideEdges: number[] = []
  const fallAngleAdjustment: number[] = []
  const extra: number[] = []

  for (let i = 0; i <= state.maxOrder; i += 1) {
    leftSideEdges.push(0)
    rightSideEdges.push(0)
    fallAngleAdjustment.push(0)
  }

  state.tracks.forEach(track => {
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
  for (let i = 1; i <= state.maxOrder; i += 1) {
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
function generateLaneAssignment(state: LayoutState): void {
  // For each horizontal order slot, for each track number, holds the
  // SegmentAssignment object for the visit of that track to that order slot.
  // When an order slot is visited multiple times, holds whatever
  // SegmentAssignment was created most recently.
  const prevSegmentPerOrderPerTrack: SegmentAssignment[][] = []
  // Index into assignments[order] by node, so addToAssignment can find an
  // existing entry without scanning the whole order slot.
  const assignmentByOrderAndNode: Map<number, NodeAssignment>[] = []

  // create empty variables
  for (let i = 0; i <= state.maxOrder; i += 1) {
    state.assignments[i] = []
    assignmentByOrderAndNode[i] = new Map()
    prevSegmentPerOrderPerTrack[i] = []
  }

  // Record each track's segments in the order slots they cross, leaving the
  // lanes for the sweep below.
  state.tracks.forEach((track, trackNo) => {
    track.path = basicPath(state, track)
    track.path.forEach((segment, segmentNumber) => {
      addToAssignment(
        state,
        segment.order,
        segment.node,
        trackNo,
        segmentNumber,
        prevSegmentPerOrderPerTrack,
        assignmentByOrderAndNode,
      )
    })
  })

  // Now sweep left to right across order slots and assign vertical lanes to all the segments.
  for (let i = 0; i <= state.maxOrder; i += 1) {
    generateSingleLaneAssignment(state, state.assignments[i]!, i) // this is where the lanes get assigned
  }
}

function addToAssignment(
  state: LayoutState,
  order: number,
  nodeIndex: number | null,
  trackNo: number,
  segmentID: number,
  prevSegmentPerOrderPerTrack: SegmentAssignment[][],
  assignmentByOrderAndNode: Map<number, NodeAssignment>[],
): void {
  const segment: SegmentAssignment = {
    trackID: trackNo,
    segmentID,
    compareToFromSame: prevSegmentPerOrderPerTrack[order]![trackNo] ?? null,
  }
  // A null node means the track is passing through / turning around here rather
  // than visiting a node, so such segments never share a NodeAssignment.
  const existing =
    nodeIndex === null
      ? undefined
      : assignmentByOrderAndNode[order]!.get(nodeIndex)

  if (existing === undefined) {
    const assignment: NodeAssignment = {
      type: 'single',
      node: nodeIndex,
      tracks: [segment],
    }
    state.assignments[order]!.push(assignment)
    if (nodeIndex !== null) {
      assignmentByOrderAndNode[order]!.set(nodeIndex, assignment)
    }
  } else {
    // add to existing node in assignment
    existing.type = 'multiple'
    existing.tracks.push(segment)
  }
  prevSegmentPerOrderPerTrack[order]![trackNo] = segment
}

// looks at assignment and sets idealY and idealLane by looking at where the tracks come from
function getIdealLanesAndCoords(
  state: LayoutState,
  assignment: NodeAssignment[],
  order: number,
): void {
  let index: number

  assignment.forEach(node => {
    node.idealLane = 0
    node.tracks.forEach(track => {
      if (track.segmentID === 0) {
        track.idealLane = track.trackID
        track.idealY = null
      } else {
        if (
          state.tracks[track.trackID]!.path[track.segmentID - 1]!.order ===
          order - 1
        ) {
          track.idealLane =
            state.tracks[track.trackID]!.path[track.segmentID - 1]!.lane ??
            undefined
          track.idealY =
            state.tracks[track.trackID]!.path[track.segmentID - 1]!.y
        } else if (
          track.segmentID < state.tracks[track.trackID]!.path.length - 1 &&
          state.tracks[track.trackID]!.path[track.segmentID + 1]!.order ===
            order - 1
        ) {
          track.idealLane =
            state.tracks[track.trackID]!.path[track.segmentID + 1]!.lane ??
            undefined
          track.idealY =
            state.tracks[track.trackID]!.path[track.segmentID + 1]!.y
        } else {
          index = track.segmentID - 1
          while (
            index >= 0 &&
            state.tracks[track.trackID]!.path[index]!.order !== order - 1
          ) {
            index -= 1
          }
          if (index < 0) {
            track.idealLane = track.trackID
            track.idealY = null
          } else {
            track.idealLane = state.tracks[track.trackID]!.path[index]!.lane
            track.idealY = state.tracks[track.trackID]!.path[index]!.y
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
function generateSingleLaneAssignment(
  state: LayoutState,
  assignment: NodeAssignment[],
  order: number,
): void {
  let currentLane = 0
  const potentialAdjustmentValues = new Set<number>()
  let currentY = 20
  let prevNameIsNull = false
  let prevTrack = -1

  getIdealLanesAndCoords(state, assignment, order)
  assignment.sort(compareByIdealLane)

  assignment.forEach(node => {
    if (node.node !== null) {
      state.nodes[node.node]!.topLane = currentLane
      if (prevNameIsNull) currentY -= 10
      state.nodes[node.node]!.y = currentY
      state.nodes[node.node]!.contentHeight = 0
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
      state.tracks[track.trackID]!.path[track.segmentID]!.lane = currentLane
      state.tracks[track.trackID]!.path[track.segmentID]!.y = currentY
      if (track.idealY != null) {
        potentialAdjustmentValues.add(track.idealY - currentY)
      }
      currentLane += 1
      currentY += state.tracks[track.trackID]!.width
      if (node.node !== null) {
        state.nodes[node.node]!.contentHeight +=
          state.tracks[track.trackID]!.width
      }
      prevTrack = track.trackID
    })
    currentY += 25
  })

  adjustVertically(state, assignment, potentialAdjustmentValues)
}

// moves all tracks at a single horizontal location (=order) up/down to minimize lane changes
function adjustVertically(
  state: LayoutState,
  assignment: NodeAssignment[],
  potentialAdjustmentValues: Set<number>,
): void {
  let verticalAdjustment = 0
  let minAdjustmentCost = Number.MAX_SAFE_INTEGER

  potentialAdjustmentValues.forEach(moveBy => {
    const cost = getVerticalAdjustmentCost(state, assignment, moveBy)
    if (cost < minAdjustmentCost) {
      minAdjustmentCost = cost
      verticalAdjustment = moveBy
    }
  })

  assignment.forEach(node => {
    if (node.node !== null) {
      state.nodes[node.node]!.y += verticalAdjustment
    }
    node.tracks.forEach(track => {
      const seg = state.tracks[track.trackID]!.path[track.segmentID]!
      seg.y = seg.y! + verticalAdjustment
    })
  })
}

// Budge down all nodes and out-of-node tracks below this node by this amount
function adjustVertically3(
  state: LayoutState,
  node: LayoutNode,
  adjustBy: number,
): void {
  if (node.order < 0 || state.assignments[node.order] === undefined) return
  state.assignments[node.order]!.forEach(assignmentNode => {
    if (assignmentNode.node !== null) {
      const aNode = state.nodes[assignmentNode.node]!
      if (aNode !== node && aNode.y > node.y) {
        aNode.y += adjustBy
        assignmentNode.tracks.forEach(track => {
          const seg = state.tracks[track.trackID]!.path[track.segmentID]!
          seg.y = seg.y! + adjustBy
        })
      }
    } else {
      // track-segment not within a node
      assignmentNode.tracks.forEach(track => {
        const seg = state.tracks[track.trackID]!.path[track.segmentID]!
        if (seg.y! >= node.y) {
          seg.y = seg.y! + adjustBy
        }
      })
    }
  })
  if (state.nodesPerOrder[node.order]!.length > 0) {
    state.nodesPerOrder[node.order]!.forEach(nodeIndex => {
      if (
        state.nodes[nodeIndex] !== node &&
        state.nodes[nodeIndex]!.y > node.y
      ) {
        state.nodes[nodeIndex]!.y += adjustBy
      }
    })
  }
}

// calculates cost of vertical adjustment as vertical distance * width of track
function getVerticalAdjustmentCost(
  state: LayoutState,
  assignment: NodeAssignment[],
  moveBy: number,
): number {
  let result = 0
  assignment.forEach(node => {
    node.tracks.forEach(track => {
      if (
        track.idealY != null &&
        state.tracks[track.trackID]!.type !== 'read'
      ) {
        result +=
          Math.abs(
            track.idealY -
              moveBy -
              state.tracks[track.trackID]!.path[track.segmentID]!.y!,
          ) * state.tracks[track.trackID]!.width
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
  a: MaybeUnplacedNode,
  b: MaybeUnplacedNode,
): number {
  if (a.order !== b.order) return a.order - b.order
  if (a.y !== undefined && b.y !== undefined) return a.y - b.y
  return 0
}

function calculateTrackWidth(state: LayoutState): void {
  // flag: if vg returns freq of 0 for all tracks, we will increase width manually
  let allAreFour = true

  const NARROW_WIDTH = 4
  const WIDE_WIDTH = state.config.trackWidth

  for (const track of state.tracks) {
    if (track.freq !== undefined) {
      track.width = Math.round(
        (Math.log(Math.max(track.freq, 1)) + 1) * NARROW_WIDTH,
      )
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
  }

  if (allAreFour) {
    state.tracks.forEach(track => {
      if (track.freq !== undefined) {
        track.width = WIDE_WIDTH
      }
    })
  }
}

function getReadXStart(state: LayoutState, read: Track): number {
  const seg = read.path[0]!
  const node = state.nodes[seg.node!]!
  const offset = read.firstNodeOffset ?? 0
  // read starts in forward direction, or backward from the node's far end
  return clampedXCoordinateOfBaseWithinNode(
    node,
    seg.isForward ? offset : node.sequenceLength - offset,
  )
}

function getReadXEnd(state: LayoutState, read: Track): number {
  const seg = read.path[read.path.length - 1]!
  const node = state.nodes[seg.node!]!
  const cover = read.finalNodeCoverLength ?? 0
  // read ends in forward direction, or backward from the node's far end
  return clampedXCoordinateOfBaseWithinNode(
    node,
    seg.isForward ? cover : node.sequenceLength - cover,
  )
}

// returns the x coordinate (in pixels) of (the left side) of the given base
// position within the given node, or null if the position is past its end
export function getXCoordinateOfBaseWithinNode(
  node: Node,
  base: number,
): number | null {
  if (base > node.sequenceLength) return null // equality is allowed
  return clampedXCoordinateOfBaseWithinNode(node, base)
}

// Same, but a base outside the node maps to the nearest node edge. Callers that
// have to produce a coordinate no matter what use this: falling back to 0 would
// put the shape at the far left of the whole image instead.
export function clampedXCoordinateOfBaseWithinNode(
  node: Node,
  base: number,
): number {
  const [nodeLeftX, nodeRightX] = nodePixelCoordinatesInX(node)
  if (node.sequenceLength === 0) {
    return nodeLeftX
  }
  const clamped = Math.min(Math.max(base, 0), node.sequenceLength)
  return nodeLeftX + (clamped / node.sequenceLength) * (nodeRightX - nodeLeftX)
}

// transforms the info in the tracks' path attribute into actual coordinates
// and saves them in shapes.rectangles and shapes.curves
function generateSVGShapesFromPath(state: LayoutState): void {
  let xStart: number
  let xEnd: number
  let yStart: number
  let yEnd: number

  for (let i = 0; i <= state.maxOrder; i += 1) {
    state.extraLeft.push(0)
    state.extraRight.push(0)
  }

  // generate x coords where each order starts and ends
  const orderStartX: number[] = []
  const orderEndX: number[] = []
  state.nodes.forEach((node: MaybeUnplacedNode) => {
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
  state.tracks.sort(compareTrackByInitialOrdering)

  state.tracks.forEach(track => {
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
      xStart = getReadXStart(state, track)
    }

    // middle of path
    for (let i = 0; i < track.path.length; i += 1) {
      if (track.path[i]!.y !== yStart) {
        if (track.path[i - 1]!.isForward) {
          xEnd = orderEndX[track.path[i - 1]!.order]!
        } else {
          xEnd = orderStartX[track.path[i - 1]!.order]!
        }
        if (xEnd !== xStart) {
          state.shapes.rectangles.push({
            xStart: Math.min(xStart, xEnd),
            yStart,
            xEnd: Math.max(xStart, xEnd),
            yEnd: yStart + track.width - 1,
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
          state.shapes.curves.push({
            xStart,
            yStart,
            xEnd: xEnd + 1,
            yEnd,
            width: track.width,
            id: track.id,
            name: track.name,
            type: track.type,
            nodeStart: track.path[i - 1]!.node,
            nodeEnd: track.path[i]!.node,
            orderStart: track.path[i - 1]!.order,
            orderEnd: track.path[i]!.order,
          })
          xStart = xEnd
          yStart = yEnd
        } else if (track.path[i]!.order + 1 === track.path[i - 1]!.order) {
          // regular backward connection
          xStart = xEnd
          xEnd = orderEndX[track.path[i]!.order]!
          yEnd = track.path[i]!.y!
          state.shapes.curves.push({
            xStart: xStart + 1,
            yStart,
            xEnd,
            yEnd,
            width: track.width,
            id: track.id,
            name: track.name,
            type: track.type,
            nodeStart: track.path[i - 1]!.node,
            nodeEnd: track.path[i]!.node,
            orderStart: track.path[i - 1]!.order,
            orderEnd: track.path[i]!.order,
          })
          xStart = xEnd
          yStart = yEnd
        } else {
          // change of direction
          if (track.path[i - 1]!.isForward) {
            yEnd = track.path[i]!.y!
            generateTurnaround(
              state,
              1,
              xEnd,
              yStart,
              yEnd,
              track.width,
              track.id,
              track.path[i]!.order,
              track.type,
              track.name,
            )
            xStart = orderEndX[track.path[i]!.order]!
            yStart = track.path[i]!.y!
          } else {
            yEnd = track.path[i]!.y!
            generateTurnaround(
              state,
              -1,
              xEnd,
              yStart,
              yEnd,
              track.width,
              track.id,
              track.path[i]!.order,
              track.type,
              track.name,
            )
            xStart = orderStartX[track.path[i]!.order]!
            yStart = track.path[i]!.y!
          }
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
      xEnd = getReadXEnd(state, track)
    }
    state.shapes.rectangles.push({
      xStart: Math.min(xStart, xEnd),
      yStart,
      xEnd: Math.max(xStart, xEnd),
      yEnd: yStart + track.width - 1,
      id: track.id,
      name: track.name,
      type: track.type,
    })
  })
}

// Sankey-mode synthesis: one synthetic "read" per (srcSigned → dstSigned) edge,
// fed through the normal placeReads/generateSVGShapesFromPath pipeline so the
// band gets the same lane assignment, loop topology and bezier shape as a real
// read. A read band takes its source's palette; a haplotype band carries its
// share of the haplotypes for the colorer to shade by.
//
// Synthetic-track ids live above this base so they don't collide with real
// track ids and so click/hover handlers can show count info instead of the
// per-read info dialog.
const COARSENED_ID_BASE = 1_000_000_000
export const isCoarsenedId = (id: number) => id >= COARSENED_ID_BASE

// Build one synthetic read per (srcSigned → dstSigned) edge in `source`
// (real reads, or the alt haplotype tracks). The synthetic reads replace the
// real ones BEFORE placeReads runs, so:
//   • placeReads sees N_edges reads instead of N_reads (huge node-height win),
//   • each band gets a lane and an "right-down-left-up-right" loop topology
//     for free (placeReads handles reversals and out-of-order jumps),
//   • generateSVGShapesFromPath emits exactly one TrackCurve per band using
//     the same bezier as a real read — no special draw path needed.
//
// The synthetic track's `sequence` is just the two signed node names. After
// generateTrackIndexSequences runs, indexSequence is set and the rest of the
// layout follows.
function buildCoarsenedSyntheticBands(
  state: LayoutState,
  source: Track[],
  unit: CoarsenedUnit,
): { bands: Track[]; total: number } {
  state.coarsenedEdgeMeta = new Map()

  // Aggregate by signed-edge key. Preserve orientation so e.g. (+A→+B) and
  // (-B→-A) stack as separate bands — they're different visual flows.
  interface EdgeAgg {
    sSigned: number
    dSigned: number
    sName: string
    dName: string
    // distinct walks, so a walk that loops back over an edge, or crosses it
    // both ways under ignoreStrand, counts once
    count: number
    // every crossing, loops included, which is what sizes the band
    crossings: number
    sourceTrackID: number
    lastSource: number
  }
  const edges = new Map<number, EdgeAgg>()
  let total = 0
  // One number per signed edge: signed indices run from -span to span.
  const span = state.nodes.length
  const edgeKey = (s: number, d: number): number =>
    (s + span) * (2 * span + 1) + d + span
  // When ignoring strand, (+A→+B) and (-B→-A) refer to the same underlying
  // graph connection, so both collapse into the smaller of their two keys;
  // whichever orientation is seen first determines the visual band direction.
  const ignoreStrand = state.config.ignoreStrand
  for (const [sourceIndex, item] of source.entries()) {
    // a deduplicated walk stands for `freq` identical haplotypes
    const weight = Math.max(item.freq ?? 1, 1)
    total += weight
    const seq = item.indexSequence
    if (seq.length < 2) continue
    for (let i = 0; i < seq.length - 1; i += 1) {
      const sSigned = seq[i]!
      const dSigned = seq[i + 1]!
      const srcNode = state.nodes[Math.abs(sSigned)]!
      const dstNode = state.nodes[Math.abs(dSigned)]!
      const key = ignoreStrand
        ? Math.min(edgeKey(sSigned, dSigned), edgeKey(-dSigned, -sSigned))
        : edgeKey(sSigned, dSigned)
      const existing = edges.get(key)
      if (existing === undefined) {
        edges.set(key, {
          sSigned,
          dSigned,
          sName: sSigned < 0 ? `-${srcNode.name}` : srcNode.name,
          dName: dSigned < 0 ? `-${dstNode.name}` : dstNode.name,
          count: weight,
          crossings: weight,
          sourceTrackID: item.sourceTrackID,
          lastSource: sourceIndex,
        })
      } else {
        existing.crossings += weight
        if (existing.lastSource !== sourceIndex) {
          existing.count += weight
          existing.lastSource = sourceIndex
        }
      }
    }
  }

  // Square-root scaling on crossings gives heavy edges visible weight without
  // letting one massive edge dwarf everything else. Min stays near READ_WIDTH
  // so single-read edges still look like a normal read; max is generous so
  // hot edges read as obvious "highways."
  let maxEdgeCount = 0
  for (const e of edges.values()) {
    if (e.crossings > maxEdgeCount) maxEdgeCount = e.crossings
  }
  const BAND_MIN_WIDTH = READ_WIDTH
  const BAND_MAX_WIDTH = 60
  const widthForCount = (c: number): number => {
    if (maxEdgeCount <= 1) return BAND_MIN_WIDTH
    return (
      BAND_MIN_WIDTH +
      (BAND_MAX_WIDTH - BAND_MIN_WIDTH) * Math.sqrt(c / maxEdgeCount)
    )
  }

  const synthetic: Track[] = []
  let i = 0
  for (const edge of edges.values()) {
    const id = COARSENED_ID_BASE + i
    const share =
      unit === 'haplotype' ? { count: edge.count, total } : undefined
    const shareText = share === undefined ? '' : ` (${formatShare(share)})`
    const crossingsText =
      edge.crossings === edge.count
        ? ''
        : `, ${edge.crossings.toLocaleString()} crossings`
    const label = `${edge.count.toLocaleString()} ${unit}${edge.count === 1 ? '' : 's'}${shareText}${crossingsText}: Node ${edge.sName} → Node ${edge.dName}`
    state.coarsenedEdgeMeta.set(id, { count: edge.count, label })
    // Place each synthetic band so it touches *only* its endpoint nodes' edges:
    //   • firstNodeOffset = src.sequenceLength → curve exits at src's right
    //     pixel edge, no rectangle drawn inside src.
    //   • finalNodeCoverLength = 0 → curve enters at dst's left pixel edge,
    //     no rectangle drawn inside dst.
    // The crucial side effect is in placeReadSet's conflict check: at any
    // node B with an incoming edge (A→B) and an outgoing edge (B→C), the
    // incoming's finalNodeCoverLength=0 and the outgoing's firstNodeOffset=
    // B.length leave them with no horizontal overlap, so they share a single
    // lane. Node heights collapse from ~(N_in + N_out) lanes down to
    // ~max(N_in, N_out) lanes.
    //
    // Note: reverseReversedReads will swap firstNodeOffset/finalNodeCoverLength
    // for fully-reverse synthetics. The math works out: pre-flip values of
    // (srcLen, 0) become post-flip (newSrcLen, 0), which is the same pattern
    // — bands stay edge-only regardless of orientation.
    const srcLen = state.nodes[Math.abs(edge.sSigned)]!.sequenceLength
    synthetic.push({
      id,
      sourceTrackID: edge.sourceTrackID,
      type: 'read',
      // Human-readable so the name surfaces sensibly in any UI that uses it
      // (right-click → add to group, etc.) — and so trackTooltipText fallback
      // shows something meaningful.
      name: label,
      sequence: [edge.sName, edge.dName],
      indexSequence: [],
      path: [],
      // Pre-set width so placeReads / placeReadSet allocate the right vertical
      // space and assignReadsToNodes (patched to honor pre-set widths) leaves
      // it alone.
      width: widthForCount(edge.crossings),
      firstNodeOffset: srcLen,
      finalNodeCoverLength: 0,
      sequenceNew: [
        { nodeName: edge.sName, mismatches: [] },
        { nodeName: edge.dName, mismatches: [] },
      ],
      mapping_quality: 0,
      is_secondary: false,
      sample_name: null,
      read_group: null,
      score: edge.count,
      haplotypeShare: share,
    })
    i += 1
  }

  if (DEBUG) {
    let tallestName = '?'
    let tallestH = 0
    state.nodes.forEach(n => {
      if (n.contentHeight > tallestH) {
        tallestH = n.contentHeight
        tallestName = n.name
      }
    })
    debugLog(
      `[coarsened] ${unit}s_in=${source.length} edges_out=${synthetic.length} ` +
        `tallestNodeBeforePlace=${tallestName}(${tallestH.toFixed(1)})`,
    )
  }
  return { bands: synthetic, total }
}

// A graph can store a walk in either orientation, so a haplotype can arrive
// back to front relative to the reference. Banded that way, one allele splits
// into a forward and a reverse band. Turn a walk around when it runs against
// the reference on most of the nodes they share.
function orientedLike(refSigns: Int8Array, walk: Track): Track {
  let agreement = 0
  for (const visit of walk.indexSequence) {
    const sign = refSigns[Math.abs(visit)]
    if (sign !== undefined && sign !== 0) {
      agreement += sign === Math.sign(visit) ? 1 : -1
    }
  }
  return agreement >= 0
    ? walk
    : {
        ...walk,
        sequence: walk.sequence.map(flip).reverse(),
        indexSequence: walk.indexSequence.map(visit => -visit).reverse(),
      }
}

// The sign of `ref`'s first visit to each node index, 0 where it never visits.
function firstVisitSigns(state: LayoutState, ref: Track): Int8Array {
  const signs = new Int8Array(state.nodes.length)
  for (const visit of ref.indexSequence) {
    const node = Math.abs(visit)
    if (signs[node] === 0) signs[node] = Math.sign(visit)
  }
  return signs
}

function formatShare({ count, total }: HaplotypeShare): string {
  const share = count / total
  if (share < 0.01) return '<1%'
  if (share > 0.99 && count < total) return '>99%'
  return `${Math.round(share * 100)}%`
}

const MIN_BEND_WIDTH = 7

// Emit the vertical rectangles + rounded corners for a track turning around at
// one end of an order slot. The two directions are mirror images of each other:
// a forward-to-reverse turn bulges out to the right of the node and consumes an
// `extraRight` slot, a reverse-to-forward turn bulges out to the left and
// consumes an `extraLeft` slot. `dir` is +1 for right, -1 for left.
function generateTurnaround(
  state: LayoutState,
  dir: 1 | -1,
  x: number,
  yStart: number,
  yEnd: number,
  trackWidth: number,
  trackID: number,
  order: number,
  type: TrackType | undefined,
  trackName: string | undefined,
): void {
  const extra = dir === 1 ? state.extraRight : state.extraLeft
  const offset = 10 * extra[order]!
  // The turn's apex, and the outward direction from it.
  const apex = x + dir * (offset + 5)
  const radius = MIN_BEND_WIDTH
  const stem = Math.min(MIN_BEND_WIDTH, trackWidth)
  const yTop = Math.min(yStart, yEnd)
  const yBottom = Math.max(yStart, yEnd)
  // The incoming/outgoing stubs run from the node's edge out to the apex. The
  // one-pixel asymmetry between the two directions is carried over verbatim
  // from the original pair of functions.
  const stubNear = dir === 1 ? x : apex - 1
  const stubFar = dir === 1 ? apex : x

  const horizontal = (segTop: number): void => {
    state.shapes.verticalRectangles.push({
      xStart: stubNear,
      yStart: segTop,
      xEnd: stubFar,
      yEnd: segTop + trackWidth - 1,
      id: trackID,
      name: trackName,
      type,
    })
  }
  // elongate the incoming and outgoing rectangles a bit past the node
  horizontal(yStart)
  state.shapes.verticalRectangles.push({
    xStart: dir === 1 ? apex + radius : apex - radius - stem,
    yStart: yTop + trackWidth + radius - 1,
    xEnd: dir === 1 ? apex + radius + stem - 1 : apex - radius - 1,
    yEnd: yBottom - radius + 1,
    id: trackID,
    name: trackName,
    type,
  })
  horizontal(yEnd)

  const inner = apex + dir * radius
  const outer = apex + dir * (radius + stem)

  // bottom 90 degree bend
  let d = `M ${apex} ${yBottom}`
  d += ` Q ${inner} ${yBottom} ${inner} ${yBottom - radius}`
  d += ` H ${outer}`
  d += ` Q ${outer} ${yBottom + trackWidth} ${apex} ${yBottom + trackWidth}`
  d += ' Z '
  state.shapes.corners.push({ path: d, id: trackID, type })

  // top 90 degree bend
  d = `M ${apex} ${yTop}`
  d += ` Q ${outer} ${yTop} ${outer} ${yTop + trackWidth + radius}`
  d += ` H ${inner}`
  d += ` Q ${inner} ${yTop + trackWidth} ${apex} ${yTop + trackWidth}`
  d += ' Z '
  state.shapes.corners.push({ path: d, id: trackID, type })
  extra[order]! += 1
}

// The x extent of a node's bases: pixelWidth, plus about half a character
// each side under nodeWidthOption 'normal'
export function nodePixelCoordinatesInX(node: Node): [number, number] {
  const nodeLeftX = node.x - 4
  const nodeRightX = node.x + node.pixelWidth + 4
  return [nodeLeftX, nodeRightX]
}

// calculate node widths depending on sequence lengths and chosen calculation method
function generateNodeWidth(state: LayoutState): void {
  switch (state.config.nodeWidthOption) {
    case 'compressed':
      state.nodes.forEach(node => {
        node.width = 1 + Math.log2(Math.max(node.sequenceLength, 1))
        node.pixelWidth = Math.round((node.width - 1) * 8.401)
      })
      break
    case 'small':
      state.nodes.forEach(node => {
        node.width = node.sequenceLength / 100
        node.pixelWidth = Math.max(Math.round((node.width - 1) * 8.401), 0)
      })
      break
    case 'fixed':
      state.nodes.forEach(node => {
        node.width = 10
        node.pixelWidth = Math.round(node.width * 8.401)
      })
      break
    case 'normal': {
      // The label draws a base per character from x - 4, in a monospace font
      // whose character width the caller measures. pixelWidth runs from the
      // first character to the last, so the outline, 9 px wider each side,
      // holds the whole label, and nodePixelCoordinatesInX's half character
      // each side puts base i under letter i.
      const charWidth = state.config.charWidth
      state.nodes.forEach(node => {
        node.width = node.sequenceLength
        node.pixelWidth = Math.round(
          charWidth * Math.max(node.sequenceLength - 1, 0),
        )
      })
      break
    }
    default:
      throw new Error(`${state.config.nodeWidthOption} not implemented`)
  }
}

// A node's distinct neighbors on one side, kept only as far as mergeNodes
// needs them: none, exactly one, or several. A neighbor is a signed node index,
// or TRACK_END where a haplotype starts or stops.
interface Neighbors {
  first: Int32Array
  count: Uint8Array
}

const TRACK_END = 0

function noNeighbors(nodeCount: number): Neighbors {
  return { first: new Int32Array(nodeCount), count: new Uint8Array(nodeCount) }
}

function addNeighbor(
  neighbors: Neighbors,
  index: number,
  neighbor: number,
): void {
  const count = neighbors.count[index]!
  if (count === 0) {
    neighbors.first[index] = neighbor
    neighbors.count[index] = 1
  } else if (count === 1 && neighbors.first[index] !== neighbor) {
    neighbors.count[index] = 2
  }
}

// The index of a node's one neighbor on this side, or 0 when it has none,
// several, or a track end.
function soleNeighbor(neighbors: Neighbors, index: number): number {
  return neighbors.count[index] === 1 ? Math.abs(neighbors.first[index]!) : 0
}

// remove redundant nodes
// two nodes A and B can be merged if all tracks leaving A go directly into B
// and all tracks entering B come directly from A
// (plus no inversions involved)
function mergeNodes(state: LayoutState): void {
  const pred = noNeighbors(state.nodes.length)
  const succ = noNeighbors(state.nodes.length)
  const signedIndexOf = new Map<string, number>()
  const visit = (nodeName: string): number => {
    let signed = signedIndexOf.get(nodeName)
    if (signed === undefined) {
      const index = state.nodeMap.get(forward(nodeName))!
      signed = isReverse(nodeName) ? -index : index
      signedIndexOf.set(nodeName, signed)
    }
    return signed
  }

  const tracksAndReads = state.tracks.concat(state.reads)

  // A reverse visit on either side adds both orientations of the neighbor, so
  // no merge happens across an inversion.
  tracksAndReads.forEach(track => {
    const { sequence } = track
    const isHaplotype = track.type === 'haplotype'
    const last = sequence.length - 1
    let previous = TRACK_END
    let current = last >= 0 ? visit(sequence[0]!) : TRACK_END
    for (let i = 0; i <= last; i += 1) {
      const next = i < last ? visit(sequence[i + 1]!) : TRACK_END
      if (current > 0) {
        if (i > 0) {
          addNeighbor(pred, current, previous)
          if (previous < 0) addNeighbor(pred, current, -previous)
        } else if (isHaplotype) {
          addNeighbor(pred, current, TRACK_END)
        }
        if (i < last) {
          addNeighbor(succ, current, next)
          if (next < 0) addNeighbor(succ, current, -next)
        } else if (isHaplotype) {
          addNeighbor(succ, current, TRACK_END)
        }
      } else {
        const index = -current
        if (i > 0) {
          addNeighbor(succ, index, -previous)
          if (previous > 0) addNeighbor(succ, index, previous)
        } else if (isHaplotype) {
          addNeighbor(succ, index, TRACK_END)
        }
        if (i < last) {
          addNeighbor(pred, index, -next)
          if (next > 0) addNeighbor(pred, index, next)
        } else if (isHaplotype) {
          addNeighbor(pred, index, TRACK_END)
        }
      }
      previous = current
      current = next
    }
  })

  const absorbed = new Uint8Array(state.nodes.length)
  state.nodes.forEach((_, i) => {
    if (mergeableWithPred(i, pred, succ) !== 0) absorbed[i] = 1
  })

  // Merge each run into its first node, noting the node every run member
  // merges into and where the member's bases start and end within it.
  const origin = new Int32Array(state.nodes.length)
  const start = new Float64Array(state.nodes.length)
  const end = new Float64Array(state.nodes.length)
  state.nodes.forEach((node, head) => {
    if (absorbed[head] === 1) return
    origin[head] = head
    end[head] = node.sequenceLength
    for (let donor = head; mergeableWithSucc(donor, pred, succ);) {
      donor = soleNeighbor(succ, donor)
      origin[donor] = head
      start[donor] = node.sequenceLength
      node.sequenceLength += state.nodes[donor]!.sequenceLength
      node.seq += state.nodes[donor]!.seq
      end[donor] = node.sequenceLength
    }
  })

  // A read's offsets and mismatch positions count along the strand it visits
  // a node on: from the left end of a forward visit, the right end of a
  // reverse one. A forward visit to an absorbed node folds into the visit
  // before it, a reverse one into the visit after it.
  state.reads.forEach(read => {
    const { sequence } = read
    const entries =
      read.sequenceNew ??
      sequence.map(nodeName => ({ nodeName, mismatches: [] as Mismatch[] }))
    const shift = (nodeName: string): number => {
      const index = Math.abs(visit(nodeName))
      return isReverse(nodeName)
        ? state.nodes[origin[index]!]!.sequenceLength - end[index]!
        : start[index]!
    }
    const last = sequence.length - 1
    read.firstNodeOffset = (read.firstNodeOffset ?? 0) + shift(sequence[0]!)
    read.finalNodeCoverLength =
      (read.finalNodeCoverLength ?? 0) + shift(sequence[last]!)

    const mergedSequence: string[] = []
    const mergedEntries: ReadSequenceEntry[] = []
    let carried: Mismatch[] = []
    sequence.forEach((nodeName, i) => {
      const index = Math.abs(visit(nodeName))
      const { mismatches } = entries[i]!
      const by = shift(nodeName)
      mismatches.forEach(mismatch => {
        mismatch.pos += by
      })
      if (absorbed[index] === 1 && !isReverse(nodeName) && i > 0) {
        mergedEntries.at(-1)!.mismatches.push(...mismatches)
      } else if (absorbed[index] === 1 && isReverse(nodeName) && i < last) {
        carried.push(...mismatches)
      } else {
        const name = state.nodes[origin[index]!]!.name
        const merged = isReverse(nodeName) ? reverse(name) : name
        mergedSequence.push(merged)
        mergedEntries.push({
          nodeName: merged,
          mismatches: carried.concat(mismatches),
        })
        carried = []
      }
    })
    read.sequence = mergedSequence
    if (read.sequenceNew !== undefined) read.sequenceNew = mergedEntries
  })

  state.tracks.forEach(track => {
    const { sequence } = track
    let kept = 0
    for (const nodeName of sequence) {
      if (absorbed[Math.abs(visit(nodeName))] === 0) {
        sequence[kept] = nodeName
        kept += 1
      }
    }
    sequence.length = kept
  })

  let kept = 1
  for (let i = 1; i < state.nodes.length; i += 1) {
    if (absorbed[i] === 0) {
      state.nodes[kept] = state.nodes[i]!
      kept += 1
    }
  }
  state.nodes.length = kept
}

// The index of the node `index` merges into, or 0 when it merges into none.
function mergeableWithPred(
  index: number,
  pred: Neighbors,
  succ: Neighbors,
): number {
  const predecessor = soleNeighbor(pred, index)
  return predecessor !== 0 && soleNeighbor(succ, predecessor) !== 0
    ? predecessor
    : 0
}

function mergeableWithSucc(
  index: number,
  pred: Neighbors,
  succ: Neighbors,
): boolean {
  const successor = soleNeighbor(succ, index)
  return successor !== 0 && soleNeighbor(pred, successor) !== 0
}
