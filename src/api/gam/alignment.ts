// Decoder for the vg Alignment message and its dependencies.
//
// The output shape matches `vg view -aj` JSON of the same Alignment, since
// that is what the rest of the app already consumes (see VgRead in
// util/tubemap.ts). In particular int64 fields are emitted as strings and
// `quality` is base64-encoded, matching the server.

import {
  readDouble,
  readFieldHeader,
  readLengthDelimited,
  readString,
  skipField,
  WIRE_LEN,
  WIRE_VARINT,
  WIRE_I64,
} from './protoDecode.ts'
import { readVarint32, readVarint64 } from './varint.ts'
import type { VgEdit, VgMapping, VgPath, VgPosition, VgRead } from '../../util/tubemap.ts'

interface DecodedAlignment extends VgRead {
  sequence?: string
  quality?: string
  identity?: number
  fragment_next?: DecodedAlignment
  fragment_prev?: DecodedAlignment
}

export function decodeAlignment(buf: Uint8Array): DecodedAlignment {
  let offset = 0
  const out: DecodedAlignment = {}
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      out.sequence = r.value
      offset = r.offset
    } else if (header.fieldNumber === 2 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      out.path = decodePath(bytes)
      offset = next
    } else if (header.fieldNumber === 3 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      out.name = r.value
      offset = r.offset
    } else if (header.fieldNumber === 4 && header.wireType === WIRE_LEN) {
      const r = readLengthDelimited(buf, offset)
      out.quality = base64Encode(r.bytes)
      offset = r.offset
    } else if (header.fieldNumber === 5 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      out.mapping_quality = r.value
      offset = r.offset
    } else if (header.fieldNumber === 6 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      out.score = r.value
      offset = r.offset
    } else if (header.fieldNumber === 9 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      out.sample_name = r.value
      offset = r.offset
    } else if (header.fieldNumber === 10 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      out.read_group = r.value
      offset = r.offset
    } else if (header.fieldNumber === 11 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      out.fragment_prev = decodeAlignment(bytes)
      offset = next
    } else if (header.fieldNumber === 12 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      out.fragment_next = decodeAlignment(bytes)
      offset = next
    } else if (header.fieldNumber === 15 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      out.is_secondary = r.value !== 0
      offset = r.offset
    } else if (header.fieldNumber === 16 && header.wireType === WIRE_I64) {
      const r = readDouble(buf, offset)
      out.identity = r.value
      offset = r.offset
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  return out
}

function decodePath(buf: Uint8Array): VgPath {
  let offset = 0
  const mapping: VgMapping[] = []
  let name: string | undefined
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      name = r.value
      offset = r.offset
    } else if (header.fieldNumber === 2 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      mapping.push(decodeMapping(bytes))
      offset = next
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  return name === undefined ? { mapping } : { name, mapping }
}

function decodeMapping(buf: Uint8Array): VgMapping {
  let offset = 0
  const edit: VgEdit[] = []
  let position: VgPosition | undefined
  let rank: string | undefined
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      position = decodePosition(bytes)
      offset = next
    } else if (header.fieldNumber === 2 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      edit.push(decodeEdit(bytes))
      offset = next
    } else if (header.fieldNumber === 5 && header.wireType === WIRE_VARINT) {
      const r = readVarint64(buf, offset)
      rank = r.value.toString()
      offset = r.offset
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  // Match vg's JSON: omit `rank` when absent; emit it as a string when present.
  const result: VgMapping & { rank?: string } = { edit }
  if (position) {
    result.position = position
  }
  if (rank !== undefined) {
    result.rank = rank
  }
  return result
}

function decodePosition(buf: Uint8Array): VgPosition {
  let offset = 0
  let nodeId: string | undefined
  let isReverse: boolean | undefined
  let posOffset: string | undefined
  let name: string | undefined
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_VARINT) {
      const r = readVarint64(buf, offset)
      nodeId = r.value.toString()
      offset = r.offset
    } else if (header.fieldNumber === 2 && header.wireType === WIRE_VARINT) {
      const r = readVarint64(buf, offset)
      posOffset = r.value.toString()
      offset = r.offset
    } else if (header.fieldNumber === 4 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      isReverse = r.value !== 0
      offset = r.offset
    } else if (header.fieldNumber === 5 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      name = r.value
      offset = r.offset
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  // vg JSON omits zero-valued fields, so we do too.
  const result: VgPosition = { node_id: nodeId ?? '0' }
  if (isReverse) {
    result.is_reverse = true
  }
  if (posOffset !== undefined && posOffset !== '0') {
    result.offset = posOffset
  }
  if (name !== undefined) {
    ;(result as VgPosition & { name?: string }).name = name
  }
  return result
}

function decodeEdit(buf: Uint8Array): VgEdit {
  let offset = 0
  let fromLength: number | undefined
  let toLength: number | undefined
  let sequence: string | undefined
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 1 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      fromLength = r.value
      offset = r.offset
    } else if (header.fieldNumber === 2 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      toLength = r.value
      offset = r.offset
    } else if (header.fieldNumber === 3 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      sequence = r.value
      offset = r.offset
    } else {
      offset = skipField(buf, offset, header.wireType)
    }
  }
  const out: VgEdit = {}
  if (fromLength) {
    out.from_length = fromLength
  }
  if (toLength) {
    out.to_length = toLength
  }
  if (sequence !== undefined) {
    out.sequence = sequence
  }
  return out
}

// Browser-safe base64 encoding for the quality bytes field.
function base64Encode(bytes: Uint8Array): string {
  // btoa needs a binary string. For typical quality lengths (read length,
  // ~100s of bytes) this is fine.
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    s += String.fromCharCode(...slice)
  }
  return btoa(s)
}
