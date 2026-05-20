// Minimal protobuf wire-format reader for the vg Alignment subset we need.
//
// We hand-code field decoders so we don't pull in a runtime protobuf library.
// Only the wire types actually used by vg.proto's Alignment / Path / Mapping /
// Position / Edit messages are implemented (VARINT, I64, LEN, I32).

import { readVarint32, readVarint64 } from './varint.ts'

export const WIRE_VARINT = 0
export const WIRE_I64 = 1
export const WIRE_LEN = 2
export const WIRE_I32 = 5

export interface FieldHeader {
  fieldNumber: number
  wireType: number
  offset: number
}

export function readFieldHeader(
  buf: Uint8Array,
  offset: number,
): FieldHeader {
  const { value: tag, offset: next } = readVarint32(buf, offset)
  return {
    fieldNumber: tag >>> 3,
    wireType: tag & 0x7,
    offset: next,
  }
}

// Skip the value for a field we don't care about; returns the new offset.
export function skipField(
  buf: Uint8Array,
  offset: number,
  wireType: number,
): number {
  if (wireType === WIRE_VARINT) {
    return readVarint64(buf, offset).offset
  }
  if (wireType === WIRE_I64) {
    return offset + 8
  }
  if (wireType === WIRE_LEN) {
    const { value: len, offset: next } = readVarint32(buf, offset)
    return next + len
  }
  if (wireType === WIRE_I32) {
    return offset + 4
  }
  throw new Error(`unsupported wire type ${wireType}`)
}

export function readDouble(buf: Uint8Array, offset: number): VarintLike {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8)
  return { value: view.getFloat64(0, true), offset: offset + 8 }
}

interface VarintLike {
  value: number
  offset: number
}

export function readLengthDelimited(
  buf: Uint8Array,
  offset: number,
): { bytes: Uint8Array; offset: number } {
  const { value: len, offset: next } = readVarint32(buf, offset)
  return {
    bytes: buf.subarray(next, next + len),
    offset: next + len,
  }
}

export function readString(buf: Uint8Array, offset: number): {
  value: string
  offset: number
} {
  const { bytes, offset: next } = readLengthDelimited(buf, offset)
  return { value: decoder.decode(bytes), offset: next }
}

const decoder = new TextDecoder()
