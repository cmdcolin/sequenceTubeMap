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
    node.sequenceLength = node.sequence.length
    // @ts-expect-error -- mirroring the server, which produces nodes with no
    // `sequence` field when sequences are removed.
    delete node.sequence
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
  const path: VgPath[] = inGraph.paths.map(p => {
    const match = p.name === undefined ? null : subpathRe.exec(p.name)
    return {
      ...p,
      ...(match ? { name: match[1], indexOfFirstBase: match[2] } : {}),
      mapping: p.path.map(visit => {
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
