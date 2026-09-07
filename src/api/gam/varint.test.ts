import { describe, expect, it } from 'vitest'
import { readSignedVarint32, readVarint32, readVarint64 } from './varint.ts'

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

describe('readVarint32', () => {
  it('decodes single and multi byte values', () => {
    expect(readVarint32(bytes(0x00), 0)).toEqual({ value: 0, offset: 1 })
    expect(readVarint32(bytes(0x7f), 0)).toEqual({ value: 127, offset: 1 })
    expect(readVarint32(bytes(0xe2, 0x1c), 0)).toEqual({
      value: 3682,
      offset: 2,
    })
  })

  it('reads from an offset and rejects a truncated value', () => {
    expect(readVarint32(bytes(0xff, 0xe2, 0x1c), 1).value).toBe(3682)
    expect(() => readVarint32(bytes(0x80), 0)).toThrow(/end of buffer/)
  })
})

describe('readVarint64', () => {
  it('decodes the maximum uint64', () => {
    const max = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)
    expect(readVarint64(max, 0)).toEqual({
      value: 2n ** 64n - 1n,
      offset: 10,
    })
  })

  it('rejects an eleven byte varint', () => {
    const tooLong = bytes(
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01,
    )
    expect(() => readVarint64(tooLong, 0)).toThrow(/too long/)
  })
})

// vg.proto declares Alignment.score and Alignment.mapping_quality as int32, and
// protobuf sign-extends a negative int32 to ten bytes on the wire. Reading
// those with a 32-bit-capped reader throws and rejects the whole GAM.
describe('readSignedVarint32', () => {
  it('decodes negative int32 values from their ten byte encoding', () => {
    expect(
      readSignedVarint32(
        bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01),
        0,
      ),
    ).toEqual({ value: -1, offset: 10 })
    expect(
      readSignedVarint32(
        bytes(0x9c, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01),
        0,
      ).value,
    ).toBe(-100)
    expect(
      readSignedVarint32(
        bytes(0x80, 0x80, 0x80, 0x80, 0xf8, 0xff, 0xff, 0xff, 0xff, 0x01),
        0,
      ).value,
    ).toBe(-2147483648)
  })

  it('leaves non-negative values alone', () => {
    expect(readSignedVarint32(bytes(0x27), 0)).toEqual({
      value: 39,
      offset: 1,
    })
    expect(
      readSignedVarint32(bytes(0xff, 0xff, 0xff, 0xff, 0x07), 0).value,
    ).toBe(2147483647)
  })
})
