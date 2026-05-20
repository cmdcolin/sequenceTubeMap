// Reader for the libvgio "type-tagged grouped messages" container format
// (see libvgio/src/message_iterator.cpp). The on-disk layout, once BGZF
// decompression has been done, is a sequence of *groups*:
//
//   group_count (varint64)        -- N
//   tag_size    (varint32)        -- L
//   tag_bytes   (L bytes)         -- e.g. "GAM"; can also be the first
//                                    message if L isn't a known tag.
//   message_size (varint32)       -- per message_idx in [1, N)
//   message_bytes (size bytes)    -- protobuf-encoded payload
//
// Known tags for vg-format files are a small set; we hard-code the "GAM" tag
// since that's what we care about.

import { readVarint32, readVarint64 } from './varint.ts'

const KNOWN_TAGS = new Set([
  'GAM',
  'MGAM',
  'VG',
  'SNARL',
  'PILEUP',
  'LOCUS',
  'TRANS',
])

const textDecoder = new TextDecoder()

export interface TaggedMessage {
  tag: string
  bytes: Uint8Array
}

// Iterate every (tag, bytes) pair in a decompressed message stream.
//
// `data` is a contiguous decompressed slice from one or more BGZF blocks.
// When the caller is reading a region (a coalesced range from the .gam.gai),
// the slice may end mid-group — the trailing bytes belong to a different
// bin whose payload spills into a block we deliberately didn't fetch. In
// that case we silently terminate after the last complete message; any
// alignments we needed are already inside the requested range.
export function* iterateMessages(data: Uint8Array): Generator<TaggedMessage> {
  let offset = 0
  let currentTag = ''
  while (offset < data.length) {
    const group = tryReadVarint64(data, offset)
    if (group === null) return
    if (group.value < 1n) {
      offset = group.offset
      continue
    }
    offset = group.offset
    const groupCount = Number(group.value)

    const first = tryReadSizedBytes(data, offset)
    if (first === null) return
    offset = first.offset
    const firstAsString = decodeIfPrintable(first.bytes)
    if (firstAsString !== undefined && KNOWN_TAGS.has(firstAsString)) {
      currentTag = firstAsString
      // The tag counts as one of the group's items.
      for (let i = 1; i < groupCount; i++) {
        const msg = tryReadSizedBytes(data, offset)
        if (msg === null) return
        offset = msg.offset
        yield { tag: currentTag, bytes: msg.bytes }
      }
    } else {
      // The first item is actually a message under tag "" (or under the
      // previously-sniffed tag — libvgio docs are clear that absent-tag groups
      // adopt the previous tag for downstream consumers; we propagate it).
      const tag = currentTag
      yield { tag, bytes: first.bytes }
      for (let i = 1; i < groupCount; i++) {
        const msg = tryReadSizedBytes(data, offset)
        if (msg === null) return
        offset = msg.offset
        yield { tag, bytes: msg.bytes }
      }
    }
  }
}

// Return null when the buffer is exhausted mid-value (so callers can treat
// truncation as end-of-stream). Other errors still throw.
function tryReadVarint64(
  buf: Uint8Array,
  offset: number,
): { value: bigint; offset: number } | null {
  try {
    return readVarint64(buf, offset)
  } catch (e) {
    if (e instanceof Error && e.message.includes('end of buffer')) return null
    throw e
  }
}

function tryReadSizedBytes(
  buf: Uint8Array,
  offset: number,
): { bytes: Uint8Array; offset: number } | null {
  let sz
  try {
    sz = readVarint32(buf, offset)
  } catch (e) {
    if (e instanceof Error && e.message.includes('end of buffer')) return null
    throw e
  }
  // Size header parsed, but the payload itself runs past the slice. Same
  // story: a different bin's data spills past where we stopped reading.
  if (sz.offset + sz.value > buf.length) return null
  return {
    bytes: buf.subarray(sz.offset, sz.offset + sz.value),
    offset: sz.offset + sz.value,
  }
}

// Decode `bytes` as UTF-8 only if they look like a printable short tag. This
// is a cheap sniff to distinguish a tag string from a binary protobuf payload
// that happens to start with a printable byte.
function decodeIfPrintable(bytes: Uint8Array): string | undefined {
  if (bytes.length === 0 || bytes.length > 16) {
    return undefined
  }
  for (const b of bytes) {
    if (b < 0x20 || b > 0x7e) {
      return undefined
    }
  }
  return textDecoder.decode(bytes)
}
