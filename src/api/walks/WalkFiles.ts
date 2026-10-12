import { TabixIndexedFile } from '@gmod/tabix'
import type { GenericFilehandle } from 'generic-filehandle2'

import {
  chunkQueryStart,
  joinPieces,
  parseNodeRow,
  parseWalkRow,
  walkCut,
  walkHeader,
} from './walkCut.ts'
import type {
  WalkFragment,
  WalkHeader,
  WalkNode,
  WalkRow,
  WalkWindow,
} from './walkCut.ts'
import type { PathInfo } from '../../Types.ts'
import type { VgJson, VgNode, VgPath } from '../../util/tubemap.ts'

// gbz-base's default, so both backends cut the same reference for a region
const CONTEXT_BP = 100

// A walk cut off at the edge of the rows goes on in the chunk its row names,
// which a cut reads out to in this many rounds, at most this many chunks away
const FOLLOW_ROUNDS = 3
const FOLLOW_CHUNKS = 4

export interface WalkFileHandles {
  walks: GenericFilehandle
  walksIndex: GenericFilehandle
  nodes: GenericFilehandle
  nodesIndex: GenericFilehandle
}

export class WalkLimitError extends Error {}

// A walk file set read through its Tabix indexes: this class fetches the rows
// under a window, and walkCut.ts makes the cut from them.
export class WalkFiles {
  private walks: TabixIndexedFile
  private nodes: TabixIndexedFile
  private header: Promise<WalkHeader> | undefined

  constructor(files: WalkFileHandles) {
    this.walks = new TabixIndexedFile({
      filehandle: files.walks,
      tbiFilehandle: files.walksIndex,
    })
    this.nodes = new TabixIndexedFile({
      filehandle: files.nodes,
      tbiFilehandle: files.nodesIndex,
    })
  }

  private getHeader(signal?: AbortSignal): Promise<WalkHeader> {
    this.header ??= this.walks
      .getHeaderLines({ signal })
      .then(walkHeader)
      .catch((e: unknown) => {
        this.header = undefined
        throw e
      })
    return this.header
  }

