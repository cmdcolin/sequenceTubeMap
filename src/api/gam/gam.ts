// Top-level GAM reader. A GAM file is BGZF-compressed libvgio "type-tagged
// grouped messages" where each Alignment message gets the tag "GAM".
//
// Two read paths are exposed:
//
//   readGam(blob)
//     Whole-file scan. Decompresses the file fully and yields every
//     Alignment. Suitable for small uploads or as a fallback when no .gam.gai
//     is available.
//
//   readGamRegion(blob, indexBlob, minNode, maxNode)
//     Index-driven region query. Uses the .gam.gai file to find compressed
//     virtual offset runs that may contain Alignments touching the node-id
//     range [minNode, maxNode], reads only those bytes, and yields the
//     Alignments that actually overlap.

import { unzip } from '@gmod/bgzf-filehandle'
import { decodeAlignment } from './alignment.ts'
import { iterateMessages } from './messageStream.ts'
import { loadGamIndex, runsForNodeRange } from './gamIndex.ts'
import type { IndexRun } from './gamIndex.ts'
import {
  readFieldHeader,
  readLengthDelimited,
  skipField,
  WIRE_LEN,
  WIRE_VARINT,
} from './protoDecode.ts'
import { readVarint64 } from './varint.ts'
import type { VgRead } from '../../util/tubemap.ts'

const GAM_TAG = 'GAM'

// Older vg releases wrote .gam files without the explicit "GAM" tag, so we
// accept empty-tag messages too — the caller already knows the file is a GAM
// by extension.
function isAlignmentTag(tag: string): boolean {
  return tag === GAM_TAG || tag === ''
}

export async function readGam(blob: Blob): Promise<VgRead[]> {
  const compressed = new Uint8Array(await blob.arrayBuffer())
  const decompressed = await decompress(compressed)
  const out: VgRead[] = []
  for (const msg of iterateMessages(decompressed)) {
    if (isAlignmentTag(msg.tag)) {
      out.push(decodeAlignment(msg.bytes))
    }
  }
  return out
}

// Stream just the visited node IDs per read, without decoding the rest of
// the Alignment proto (mismatch edits, names, etc.). Per-read cost is one
// varint per mapping versus the full alignment.ts decode path — large win for
// read-coverage estimation across all paths, where the alignment payload is
// never used.
export async function scanReadNodeIds(blob: Blob): Promise<bigint[][]> {
  const compressed = new Uint8Array(await blob.arrayBuffer())
  const decompressed = await decompress(compressed)
  const reads: bigint[][] = []
  for (const msg of iterateMessages(decompressed)) {
    if (isAlignmentTag(msg.tag)) {
      reads.push(extractNodeIds(msg.bytes))
    }
  }
  return reads
}

// Walk an Alignment message and pull node IDs out of path.mapping[].position.node_id.
// Mirrors decodeAlignment's field-number assignments but skips everything else.
function extractNodeIds(buf: Uint8Array): bigint[] {
  const nodes: bigint[] = []
  let offset = 0
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 2 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      extractPathNodeIds(bytes, nodes)
      offset = next
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  return nodes
}

function extractPathNodeIds(buf: Uint8Array, out: bigint[]): void {
  let offset = 0
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 2 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      extractMappingNodeId(bytes, out)
      offset = next
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
}

function extractMappingNodeId(buf: Uint8Array, out: bigint[]): void {
  let offset = 0
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      const id = extractPositionNodeId(bytes)
      if (id !== null) out.push(id)
      offset = next
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
}

function extractPositionNodeId(buf: Uint8Array): bigint | null {
  let offset = 0
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_VARINT) {
      return readVarint64(buf, offset).value
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  return null
}

// vg's `vg gamsort` writes BGZF; older or hand-rolled .gam files are plain
// gzip. `unzip` from @gmod/bgzf-filehandle handles BGZF; for plain gzip we
// go through DecompressionStream because vg's protobuf-stream emits a
// concatenation of independent gzip members (so a single pako ungzip call
// only returns the first member).
async function decompress(buf: Uint8Array): Promise<Uint8Array> {
  const isBgzf = buf.length > 4 && buf[0] === 0x1f && buf[1] === 0x8b && (buf[3]! & 0x04) !== 0
  if (isBgzf) {
    return unzip(buf)
  }
  return decompressGzipMultiMember(buf)
}

async function decompressGzipMultiMember(buf: Uint8Array): Promise<Uint8Array> {
  // Build the input stream via Response rather than Blob.stream() — jsdom's
  // Blob doesn't implement stream(). Response accepts an ArrayBuffer (a copy
  // is needed because the Uint8Array<ArrayBufferLike> typing isn't a
  // BodyInit directly).
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)
  const source = new Response(ab).body
  if (!source) {
    throw new Error('Response.body unavailable; cannot decompress gzip')
  }
  const decompressed = source.pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(decompressed).arrayBuffer())
}

export async function readGamRegion(
  gamBlob: Blob,
  indexBlob: Blob,
  minNode: bigint,
  maxNode: bigint,
): Promise<VgRead[]> {
  const index = await loadGamIndex(indexBlob)
  const runs = runsForNodeRange(index, minNode, maxNode)
  if (runs.length === 0) {
    return []
  }
  const compressed = new Uint8Array(await gamBlob.arrayBuffer())
  return readAlignmentsForRuns(compressed, runs, minNode, maxNode)
}

