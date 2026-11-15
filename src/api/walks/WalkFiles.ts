import { CUT_PRESETS, WalkReader, abridgedWalks } from '@jbrowse/graph-walks'
import type { GraphTables, WalkFilehandle } from '@jbrowse/graph-walks'

import type { AbridgedWalk, PathInfo } from '../../Types.ts'
import type { VgJson, VgNode, VgPath } from '../../util/tubemap.ts'

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
  private reader: WalkReader

  constructor(files: { data: WalkFilehandle; directory: WalkFilehandle }) {
    this.reader = WalkReader.fromFilehandles(files)
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

  // One entry per reference sequence, with where its last node ends
  async pathInfo(signal?: AbortSignal): Promise<PathInfo[]> {
    const names = await this.reader.referenceSequences({ signal })
    return await Promise.all(
      names.map(async name => ({
        name,
        length: await this.reader.sequenceLength(name, { signal }),
        cyclic: false,
      })),
    )
  }

  /**
   * The graph under `start`-`end` of reference sequence `anchor`, cut by
   * graph-walks' browser preset as every reader cuts it: the nodes the cut
   * keeps and each walk through them, in the vg JSON the tube map draws.
   * `distinct` merges walks that take the same steps into one path whose
   * `freq` counts them. A walk with a run off the reference the cut did not
   * load is drawn only in its loaded fragments, and comes back in `abridged`
   * with graph-walks' counts, unless `expand` names it. A cut past `nodeLimit` nodes or
   * graph-walks' budgets throws its RegionTooLargeError, and one whose
   * departure read is past its budget a DepartureReadError.
   */
  async subgraph(
    anchor: string,
    start: number,
    end: number,
    opts: {
      distinct: boolean
      nodeLimit: number
      expand?: string[]
      signal?: AbortSignal
    },
  ): Promise<{ graph: VgJson & { edge: VgEdge[] }; abridged: AbridgedWalk[] }> {
    const expand = new Set(opts.expand)
    const { graph, kept, fragments, departures } = await this.reader.cut(
      anchor,
      { start, end },
      {
        ...CUT_PRESETS.browser,
        signal: opts.signal,
        links: false,
        sequences: true,
        nodeLimit: opts.nodeLimit,
        expand: name => expand.has(name),
      },
    )
    return vgJson(
      graph.tables(kept, fragments, departures),
      graph.sequences,
      opts.distinct,
    )
  }
}

interface DrawnWalk {
  name: string
  start: number
  steps: number[]
  reversed: boolean[]
}

function walkKey(name: string, bp: number) {
  return `${name}\t${bp}`
}

// A placeholder stands for a run of steps off the reference that the cut did
// not load, so no step of it is a node
function isPlaceholder({ placeholders }: GraphTables['nodes'], i: number) {
  return placeholders?.[i] === 1
}

function isAbridged({ nodes, walks }: GraphTables, p: number) {
  return walks.steps
    .subarray(walks.offsets[p], walks.offsets[p + 1])
    .some(i => isPlaceholder(nodes, i))
}

