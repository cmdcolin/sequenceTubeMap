// Rows of a walk-indexed graph, as `gfa-to-tabix --walks` writes them, each
// filed under the first base of a fixed chunk of the reference:
//
//   walks: anchor cs cs+1  sample#hap#contig fragStart hapOffset piece nsteps steps [pv:i:cs] [nx:i:cs]
//   nodes: anchor cs cs+1  nodeId rank seq start end LN:i:length [SQ:Z:bases]
//
// Ported from jbrowse-plugin-graphgenomeviewer's RgfaTabixAdapter/walkRows.ts,
// which documents the cut in more depth.

export interface WalkChunk {
  refName: string
  start: number
}

export interface WalkRow {
  name: string
  fragStart: number
  hapOffset: number
  piece: number
  n: number
  enc: string
  prev?: WalkChunk
  next?: WalkChunk
}

export interface WalkNode {
  refName: string
  start: number
  end: number
  rank: number
  sequence: string | undefined
  onWindow: boolean
}

export interface WalkWindow {
  refName: string
  start: number
  end: number
}

export interface WalkHeader {
  chunk: number
  maxNode: number | undefined
  references: string[]
  haplotypes: string[]
}

const DEFAULT_CHUNK = 65536

function integerTag(line: string, tag: string) {
  const match = new RegExp(`(?:^|\\t)${tag}:i:(\\d+)`).exec(line)
  return match ? Number(match[1]) : undefined
}

export function walkHeader(lines: string[]): WalkHeader {
  let chunk: number | undefined
  let maxNode: number | undefined
  const references: string[] = []
  const haplotypes: string[] = []
  for (const line of lines) {
    const [key, value = ''] = line.split('\t')
    if (key === '#reference') {
      references.push(value)
    } else if (key === '#haplotype') {
      haplotypes.push(value)
    } else {
      chunk ??= integerTag(line, 'chunk')
      maxNode ??= integerTag(line, 'maxnode')
    }
  }
  return { chunk: chunk ?? DEFAULT_CHUNK, maxNode, references, haplotypes }
}

// A node reaching into the window starts at most `maxNode` bp before it, so
// its row sits at most that many chunks back, and never less than one: the
// chunk before holds the detour a haplotype takes into the window's first
// reference node.
export function chunkQueryStart(
  start: number,
  { chunk, maxNode }: WalkHeader,
): number {
  const lookback =
    maxNode === undefined ? 1 : Math.max(1, Math.ceil(maxNode / chunk))
  return Math.max(0, (Math.floor(start / chunk) - lookback) * chunk)
}

export function parseWalkRow(line: string): WalkRow {
  const c = line.split('\t')
  const row: WalkRow = {
    name: c[3]!,
    fragStart: Number(c[4]),
    hapOffset: Number(c[5]),
    piece: Number(c[6]),
    n: Number(c[7]),
    enc: c[8]!,
  }
  for (const tag of c.slice(9)) {
    const side = tag.startsWith('pv:')
      ? 'prev'
      : tag.startsWith('nx:')
        ? 'next'
        : undefined
    if (side) {
      const at = tag.lastIndexOf(':')
      row[side] = {
        refName: tag[3] === 'Z' ? tag.slice(5, at) : c[0]!,
        start: Number(tag.slice(at + 1)),
      }
    }
  }
  return row
}

export function parseNodeRow(
  line: string,
  window: WalkWindow,
): [number, WalkNode] {
  const c = line.split('\t')
  const rank = Number(c[4])
  const refName = c[5]!
  const start = Number(c[6])
  const end = Number(c[7])
  const sq = c.slice(8).find(tag => tag.startsWith('SQ:Z:'))
  return [
    Number(c[3]),
    {
      rank,
      refName,
      start,
      end,
      sequence: sq?.slice(5),
      onWindow:
        rank === 0 &&
        refName === window.refName &&
        end > window.start &&
        start < window.end,
    },
  ]
}

// Each step is `2 × (id − previous id) + r`, the first from 0, with `r` 1 on
// the reverse strand.
export function decodeSteps(
  enc: string,
  ids: Int32Array,
  rev: Uint8Array,
  at: number,
) {
  let prev = 0
  let i = at
  for (const field of enc.split(',')) {
    const d = Number(field)
    const r = d & 1
    rev[i] = r
    prev += (d - r) / 2
    ids[i++] = prev
  }
}

// One stretch of a haplotype path: rows of consecutive piece index, decoded,
// and the chunks the path goes on in before and after it
export interface WalkRun {
  name: string
  hapOffset: number
  ids: Int32Array
  rev: Uint8Array
  prev?: WalkChunk
  next?: WalkChunk
}

export function joinPieces(rows: WalkRow[]): WalkRun[] {
  const byPath = new Map<string, WalkRow[]>()
  for (const row of rows) {
    const key = `${row.name}\t${row.fragStart}`
    const list = byPath.get(key)
    if (list) {
      list.push(row)
    } else {
      byPath.set(key, [row])
    }
  }
  const runs: WalkRun[] = []
  for (const pieces of byPath.values()) {
    pieces.sort((a, b) => a.piece - b.piece)
    let from = 0
    for (let i = 1; i <= pieces.length; i++) {
      if (
        i === pieces.length ||
        pieces[i]!.piece !== pieces[i - 1]!.piece + 1
      ) {
        runs.push(decodeRun(pieces.slice(from, i)))
        from = i
      }
    }
  }
  return runs
}

