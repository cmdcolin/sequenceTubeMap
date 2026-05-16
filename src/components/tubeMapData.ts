import * as tubeMap from '../util/tubemap'
import { dataOriginTypes } from '../enums'

interface DemoData {
  inputNodes: unknown
  inputTracks1: unknown
  inputTracks2: unknown
  inputTracks3: unknown
  inputTracks4: unknown
  inputTracks5: unknown
  k3138: string
  demoReads: string
  reverseAlignmentGraph: unknown
  mixedAlignmentReads: unknown
  cycleGraph: unknown
  cycleReads: unknown
  cycle2Graph: unknown
  cycle2Reads: unknown
}

export interface ExampleResult {
  nodes: unknown
  tracks: unknown
  reads: unknown
}

function readsFromStringToArray(readsString: string): unknown[] {
  return readsString
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line))
}

// Static (no read alignments) examples → which prebuilt tracks they show.
const STATIC_EXAMPLE_TRACKS: Record<string, keyof DemoData> = {
  [dataOriginTypes.EXAMPLE_1]: 'inputTracks1',
  [dataOriginTypes.EXAMPLE_2]: 'inputTracks2',
  [dataOriginTypes.EXAMPLE_3]: 'inputTracks3',
  [dataOriginTypes.EXAMPLE_4]: 'inputTracks4',
  [dataOriginTypes.EXAMPLE_5]: 'inputTracks5',
}

// Alignment-rendering examples → the graph + reads pair to render.
const READ_EXAMPLES: Record<
  string,
  { graph: keyof DemoData; reads: keyof DemoData }
> = {
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
    const vg = typeof graphRaw === 'string' ? JSON.parse(graphRaw) : graphRaw
    const readsRaw = data[example.reads]
    const reads =
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
    console.log('invalid example data origin type:', dataOrigin)
  }
  return { nodes: data.inputNodes, tracks: [], reads: [] }
}