// Each walk the tube map draws, from the walks the cut keeps. A walk leaving
// the drawn stretch into sequence of its own goes on through it, and one
// coming back from it starts there, where the cut holds all of that
// departure's own steps, loaded; two fragments one such departure joins are
// one walk. The tube map draws only the nodes a walk visits, so without this
// the departure's own nodes, which the cut keeps, would not be drawn.
function drawnWalks(tables: GraphTables): DrawnWalk[] {
  const { nodes, walks, departures } = tables
  const ownSteps = (k: number) => {
    const from = departures.offsets[k]!
    const to = departures.offsets[k + 1]!
    return {
      steps: [...departures.steps.subarray(from, to)],
      reversed: [...departures.reversed.subarray(from, to)].map(r => r === 1),
    }
  }
  const leaving = new Map<string, number>()
  const rejoining = new Map<string, number>()
  for (let k = 0; k < departures.names.length; k++) {
    const { steps } = ownSteps(k)
    const ownBp = departures.ownBp[k]!
    const heldBp = steps.reduce(
      (bp, i) => bp + (nodes.lengths[i] ?? Number.NaN),
      0,
    )
    if (heldBp === ownBp && !steps.some(i => isPlaceholder(nodes, i))) {
      const name = departures.names[k]!
      const hapStart = departures.hapStarts[k]!
      leaving.set(walkKey(name, hapStart), k)
      rejoining.set(walkKey(name, hapStart + ownBp), k)
    }
  }
  const startingAt = new Map<string, number>()
  for (let p = 0; p < walks.names.length; p++) {
    if (!isAbridged(tables, p)) {
      startingAt.set(walkKey(walks.names[p]!, walks.starts[p]!), p)
    }
  }
  const stepsOf = (p: number) => {
    const from = walks.offsets[p]!
    const to = walks.offsets[p + 1]!
    return {
      steps: [...walks.steps.subarray(from, to)],
      reversed: [...walks.reversed.subarray(from, to)].map(r => r === 1),
    }
  }
  const joined = new Set<number>()
  const drawn: DrawnWalk[] = []
  for (let p = 0; p < walks.names.length; p++) {
    if (!isAbridged(tables, p) && !joined.has(p)) {
      const name = walks.names[p]!
      const walk: DrawnWalk = { name, start: walks.starts[p]!, ...stepsOf(p) }
      const before = rejoining.get(walkKey(name, walk.start))
      if (before !== undefined) {
        const own = ownSteps(before)
        walk.steps = own.steps.concat(walk.steps)
        walk.reversed = own.reversed.concat(walk.reversed)
        walk.start = departures.hapStarts[before]!
      }
      let last: number | undefined = p
      while (last !== undefined) {
        const after = leaving.get(walkKey(name, walks.ends[last]!))
        last = undefined
        if (after !== undefined) {
          const own = ownSteps(after)
          walk.steps = walk.steps.concat(own.steps)
          walk.reversed = walk.reversed.concat(own.reversed)
          const next = startingAt.get(
            walkKey(
              name,
              departures.hapStarts[after]! + departures.ownBp[after]!,
            ),
          )
          if (next !== undefined) {
            const rest = stepsOf(next)
            walk.steps = walk.steps.concat(rest.steps)
            walk.reversed = walk.reversed.concat(rest.reversed)
            joined.add(next)
            last = next
          }
        }
      }
      drawn.push(walk)
    }
  }
  return drawn
}

function vgJson(
  tables: GraphTables,
  sequences: Map<number, string>,
  distinct: boolean,
): { graph: VgJson & { edge: VgEdge[] }; abridged: AbridgedWalk[] } {
  const { nodes } = tables
  const node: VgNode[] = nodes.names.flatMap((name, i) =>
    i < nodes.lengths.length && !isPlaceholder(nodes, i)
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
  for (const { name, start, steps, reversed } of drawnWalks(tables)) {
    const mapping = steps.map((i, s) => {
      const length = nodes.lengths[i] ?? 0
      if (s > 0) {
        const edge = {
          from: nodes.names[steps[s - 1]!]!,
          to: nodes.names[i]!,
          from_start: reversed[s - 1]!,
          to_end: reversed[s]!,
        }
        edges.set(
          `${edge.from}${edge.from_start}${edge.to}${edge.to_end}`,
          edge,
        )
      }
      return {
        position: { node_id: nodes.names[i]!, is_reverse: reversed[s]! },
        edit: [{ from_length: length, to_length: length }],
      }
    })
    const walk: VgPath = { name, indexOfFirstBase: start, mapping }
    if (distinct) {
      const key = steps.map((i, s) => `${i}${reversed[s] ? '-' : '+'}`).join()
      const group = groups.get(key)
      if (group) {
        group.freq++
      } else {
        groups.set(key, { ...walk, freq: 1 })
      }
    } else {
      path.push(walk)
    }
  }
  for (const group of groups.values()) {
    path.push(group)
  }
  return {
    graph: { node, edge: [...edges.values()], path },
    abridged: abridgedWalks(tables),
  }
}