function decodeRun(pieces: WalkRow[]): WalkRun {
  const n = pieces.reduce((sum, p) => sum + p.n, 0)
  const ids = new Int32Array(n)
  const rev = new Uint8Array(n)
  let at = 0
  for (const p of pieces) {
    decodeSteps(p.enc, ids, rev, at)
    at += p.n
  }
  const first = pieces[0]!
  return {
    name: first.name,
    hapOffset: first.hapOffset,
    ids,
    rev,
    prev: first.prev,
    next: pieces.at(-1)!.next,
  }
}

export interface WalkFragment {
  name: string
  hapStart: number
  hapEnd: number
  ids: Int32Array
  rev: Uint8Array
}

/**
 * The cut a window draws: the reference over the window, and each run from
 * its first to its last step there. A run that leaves the reference is
 * followed to the reference step where it rejoins when the rows hold it, and
 * the reference is cut out as far as those rejoins reach. A run then goes on
 * outward while its next node is already in the cut. `open` lists the chunks
 * a run cut off at the end of the rows goes on in, which a caller can read to
 * finish it.
 */
export function walkCut(
  runs: WalkRun[],
  nodes: Map<number, WalkNode>,
  refName: string,
) {
  const onWindow = (id: number) => nodes.get(id)?.onWindow === true
  const reference = (id: number) => {
    const node = nodes.get(id)
    return node?.rank === 0 ? node : undefined
  }
  const open = new Map<string, WalkChunk>()
  const goesOn = (chunk: WalkChunk | undefined) => {
    if (chunk) {
      open.set(`${chunk.refName}:${chunk.start}`, chunk)
    }
  }
  const rejoin = (run: WalkRun, at: number, dir: number) => {
    const { ids } = run
    let i = at + dir
    while (i >= 0 && i < ids.length && reference(ids[i]!) === undefined) {
      i += dir
    }
    if (i < 0 || i >= ids.length) {
      goesOn(dir < 0 ? run.prev : run.next)
      return i - dir
    }
    const from = reference(ids[at]!)!
    const to = reference(ids[i]!)!
    if (to.refName !== refName) {
      return i - dir
    }
    const adjacent =
      i === at + dir && (to.start === from.end || to.end === from.start)
    return adjacent ? at : i
  }
  let reachStart = Infinity
  let reachEnd = -Infinity
  const spans: { run: WalkRun; first: number; last: number }[] = []
  for (const run of runs) {
    const { ids } = run
    let first = -1
    let last = -1
    for (let i = 0; i < ids.length; i++) {
      if (onWindow(ids[i]!)) {
        if (first < 0) {
          first = i
        }
        last = i
      }
    }
    if (first >= 0) {
      if (run.name !== refName) {
        first = rejoin(run, first, -1)
        last = rejoin(run, last, 1)
        for (const i of [first, last]) {
          const node = reference(ids[i]!)
          if (node) {
            reachStart = Math.min(reachStart, node.start)
            reachEnd = Math.max(reachEnd, node.end)
          }
        }
      }
      spans.push({ run, first, last })
    }
  }
  const inReach = (id: number) => {
    const node = reference(id)
    return (
      onWindow(id) ||
      (node?.refName === refName &&
        node.end > reachStart &&
        node.start < reachEnd)
    )
  }
  const kept = new Set<number>()
  for (const [id, node] of nodes) {
    if (node.onWindow) {
      kept.add(id)
    }
  }
  for (const span of spans) {
    const { ids } = span.run
    if (span.run.name === refName) {
      while (span.first > 0 && inReach(ids[span.first - 1]!)) {
        span.first--
      }
      while (span.last < ids.length - 1 && inReach(ids[span.last + 1]!)) {
        span.last++
      }
    }
    for (let i = span.first; i <= span.last; i++) {
      kept.add(ids[i]!)
    }
  }
  const length = (id: number) => {
    const node = nodes.get(id)
    return node === undefined ? 0 : node.end - node.start
  }
  const fragments: WalkFragment[] = []
  for (const { run, first: f, last: l } of spans) {
    const { ids, rev } = run
    let first = f
    let last = l
    while (first > 0 && kept.has(ids[first - 1]!)) {
      first--
    }
    while (last < ids.length - 1 && kept.has(ids[last + 1]!)) {
      last++
    }
    let hapStart = run.hapOffset
    for (let i = 0; i < first; i++) {
      hapStart += length(ids[i]!)
    }
    let hapEnd = hapStart
    for (let i = first; i <= last; i++) {
      hapEnd += length(ids[i]!)
    }
    fragments.push({
      name: run.name,
      hapStart,
      hapEnd,
      ids: ids.subarray(first, last + 1),
      rev: rev.subarray(first, last + 1),
    })
  }
  return { kept, fragments, open: [...open.values()] }
}
