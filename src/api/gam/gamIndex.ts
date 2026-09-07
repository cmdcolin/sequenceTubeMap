// Parser + query interface for vg's GAM index (.gam.gai).
//
// The on-disk format is a gzip-compressed varint stream (see
// vg/src/stream_index.cpp). After gunzipping, the body is:
//
//   magic        "GAI!"                  (4 bytes, optional in version 0)
//   version      varint32                (=1 for current vg)
//   bin_count    varint64
//   for each bin:
//     bin_number varint64
//     run_count  varint64
//     for each run:
//       start    varint64                (BGZF virtual offset)
//       past_end varint64
//   window_count varint64
//   for each window:
//     window     varint64                (node_id >> WINDOW_SHIFT)
//     start_vo   varint64
//
// Bins use a binary-tree indexing scheme keyed by ID prefix. A node ID is
// mapped to a 64-bit "prefix"; a bin numbered B covers all IDs sharing some
// common prefix with B. We don't need vg's full BitString machinery to query
// — every bin contains some set of virtual-offset runs, and a query for IDs
// in [minNode, maxNode] just needs to union the runs of every bin whose
// covered ID range overlaps [minNode, maxNode], starting at or after the
// first occupied window.

import { ungzip } from 'pako-esm2'
import { readVarint32, readVarint64 } from './varint.ts'

// Matches StreamIndexBase::WINDOW_SHIFT (see vg/src/stream_index.hpp).
const WINDOW_SHIFT = 8n

const MAGIC = new Uint8Array([0x47, 0x41, 0x49, 0x21]) // "GAI!"

export interface IndexRun {
  start: bigint
  pastEnd: bigint
}

export interface GamIndex {
  version: number
  // bin number -> list of virtual-offset runs known to overlap this bin.
  bins: Map<bigint, IndexRun[]>
  // window (= node_id >> WINDOW_SHIFT) -> minimum virtual offset where a
  // group overlapping that window can start.
  windows: Map<bigint, bigint>
}

export async function loadGamIndex(blob: Blob): Promise<GamIndex> {
  const raw = new Uint8Array(await blob.arrayBuffer())
  // vg writes .gam.gai with protobuf's GzipOutputStream (raw gzip, not BGZF).
  const body: Uint8Array = ungzip(raw, {})
  return parseIndexBody(body)
}

function parseIndexBody(buf: Uint8Array): GamIndex {
  let offset = 0
  let version = 0
  if (
    buf.length >= MAGIC.length &&
    buf[0] === MAGIC[0] &&
    buf[1] === MAGIC[1] &&
    buf[2] === MAGIC[2] &&
    buf[3] === MAGIC[3]
  ) {
    offset = MAGIC.length
    const r = readVarint32(buf, offset)
    version = r.value
    offset = r.offset
  }

  const bins = new Map<bigint, IndexRun[]>()
  const windows = new Map<bigint, bigint>()

  const binCount = readVarint64(buf, offset)
  offset = binCount.offset
  for (let i = 0n; i < binCount.value; i++) {
    const bin = readVarint64(buf, offset)
    offset = bin.offset
    const runCount = readVarint64(buf, offset)
    offset = runCount.offset
    const runs: IndexRun[] = []
    for (let j = 0n; j < runCount.value; j++) {
      const start = readVarint64(buf, offset)
      offset = start.offset
      const pastEnd = readVarint64(buf, offset)
      offset = pastEnd.offset
      runs.push({ start: start.value, pastEnd: pastEnd.value })
    }
    bins.set(bin.value, runs)
  }

  const windowCount = readVarint64(buf, offset)
  offset = windowCount.offset
  for (let i = 0n; i < windowCount.value; i++) {
    const w = readVarint64(buf, offset)
    offset = w.offset
    const start = readVarint64(buf, offset)
    offset = start.offset
    windows.set(w.value, start.value)
  }

  return { version, bins, windows }
}

// Return the union of virtual-offset runs that could contain Alignments
// touching node IDs in [minNode, maxNode], pruned by the first occupied
// window in that range.
export function runsForNodeRange(
  index: GamIndex,
  minNode: bigint,
  maxNode: bigint,
): IndexRun[] {
  const minWindow = minNode >> WINDOW_SHIFT
  const maxWindow = maxNode >> WINDOW_SHIFT

  // Find the earliest occupied window >= minWindow and <= maxWindow. Its
  // start_vo is the lower bound below which we can prune runs.
  let minVo: bigint | null = null
  for (const [w, start] of index.windows) {
    if (w >= minWindow && w <= maxWindow) {
      if (minVo === null || start < minVo) {
        minVo = start
      }
    }
  }
  if (minVo === null) {
    return []
  }

  // Collect runs from every bin whose covered ID range overlaps [minNode,
  // maxNode]. We don't reconstruct vg's BitString tree here — bins are few
  // (proportional to indexed groups) and per-query iteration is cheap.
  const merged: IndexRun[] = []
  for (const [bin, runs] of index.bins) {
    if (!binOverlaps(bin, minNode, maxNode)) {
      continue
    }
    for (const run of runs) {
      if (run.pastEnd <= minVo) {
        continue
      }
      const start = run.start < minVo ? minVo : run.start
      merged.push({ start, pastEnd: run.pastEnd })
    }
  }

  merged.sort((a, b) => {
    if (a.start < b.start) return -1
    if (a.start > b.start) return 1
    return 0
  })

  // Coalesce overlapping/adjacent runs to avoid re-reading the same bytes.
  const out: IndexRun[] = []
  for (const run of merged) {
    const last = out[out.length - 1]
    if (last && run.start <= last.pastEnd) {
      if (run.pastEnd > last.pastEnd) {
        last.pastEnd = run.pastEnd
      }
    } else {
      out.push({ ...run })
    }
  }
  return out
}

// Does this bin's covered ID range overlap [minNode, maxNode]?
//
// Bin numbering follows vg's scheme: bin B has an offset O (all-1s value with
// some leading zeros) and an index I = B - O, where O has K bits set and the
// bin covers all IDs whose top K bits match I. So the covered range is
// [I << (64 - K), (I + 1) << (64 - K) - 1] over 64-bit IDs.
function binOverlaps(bin: bigint, minNode: bigint, maxNode: bigint): boolean {
  const { rangeStart, rangeEnd } = binIdRange(bin)
  return !(rangeEnd < minNode || rangeStart > maxNode)
}

export function binIdRange(bin: bigint): { rangeStart: bigint; rangeEnd: bigint } {
  if (bin === 0n) {
    return { rangeStart: 0n, rangeEnd: (1n << 64n) - 1n }
  }
  // Count leading zeros of `bin` in a 64-bit field.
  let leadingZeros = 0n
  for (let i = 63n; i >= 0n; i--) {
    if (((bin >> i) & 1n) !== 0n) {
      break
    }
    leadingZeros++
  }
  const totalBits = 64n
  let usedBits = totalBits - leadingZeros
  let offset = (1n << usedBits) - 1n
  if (offset > bin) {
    usedBits -= 1n
    offset = (1n << usedBits) - 1n
  }
  const idx = bin - offset
  const idBits = totalBits - usedBits
  const rangeStart = idx << idBits
  const rangeEnd = rangeStart + (1n << idBits) - 1n
  return { rangeStart, rangeEnd }
}
