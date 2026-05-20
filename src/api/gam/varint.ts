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
      return { value, offset: i }
    }
    shift += 7n
    if (shift >= 70n) {
      throw new Error('varint64 too long')
    }
  }
  throw new Error('unexpected end of buffer while reading varint64')
}

// Zig-zag decoding for sintXX wire types.
export function zigzagDecode32(value: number): number {
  return (value >>> 1) ^ -(value & 1)
}
