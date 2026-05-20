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
import { loadGamIndex, runsForNodeRange, type GamIndex } from './gamIndex.ts'
import type { VgRead } from '../../util/tubemap.ts'

const GAM_TAG = 'GAM'

export async function readGam(blob: Blob): Promise<VgRead[]> {
  const compressed = new Uint8Array(await blob.arrayBuffer())
  const decompressed = await decompress(compressed)
  return collectAlignments(decompressed)
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
  // Track byte ranges we've already scanned so coalesced-but-still-adjacent
  // runs don't double-decode the same group. Keyed by compressed-block start.
  const scannedFrom = new Set<number>()
  const out: VgRead[] = []
  for (const run of runs) {
    const startBlock = blockOfVO(run.start)
    if (scannedFrom.has(startBlock)) {
      continue
    }
    scannedFrom.add(startBlock)
    const endBlock = blockOfVO(run.pastEnd)
    // Read up to the start of the block *after* the past-end block, so we
    // get the entirety of the past-end block when its data offset is > 0.
    const stop = run.pastEnd === 0n
      ? startBlock
      : Math.min(compressed.length, endBlock + maxBgzfBlock(compressed, endBlock))
    if (startBlock >= compressed.length) {
      continue
    }
    const slice = compressed.subarray(startBlock, stop)
    const decompressed = await decompress(slice)
    // A virtual offset is (block_start << 16) | offset_within_block. The
    // decompressed slice begins at byte 0 of `startBlock`, so the in-block
    // offset of run.start is the index into `decompressed` at which the
    // group framing actually resumes. Skipping ahead is necessary because
    // groups are not aligned to BGZF block boundaries — if we start at
    // byte 0 of a block whose run lands mid-block, we end up parsing
    // the tail of an unrelated group and either fail or yield junk
    // messages that won't decode as Alignments.
    const startInBlock = Number(run.start & 0xFFFFn)
    const stream = startInBlock > 0 && startInBlock < decompressed.length
      ? decompressed.subarray(startInBlock)
      : decompressed
    for (const msg of iterateMessages(stream)) {
      if (msg.tag !== GAM_TAG && msg.tag !== '') {
        continue
      }
      const aln = decodeAlignment(msg.bytes)
      if (alignmentOverlaps(aln, minNode, maxNode)) {
        out.push(aln)
      }
    }
  }
  return out
}

function collectAlignments(buf: Uint8Array): VgRead[] {
  const out: VgRead[] = []
  for (const msg of iterateMessages(buf)) {
    // Older vg releases wrote .gam files without the explicit "GAM" tag, so
    // we accept empty-tag messages too — the caller already knows the file
    // is a GAM by extension.
    if (msg.tag === GAM_TAG || msg.tag === '') {
      out.push(decodeAlignment(msg.bytes))
    }
  }
  return out
}

function alignmentOverlaps(
  aln: VgRead,
  minNode: bigint,
  maxNode: bigint,
): boolean {
  const mappings = aln.path?.mapping
  if (!mappings || mappings.length === 0) {
    return false
  }
  for (const m of mappings) {
    const idStr = m.position?.node_id
    if (idStr === undefined) {
      continue
    }
    const id = typeof idStr === 'bigint' ? idStr : BigInt(idStr)
    if (id >= minNode && id <= maxNode) {
      return true
    }
  }
  return false
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

export type { GamIndex }
