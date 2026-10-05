export type MismatchType = 'insertion' | 'deletion' | 'substitution'

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
  id: number
  name?: string
  type?: TrackType
  // the nodes the curve leaves and enters, null at a gap in a track's path
  nodeStart: number | null
  nodeEnd: number | null
  // the order slots it leaves and enters
  orderStart: number
  orderEnd: number
  path?: string
}

export interface TrackCorner {
  path: string
  id: number
  name?: string
  type?: TrackType
}

export interface Segment {
  order: number
  lane?: number
  isForward: boolean
  node: number | null
  y?: number
  betweenCycleReverseTraversal?: boolean
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

// How many of the banded haplotypes take a coarsened band
export interface HaplotypeShare {
  count: number
  total: number
}

// Layout-complete track shape, as layoutTubeMap returns it.
export interface Track extends InputTrack {
  indexSequence: number[]
  path: Segment[]
  width: number
  haplotypeShare?: HaplotypeShare
}

// Loose input shape passed to layoutTubeMap. Its passes (generateNodeWidth →
// generateNodeOrder → generateLaneAssignment → generateNodeXCoords) accrete
// more fields, producing the full `Node` below. A graph fetched with
// removeSequences has no seq, and sequenceLength defaults to seq's length.
export interface InputNode {
  name: string
  seq?: string
  sequenceLength?: number
}

// Layout-complete node — fields used by drawing code after the pipeline.
// (Marked optional only for the genuinely conditional fields like switched/d.)
// layoutTubeMap fills in seq, as '' when the input had none, and
// sequenceLength.
export interface Node extends InputNode {
  seq: string
  sequenceLength: number
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

// Drawing instructions from one layout, in layout coordinates.
export interface TrackShapes {
  rectangles: TrackRectangle[]
  curves: TrackCurve[]
  corners: TrackCorner[]
  // drawn separately so they don't overlap the horizontal rectangles
  verticalRectangles: TrackRectangle[]
}

export function emptyTrackShapes(): TrackShapes {
  return {
    rectangles: [],
    curves: [],
    corners: [],
    verticalRectangles: [],
  }
}

// The extent of the drawn content, in layout coordinates.
export interface ImageBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}