  // The anchor sequence a region's contig names. Walk files name it in full
  // PanSN, `GRCh38#0#chr20`, and the region box also takes the forms the
  // gbz-base backend does: `GRCh38#chr20` and plain `chr20`.
  async anchorFor(contig: string, signal?: AbortSignal): Promise<string> {
    const names = await this.walks.getReferenceSequenceNames({ signal })
    if (names.includes(contig)) {
      return contig
    }
    const parts = contig.split('#')
    const { references } = await this.getHeader(signal)
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
  // ends, from the rows of the chunks the index says it spans.
  async pathInfo(signal?: AbortSignal): Promise<PathInfo[]> {
    const header = await this.getHeader(signal)
    const names = await this.walks.getReferenceSequenceNames({ signal })
    return await Promise.all(
      names.map(async name => {
        const span = await this.lastChunkStart(name, header, signal)
        let length = 0
        await this.nodes.getLines(name, span, Number.MAX_SAFE_INTEGER, {
          signal,
          lineCallback: line => {
            const [, node] = parseNodeRow(line, {
              refName: '',
              start: 0,
              end: 0,
            })
            if (node.rank === 0 && node.refName === name) {
              length = Math.max(length, node.end)
            }
          },
        })
        return { name, length, cyclic: false }
      }),
    )
  }

  // The start of the last chunk with rows, found from the index alone: every
  // chunk the reference passes through files its nodes there, so the chunks
  // with rows run unbroken from the first.
  private async lastChunkStart(
    name: string,
    { chunk }: WalkHeader,
    signal?: AbortSignal,
  ): Promise<number> {
    const hasRows = async (k: number) =>
      (await this.nodes.bytesForRegions(
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
    const { signal } = opts
    const header = await this.getHeader(signal)
    const { chunk } = header
    const window: WalkWindow = {
      refName: anchor,
      start: Math.max(0, start - CONTEXT_BP),
      end: end + CONTEXT_BP,
    }
    const rows: WalkRow[] = []
    const nodes = new Map<number, WalkNode>()
    const read = (from: number, to: number) =>
      Promise.all([
        this.walks.getLines(anchor, from, to, {
          signal,
          lineCallback: line => {
            rows.push(parseWalkRow(line))
          },
        }),
        this.nodes.getLines(anchor, from, to, {
          signal,
          lineCallback: line => {
            const [id, node] = parseNodeRow(line, window)
            if (!nodes.has(id)) {
              if (nodes.size >= opts.nodeLimit) {
                throw new WalkLimitError(
                  `${anchor}:${start}-${end} takes in more than ${opts.nodeLimit.toLocaleString()} graph nodes, the most the browser reads for one view.`,
                )
              }
              nodes.set(id, node)
            }
          },
        }),
      ])

    let first = chunkQueryStart(window.start, header)
    let last = Math.floor((window.end - 1) / chunk) * chunk
    await read(first, window.end)
    let cut = walkCut(joinPieces(rows), nodes, anchor)
    const [lo, hi] = [
      first - FOLLOW_CHUNKS * chunk,
      last + FOLLOW_CHUNKS * chunk,
    ]
    for (let round = 0; round < FOLLOW_ROUNDS; round++) {
      const starts = cut.open
        .filter(c => c.refName === anchor && c.start >= lo && c.start <= hi)
        .map(c => c.start)
      const spans = [
        { from: Math.min(first, ...starts), to: first },
        { from: last + chunk, to: Math.max(last, ...starts) + 1 },
      ].filter(span => span.to > span.from)
      if (spans.length === 0) {
        break
      }
      first = Math.min(first, ...starts)
      last = Math.max(last, ...starts)
      await Promise.all(spans.map(({ from, to }) => read(from, to)))
      cut = walkCut(joinPieces(rows), nodes, anchor)
    }
    return vgJson(cut.kept, nodes, cut.fragments, anchor, opts.distinct)
  }
}

interface VgEdge {
  from: string
  to: string
  from_start: boolean
  to_end: boolean
}

function vgJson(
  kept: Set<number>,
  nodes: Map<number, WalkNode>,
  fragments: WalkFragment[],
  anchor: string,
  distinct: boolean,
): VgJson & { edge: VgEdge[] } {
  const node: VgNode[] = []
  for (const id of kept) {
    const n = nodes.get(id)
    if (n) {
      node.push({
        id: String(id),
        sequence: n.sequence,
        sequenceLength: n.end - n.start,
      })
    }
  }
  const lengthOf = (id: number) => {
    const n = nodes.get(id)
    return n === undefined ? 0 : n.end - n.start
  }

  const edges = new Map<string, VgEdge>()
  for (const { ids, rev } of fragments) {
    for (let i = 1; i < ids.length; i++) {
      const edge = {
        from: String(ids[i - 1]),
        to: String(ids[i]),
        from_start: rev[i - 1] === 1,
        to_end: rev[i] === 1,
      }
      edges.set(`${edge.from}${edge.from_start}${edge.to}${edge.to_end}`, edge)
    }
  }

  const ordered = [...fragments].sort(
    (a, b) =>
      Number(b.name === anchor) - Number(a.name === anchor) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : a.hapStart - b.hapStart),
  )
  const groups = new Map<string, { fragment: WalkFragment; freq: number }>()
  const path: VgPath[] = []
  const toPath = (f: WalkFragment): VgPath => ({
    name: f.name,
    indexOfFirstBase: f.hapStart,
    mapping: Array.from(f.ids, (id, i) => {
      const length = lengthOf(id)
      return {
        position: { node_id: String(id), is_reverse: f.rev[i] === 1 },
        edit: [{ from_length: length, to_length: length }],
      }
    }),
  })
  for (const f of ordered) {
    if (!distinct) {
      path.push(toPath(f))
      continue
    }
    const key = `${f.ids.join(',')}|${f.rev.join('')}`
    const group = groups.get(key)
    if (group) {
      group.freq++
    } else {
      groups.set(key, { fragment: f, freq: 1 })
    }
  }
  for (const { fragment, freq } of groups.values()) {
    path.push({ ...toPath(fragment), freq })
  }
  return { node, edge: [...edges.values()], path }
}