// `runsForNodeRange` hands back non-overlapping, non-adjacent runs sorted by
// start, so every run is read exactly once and nothing is decoded twice.
export async function readAlignmentsForRuns(
  compressed: Uint8Array,
  runs: IndexRun[],
  minNode: bigint,
  maxNode: bigint,
): Promise<VgRead[]> {
  const out: VgRead[] = []
  for (const run of runs) {
    for (const msg of await messagesInRun(compressed, run)) {
      if (isAlignmentTag(msg.tag)) {
        const aln = decodeAlignment(msg.bytes)
        if (alignmentOverlaps(aln, minNode, maxNode)) {
          out.push(aln)
        }
      }
    }
  }
  return out
}

async function messagesInRun(compressed: Uint8Array, run: IndexRun) {
  const startBlock = blockOfVO(run.start)
  if (run.pastEnd <= run.start || startBlock >= compressed.length) {
    return []
  }
  const { data, lastBlockStart } = await inflateBlocks(
    compressed,
    startBlock,
    blockOfVO(run.pastEnd),
  )
  // A virtual offset is (block_start << 16) | offset_within_block. `data`
  // begins at the first uncompressed byte of `startBlock`, so run.start's
  // in-block offset is where the group framing actually resumes. Skipping
  // ahead is necessary because groups are not aligned to BGZF block
  // boundaries — starting at byte 0 of a block whose run lands mid-block
  // parses the tail of an unrelated group and either fails or frames junk.
  const startInBlock = Number(run.start & 0xffffn)
  const stopIndex = lastBlockStart + Number(run.pastEnd & 0xffffn)
  const stream = data.subarray(Math.min(startInBlock, data.length))
  const messages = []
  for (const msg of iterateMessages(stream)) {
    // Groups that begin at or after past-end belong to the next run.
    if (startInBlock + msg.groupStart >= stopIndex) {
      break
    }
    messages.push(msg)
  }
  return messages
}

// Inflate the BGZF blocks from `startBlock` through `endBlock` inclusive and
// report where the last block's uncompressed data begins, so a virtual
// offset landing in it can be turned into an index into the result.
async function inflateBlocks(
  compressed: Uint8Array,
  startBlock: number,
  endBlock: number,
): Promise<{ data: Uint8Array; lastBlockStart: number }> {
  const parts: Uint8Array[] = []
  let total = 0
  let lastBlockStart = 0
  let blockStart = startBlock
  while (blockStart < compressed.length) {
    const blockSize = maxBgzfBlock(compressed, blockStart)
    const inflated = await decompress(
      compressed.subarray(
        blockStart,
        Math.min(compressed.length, blockStart + blockSize),
      ),
    )
    const reachedEnd = blockStart + blockSize > endBlock
    if (reachedEnd) {
      lastBlockStart = total
    }
    parts.push(inflated)
    total += inflated.length
    if (reachedEnd) {
      break
    }
    blockStart += blockSize
  }
  const data = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    data.set(part, at)
    at += part.length
  }
  return { data, lastBlockStart }
}

function alignmentNodeIds(aln: VgRead): bigint[] {
  const ids: bigint[] = []
  for (const m of aln.path?.mapping ?? []) {
    const id = m.position?.node_id
    if (id !== undefined) {
      ids.push(BigInt(id))
    }
  }
  return ids
}

export function alignmentOverlaps(
  aln: VgRead,
  minNode: bigint,
  maxNode: bigint,
): boolean {
  return alignmentNodeIds(aln).some(id => id >= minNode && id <= maxNode)
}

export function alignmentVisitsAny(
  aln: VgRead,
  nodeIds: ReadonlySet<bigint>,
): boolean {
  return alignmentNodeIds(aln).some(id => nodeIds.has(id))
}

// BGZF virtual offset is (compressedBlockStart << 16) | uncompressedOffset.
function blockOfVO(vo: bigint): number {
  return Number(vo >> 16n)
}

// Inspect the BGZF block header to find this block's compressed size. Each
// BGZF block has a gzip header with an "extra" field carrying a 'BC'
// subfield whose 2-byte little-endian value is BSIZE = blockSize - 1.
function maxBgzfBlock(buf: Uint8Array, blockStart: number): number {
  if (blockStart + 18 > buf.length) {
    return buf.length - blockStart
  }
  const xlen = buf[blockStart + 10]! | (buf[blockStart + 11]! << 8)
  let i = blockStart + 12
  const end = blockStart + 12 + xlen
  while (i + 4 <= end) {
    const si1 = buf[i]!
    const si2 = buf[i + 1]!
    const slen = buf[i + 2]! | (buf[i + 3]! << 8)
    if (si1 === 0x42 && si2 === 0x43 && slen === 2) {
      const bsize = buf[i + 4]! | (buf[i + 5]! << 8)
      return bsize + 1
    }
    i += 4 + slen
  }
  return buf.length - blockStart
}
