import { TabixIndexedFile } from '@gmod/tabix'
import { WalkReader } from '@jbrowse/graph-walks'
import type { GraphTables } from '@jbrowse/graph-walks'
import type { GenericFilehandle } from 'generic-filehandle2'

import type { PathInfo } from '../../Types.ts'
import type { VgJson, VgNode, VgPath } from '../../util/tubemap.ts'

// gbz-base's default, so both backends cut the same reference for a region
const CONTEXT_BP = 100

export class WalkLimitError extends Error {}

interface VgEdge {
  from: string
  to: string
  from_start: boolean
  to_end: boolean
}

// A gfa-to-tabix walk file: @jbrowse/graph-walks reads and cuts it, and
// this class names its sequences the way the region box does and turns a cut
// into the vg JSON the tube map draws.
export class WalkFiles {
  private walks: TabixIndexedFile
  private reader: WalkReader

  constructor(walks: GenericFilehandle, index: GenericFilehandle) {
    this.walks = new TabixIndexedFile({
      filehandle: walks,
      tbiFilehandle: index,
    })
    this.reader = new WalkReader(this.walks)
  }

  // The anchor sequence a region's contig names. Walk files name it in full
  // PanSN, `GRCh38#0#chr20`, and the region box also takes the forms the
  // gbz-base backend does: `GRCh38#chr20` and plain `chr20`.
  async anchorFor(contig: string, signal?: AbortSignal): Promise<string> {
    const names = await this.reader.referenceSequences({ signal })
    if (names.includes(contig)) {
      return contig
    }
    const parts = contig.split('#')
    const { references } = await this.reader.header({ signal })
    const candidates =
      parts.length === 2
        ? [`${parts[0]}#0#${parts[1]}`]
        : references.map(sample => `${sample}#0#${contig}`)
    const found =
      candidates.find(name => names.includes(name)) ??
      names.find(name => name.endsWith(`#${contig}`))
    if (found === undefined) {
      throw new Error(
        `the walk file has no reference sequence ${contig}; it holds ${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''}`,
      )
    }
    return found
  }

  // One entry per reference sequence. Its length is where its last node
  // ends, from a cut of the reference alone over the last chunk the index
  // says it has rows in.
  async pathInfo(signal?: AbortSignal): Promise<PathInfo[]> {
    const { chunk } = await this.reader.header({ signal })
    const names = await this.reader.referenceSequences({ signal })
    return await Promise.all(
      names.map(async name => {
        const start = await this.lastChunkStart(name, chunk, signal)
        const { graph } = await this.reader.cut(
          name,
          { start, end: start + chunk },
          { signal, context: 0, links: false, keep: walk => walk === name },
        )
        let length = 0
        for (const node of graph.nodes.values()) {
          if (node.rank === 0 && node.refName === name) {
            length = Math.max(length, node.end)
          }
        }
        return { name, length, cyclic: false }
      }),
    )
  }

  // The start of the last chunk with rows, found from the index alone: the
  // reference's walk has a row in every chunk it passes, so the chunks with
  // rows run unbroken from the first.
  private async lastChunkStart(
    name: string,
    chunk: number,
    signal?: AbortSignal,
  ): Promise<number> {
    const hasRows = async (k: number) =>
      (await this.walks.bytesForRegions(
        [{ refName: name, start: k * chunk, end: k * chunk + 1 }],
        { signal },
      )) > 0
    let lo = 0
    let hi = 1
    while (await hasRows(hi)) {
      lo = hi
      hi *= 2
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (await hasRows(mid)) {
        lo = mid
      } else {
        hi = mid
      }
    }
    return lo * chunk
  }

  /**
   * The graph under `start`-`end` of reference sequence `anchor`, with
   * `CONTEXT_BP` either side: the nodes the cut keeps and each walk through
   * them, in the vg JSON the tube map draws. `distinct` merges walks that take
   * the same steps into one path whose `freq` counts them.
   */
  async subgraph(
    anchor: string,
    start: number,
    end: number,
    opts: { distinct: boolean; nodeLimit: number; signal?: AbortSignal },
  ): Promise<VgJson & { edge: VgEdge[] }> {
    const { graph, kept, fragments } = await this.reader.cut(
      anchor,
      { start, end },
      {
        signal: opts.signal,
        context: CONTEXT_BP,
        links: false,
        sequences: true,
      },
    )
    if (kept.size > opts.nodeLimit) {
      throw new WalkLimitError(
        `${anchor}:${start}-${end} takes in more than ${opts.nodeLimit.toLocaleString()} graph nodes, the most the browser reads for one view.`,
      )
    }
    return vgJson(graph.tables(kept, fragments), graph.sequences, opts.distinct)
  }
}

function vgJson(
  { nodes, walks }: GraphTables,
  sequences: Map<number, string>,
  distinct: boolean,
): VgJson & { edge: VgEdge[] } {
  const node: VgNode[] = nodes.names.flatMap((name, i) =>
    i < nodes.lengths.length
      ? [
          {
            id: name,
            sequence: sequences.get(Number(name)),
            sequenceLength: nodes.lengths[i]!,
          },
        ]
      : [],
  )

  const edges = new Map<string, VgEdge>()
  const path: VgPath[] = []
  const groups = new Map<string, VgPath & { freq: number }>()
  for (let p = 0; p < walks.names.length; p++) {
    const from = walks.offsets[p]!
    const to = walks.offsets[p + 1]!
    const steps: string[] = []
    const mapping = []
    for (let s = from; s < to; s++) {
      const i = walks.steps[s]!
      const reverse = walks.reversed[s] === 1
      const length = nodes.lengths[i] ?? 0
      steps.push(`${i}${reverse ? '-' : '+'}`)
      mapping.push({
        position: { node_id: nodes.names[i]!, is_reverse: reverse },
        edit: [{ from_length: length, to_length: length }],
      })
      if (s > from) {
        const edge = {
          from: nodes.names[walks.steps[s - 1]!]!,
          to: nodes.names[i]!,
          from_start: walks.reversed[s - 1] === 1,
          to_end: reverse,
        }
        edges.set(
          `${edge.from}${edge.from_start}${edge.to}${edge.to_end}`,
          edge,
        )
      }
    }
    const walk: VgPath = {
      name: walks.names[p],
      indexOfFirstBase: walks.starts[p],
      mapping,
    }
    if (!distinct) {
      path.push(walk)
      continue
    }
    const key = steps.join(',')
    const group = groups.get(key)
    if (group) {
      group.freq++
    } else {
      groups.set(key, { ...walk, freq: 1 })
    }
  }
  path.push(...groups.values())
  return { node, edge: [...edges.values()], path }
}
