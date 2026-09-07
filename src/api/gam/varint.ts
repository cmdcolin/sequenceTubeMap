// Protobuf varint reader. Reads from a Uint8Array starting at `offset`.
// Returns the decoded value plus the new offset.
//
// Varints encode each 7 bits in a byte, low bits first, with the MSB set
// while more bytes follow. We cap at 10 bytes (max for 64-bit values).

export interface VarintResult {
  value: number
  offset: number
}

export interface BigVarintResult {
  value: bigint
  offset: number
}

const UINT64_MASK = (1n << 64n) - 1n

// Only safe for values known to fit in 32 unsigned bits: field tags, lengths
// and counts. Negative `intXX` fields are sign-extended to 64 bits on the
// wire and need readSignedVarint32 instead.
export function readVarint32(buf: Uint8Array, offset: number): VarintResult {
  let value = 0
  let shift = 0
  let i = offset
  while (i < buf.length) {
    const byte = buf[i]!
    i++
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      return { value: value >>> 0, offset: i }
    }
    shift += 7
    if (shift >= 35) {
      throw new Error('varint32 too long')
    }
  }
  throw new Error('unexpected end of buffer while reading varint32')
}

export function readVarint64(buf: Uint8Array, offset: number): BigVarintResult {
  let value = 0n
  let shift = 0n
  let i = offset
  while (i < buf.length) {
    const byte = buf[i]!
    i++
    value |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      return { value: value & UINT64_MASK, offset: i }
    }
    shift += 7n
    if (shift >= 70n) {
      throw new Error('varint64 too long')
    }
  }
  throw new Error('unexpected end of buffer while reading varint64')
}

// Protobuf sign-extends a negative `int32` to 64 bits, so e.g. score = -1 is
// ten bytes on the wire. Read the full 64 bits and narrow back to int32.
export function readSignedVarint32(
  buf: Uint8Array,
  offset: number,
): VarintResult {
  const { value, offset: next } = readVarint64(buf, offset)
  return { value: Number(BigInt.asIntN(32, value)), offset: next }
}
