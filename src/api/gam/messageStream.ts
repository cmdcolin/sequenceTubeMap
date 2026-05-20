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
// The caller is responsible for BGZF decompression. `data` must be the full
// uncompressed byte stream; group boundaries are not aligned with BGZF blocks
// so reading partial blocks is not supported here.
export function* iterateMessages(data: Uint8Array): Generator<TaggedMessage> {
  let offset = 0
  let currentTag = ''
  while (offset < data.length) {
    const group = readVarint64(data, offset)
    if (group.value < 1n) {
      // Empty / sentinel group; advance and keep scanning.
      offset = group.offset
      continue
    }
    offset = group.offset
    const groupCount = Number(group.value)

    // First item in a group: may be a tag string or, if not a known tag, the
    // first message of an implicit "" (empty-tag) group.
    const first = readSizedBytes(data, offset)
    offset = first.offset
    const firstAsString = decodeIfPrintable(first.bytes)
    if (firstAsString !== undefined && KNOWN_TAGS.has(firstAsString)) {
      currentTag = firstAsString
      // The tag counts as one of the group's items.
      for (let i = 1; i < groupCount; i++) {
        const msg = readSizedBytes(data, offset)
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
        const msg = readSizedBytes(data, offset)
        offset = msg.offset
        yield { tag, bytes: msg.bytes }
      }
    }
  }
}

function readSizedBytes(
  buf: Uint8Array,
  offset: number,
): { bytes: Uint8Array; offset: number } {
  const sz = readVarint32(buf, offset)
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
