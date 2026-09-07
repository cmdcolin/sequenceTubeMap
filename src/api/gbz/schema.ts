/**
 * Convert a graph from GBZ-style JSON to vg-style JSON that matches the vg
 * protobuf schema. See
 * <https://github.com/vgteam/libvgio/blob/45d8ada05ee1d1405ef44d93f2ac00a5a097dd09/deps/vg.proto>
 *
 * Does not leave the input graph intact.
 */

import type { VgJson, VgNode, VgPath } from '../../util/tubemap.ts'

interface GbzVisit {
  id: number | string
  is_reverse: boolean
}

interface GbzEdge {
  from: number | string
  to: number | string
  from_is_reverse: boolean
  to_is_reverse: boolean
}

interface GbzPath extends Omit<VgPath, 'mapping'> {
  path: GbzVisit[]
  // --distinct mode: how many input haplotypes share this collapsed traversal.
  // tubemap.ts uses `freq` for the same purpose (track-width sizing); we copy
  // weight → freq below so abundance is reflected in the rendering.
  weight?: number
}

interface GbzGraph {
  nodes: VgNode[]
  edges: GbzEdge[]
  paths: GbzPath[]
}

// VgJson + the `edge` field that tubemap rendering also consumes.
export type ConvertedGraph = VgJson & {
  edge: (Omit<GbzEdge, 'from_is_reverse' | 'to_is_reverse'> & {
    from_start: boolean
    to_end: boolean
  })[]
}

/**
 * Replace each node's `sequence` with `sequenceLength` in place — the same
 * shape the server emits when `removeSequences` is requested. Tube map can
 * then size nodes correctly without shipping the full bp content over the
 * Comlink boundary.
 */
export function removeNodeSequencesInPlace(graph: ConvertedGraph): void {
  for (const node of graph.node) {
    // VgNode declares `sequence` as required because the tube map's own
    // loader always supplies it; the server's removeSequences response and
    // this one leave it off, so write through a view that says it's optional.
    const stripped: { sequence?: string; sequenceLength?: number } = node
    stripped.sequenceLength = node.sequence.length
    delete stripped.sequence
  }
}

export function convertSchema(inGraph: GbzGraph): ConvertedGraph {
  const nodeLength = new Map<number | string, number>()
  for (const node of inGraph.nodes) {
    nodeLength.set(node.id, node.sequence.length)
  }

  const edge = inGraph.edges.map(e => ({
    from: e.from,
    to: e.to,
    from_start: e.from_is_reverse,
    to_end: e.to_is_reverse,
  }))

  // gbz-base emits subpath names as `<base>[<start>-<end>]`. Mirror the
  // server's normalization (server.mjs:1759-1782): strip the suffix and lift
  // <start> into indexOfFirstBase so tubemap.ts draws the bp ruler.
  const subpathRe = /^(.*)\[(\d+)-\d+\]$/
  // `visits` and `weight` are the GBZ spellings of `mapping` and `freq`, so
  // they are destructured out rather than spread through: keeping them would
  // send every path twice across the worker's structured-clone boundary.
  const path: VgPath[] = inGraph.paths.map(({ path: visits, weight, ...rest }) => {
    const match = rest.name === undefined ? null : subpathRe.exec(rest.name)
    return {
      ...rest,
      ...(match ? { name: match[1], indexOfFirstBase: match[2] } : {}),
      ...(weight !== undefined ? { freq: weight } : {}),
      mapping: visits.map(visit => {
        const length = nodeLength.get(visit.id)
        if (length === undefined) {
          throw new Error(`Path visit references unknown node ${visit.id}`)
        }
        return {
          position: { node_id: visit.id, is_reverse: visit.is_reverse },
          edit: [{ from_length: length, to_length: length }],
        }
      }),
    }
  })

  return { node: inGraph.nodes, edge, path }
}
