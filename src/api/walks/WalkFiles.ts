import { WalkReader } from '@jbrowse/graph-walks'
import type { GraphTables, WalkFilehandle } from '@jbrowse/graph-walks'

import type { AbridgedWalk, PathInfo } from '../../Types.ts'
import type { VgJson, VgNode, VgPath } from '../../util/tubemap.ts'

// gbz-base's default, so both backends cut the same reference for a region
const CONTEXT_BP = 100

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
   * The graph under `start`-`end` of reference sequence `anchor`, with
   * `CONTEXT_BP` either side: the nodes the cut keeps and each walk through
   * them, in the vg JSON the tube map draws. `distinct` merges walks that take
   * the same steps into one path whose `freq` counts them. A walk abridged in
   * the window comes back in `abridged` rather than as a path, unless
   * `expand` names it. A cut past `nodeLimit` nodes or graph-walks' budgets
   * throws its RegionTooLargeError, and one whose departure read is past its
   * budget a DepartureReadError.
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
        signal: opts.signal,
        context: CONTEXT_BP,
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

// Each walk the tube map draws, from the walks the cut keeps. A walk leaving
// the drawn stretch into sequence of its own goes on through it, and one
// coming back from it starts there, where the cut holds all of that
// departure's own steps; two fragments one such departure joins are one walk.
// The tube map draws only the nodes a walk visits, so without this the
// departure's own nodes, which the cut keeps, would not be drawn.
function drawnWalks({ nodes, walks, departures }: GraphTables): DrawnWalk[] {
  const key = (name: string, bp: number) => `${name}\t${bp}`
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
    if (heldBp === ownBp) {
      const name = departures.names[k]!
      const hapStart = departures.hapStarts[k]!
      leaving.set(key(name, hapStart), k)
      rejoining.set(key(name, hapStart + ownBp), k)
    }
  }
  const isAbridged = (p: number) =>
    !Number.isNaN(walks.abridgedSteps?.[p] ?? Number.NaN)
  const startingAt = new Map<string, number>()
  for (let p = 0; p < walks.names.length; p++) {
    if (!isAbridged(p)) {
      startingAt.set(key(walks.names[p]!, walks.starts[p]!), p)
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
    if (!isAbridged(p) && !joined.has(p)) {
      const name = walks.names[p]!
      const walk: DrawnWalk = { name, start: walks.starts[p]!, ...stepsOf(p) }
      const before = rejoining.get(key(name, walk.start))
      if (before !== undefined) {
        const own = ownSteps(before)
        walk.steps.unshift(...own.steps)
        walk.reversed.unshift(...own.reversed)
        walk.start = departures.hapStarts[before]!
      }
      let last: number | undefined = p
      while (last !== undefined) {
        const after = leaving.get(key(name, walks.ends[last]!))
        last = undefined
        if (after !== undefined) {
          const own = ownSteps(after)
          walk.steps.push(...own.steps)
          walk.reversed.push(...own.reversed)
          const next = startingAt.get(
            key(name, departures.hapStarts[after]! + departures.ownBp[after]!),
          )
          if (next !== undefined) {
            const rest = stepsOf(next)
            walk.steps.push(...rest.steps)
            walk.reversed.push(...rest.reversed)
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
  const { nodes, walks } = tables
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

  const abridged = new Map<string, AbridgedWalk>()
  for (let p = 0; p < walks.names.length; p++) {
    const abridgedSteps = walks.abridgedSteps?.[p] ?? Number.NaN
    if (!Number.isNaN(abridgedSteps)) {
      const name = walks.names[p]!
      const walk = abridged.get(name) ?? { name, steps: 0, bp: 0 }
      walk.steps += abridgedSteps
      walk.bp += walks.abridgedBp![p]!
      abridged.set(name, walk)
    }
  }

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
  path.push(...groups.values())
  return {
    graph: { node, edge: [...edges.values()], path },
    abridged: [...abridged.values()],
  }
}
