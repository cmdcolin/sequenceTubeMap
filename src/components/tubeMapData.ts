import * as tubeMap from '../util/tubemap.ts'
import type { InputNode, InputTrack, VgJson, VgRead } from '../util/tubemap.ts'
import { dataOriginTypes } from '../enums.ts'

// demo-data.js types are inferred from JS literals; keep this loose so the
// module-level shape (which includes a few extra JS-only fields) is
// assignable. computeExampleData narrows when it actually consumes a field.
interface DemoData {
  inputNodes: InputNode[]
  inputTracks1: InputTrack[]
  inputTracks2: InputTrack[]
  inputTracks3: InputTrack[]
  inputTracks4: InputTrack[]
  inputTracks5: InputTrack[]
  k3138: string
  demoReads: string
  reverseAlignmentGraph: VgJson
  mixedAlignmentReads: VgRead[]
  cycleGraph: VgJson
  cycleReads: VgRead[]
  cycle2Graph: VgJson
  cycle2Reads: VgRead[]
}

export interface ExampleResult {
  nodes: InputNode[]
  tracks: InputTrack[]
  reads: InputTrack[]
}

function readsFromStringToArray(readsString: string): VgRead[] {
  return readsString
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line))
}

type TrackKey =
  | 'inputTracks1'
  | 'inputTracks2'
  | 'inputTracks3'
  | 'inputTracks4'
  | 'inputTracks5'
type GraphKey =
  | 'k3138'
  | 'reverseAlignmentGraph'
  | 'cycleGraph'
  | 'cycle2Graph'
type ReadsKey =
  | 'demoReads'
  | 'mixedAlignmentReads'
  | 'cycleReads'
  | 'cycle2Reads'

// Static (no read alignments) examples → which prebuilt tracks they show.
const STATIC_EXAMPLE_TRACKS: Record<string, TrackKey> = {
  [dataOriginTypes.EXAMPLE_1]: 'inputTracks1',
  [dataOriginTypes.EXAMPLE_2]: 'inputTracks2',
  [dataOriginTypes.EXAMPLE_3]: 'inputTracks3',
  [dataOriginTypes.EXAMPLE_4]: 'inputTracks4',
  [dataOriginTypes.EXAMPLE_5]: 'inputTracks5',
}

// Alignment-rendering examples → the graph + reads pair to render.
const READ_EXAMPLES: Record<string, { graph: GraphKey; reads: ReadsKey }> = {
  [dataOriginTypes.EXAMPLE_6]: { graph: 'k3138', reads: 'demoReads' },
  [dataOriginTypes.EXAMPLE_7]: {
    graph: 'reverseAlignmentGraph',
    reads: 'mixedAlignmentReads',
  },
  [dataOriginTypes.EXAMPLE_8]: { graph: 'cycleGraph', reads: 'cycleReads' },
  [dataOriginTypes.EXAMPLE_9]: { graph: 'cycle2Graph', reads: 'cycle2Reads' },
}

export function computeExampleData(
  dataOrigin: string,
  data: DemoData,
): ExampleResult {
  const staticKey = STATIC_EXAMPLE_TRACKS[dataOrigin]
  if (staticKey) {
    return { nodes: data.inputNodes, tracks: data[staticKey], reads: [] }
  }
  const example = READ_EXAMPLES[dataOrigin]
  if (example) {
    const graphRaw = data[example.graph]
    const vg: VgJson =
      typeof graphRaw === 'string' ? JSON.parse(graphRaw) : graphRaw
    const readsRaw = data[example.reads]
    const reads: VgRead[] =
      typeof readsRaw === 'string'
        ? readsFromStringToArray(readsRaw)
        : readsRaw
    const nodes = tubeMap.vgExtractNodes(vg)
    const tracks = tubeMap.vgExtractTracks(vg, 0, 0)
    return {
      nodes,
      tracks,
      reads: tubeMap.vgExtractReads(nodes, tracks, reads, 0, 1),
    }
  }
  if (dataOrigin !== dataOriginTypes.NO_DATA) {
    console.warn('invalid example data origin type:', dataOrigin)
  }
  return { nodes: data.inputNodes, tracks: [], reads: [] }
}
