// Decoder for the vg Alignment message and its dependencies.
//
// The output shape matches `vg view -aj` JSON of the same Alignment, since
// that is what the rest of the app already consumes (see VgRead in
// util/tubemap.ts). In particular int64 fields are emitted as strings.
//
// Fields the tube map never looks at — `sequence`, `quality`, `identity` and
// the `fragment_prev`/`fragment_next` mates — are skipped rather than decoded,
// so a high-coverage region doesn't pay to build strings that then cross the
// Comlink boundary unread.

import {
  readFieldHeader,
  readLengthDelimited,
  readString,
  skipField,
  WIRE_LEN,
  WIRE_VARINT,
} from './protoDecode.ts'
import { readSignedVarint32, readVarint32, readVarint64 } from './varint.ts'
import type { VgEdit, VgMapping, VgPath, VgPosition, VgRead } from '../../util/tubemap.ts'

export function decodeAlignment(buf: Uint8Array): VgRead {
  let offset = 0
  const out: VgRead = {}
  while (offset < buf.length) {
    const header = readFieldHeader(buf, offset)
    offset = header.offset
    if (header.fieldNumber === 2 && header.wireType === WIRE_LEN) {
      const { bytes, offset: next } = readLengthDelimited(buf, offset)
      out.path = decodePath(bytes)
      offset = next
    } else if (header.fieldNumber === 3 && header.wireType === WIRE_LEN) {
      const r = readString(buf, offset)
      out.name = r.value
      offset = r.offset
    } else if (header.fieldNumber === 5 && header.wireType === WIRE_VARINT) {
      const r = readSignedVarint32(buf, offset)
      out.mapping_quality = r.value
      offset = r.offset
    } else if (header.fieldNumber === 6 && header.wireType === WIRE_VARINT) {
      const r = readSignedVarint32(buf, offset)
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
    } else if (header.fieldNumber === 15 && header.wireType === WIRE_VARINT) {
      const r = readVarint32(buf, offset)
      out.is_secondary = r.value !== 0
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
      const r = readSignedVarint32(buf, offset)
      fromLength = r.value
      offset = r.offset
    } else if (header.fieldNumber === 2 && header.wireType === WIRE_VARINT) {
      const r = readSignedVarint32(buf, offset)
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
