import { crc32, deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readAlignmentsForRuns } from './gam.ts'
import type { IndexRun } from './gamIndex.ts'

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function varint(value: bigint): Uint8Array {
  const out: number[] = []
  let v = value
  do {
    const byte = Number(v & 0x7fn)
    v >>= 7n
    out.push(v > 0n ? byte | 0x80 : byte)
  } while (v > 0n)
  return Uint8Array.from(out)
}

function lenField(fieldNumber: number, bytes: Uint8Array): Uint8Array {
  return concat([
    varint(BigInt((fieldNumber << 3) | 2)),
    varint(BigInt(bytes.length)),
    bytes,
  ])
}

function varintField(fieldNumber: number, value: bigint): Uint8Array {
  return concat([varint(BigInt(fieldNumber << 3)), varint(value)])
}

// Alignment { path { mapping { position { node_id } } }, name, score }, with
// score sign-extended to 64 bits the way protobuf encodes a negative int32.
function alignment(name: string, nodeId: number, score: number): Uint8Array {
  const position = varintField(1, BigInt(nodeId))
  const mapping = lenField(1, position)
  const path = lenField(2, mapping)
  return concat([
    lenField(2, path),
    lenField(3, new TextEncoder().encode(name)),
    varintField(6, BigInt.asUintN(64, BigInt(score))),
  ])
}

// One libvgio group: a count, then the "GAM" tag, then each message, all
// length-prefixed.
function taggedGroup(messages: Uint8Array[]): Uint8Array {
  const items = [new TextEncoder().encode('GAM'), ...messages]
  return concat([
    varint(BigInt(items.length)),
    ...items.map(m => concat([varint(BigInt(m.length)), m])),
  ])
}

function bgzfBlock(payload: Uint8Array): Uint8Array {
  const deflated = new Uint8Array(deflateRawSync(payload))
  const totalSize = 18 + deflated.length + 8
  const block = new Uint8Array(totalSize)
  block.set([0x1f, 0x8b, 0x08, 0x04, 0, 0, 0, 0, 0, 0xff, 0x06, 0x00], 0)
  block.set([0x42, 0x43, 0x02, 0x00], 12)
  const view = new DataView(block.buffer)
  view.setUint16(16, totalSize - 1, true)
  block.set(deflated, 18)
  view.setUint32(18 + deflated.length, crc32(payload), true)
  view.setUint32(18 + deflated.length + 4, payload.length, true)
  return block
}

const BGZF_EOF = Uint8Array.from([
  0x1f, 0x8b, 0x08, 0x04, 0, 0, 0, 0, 0, 0xff, 0x06, 0x00, 0x42, 0x43, 0x02,
  0x00, 0x1b, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

// Two groups inside a single BGZF block, so both index runs share a start
// block and both land at non-zero in-block offsets — the shape that made the
// reader drop one run and over-read the other.
function twoGroupGam() {
  const first = taggedGroup([
    alignment('read-a', 5, 39),
    alignment('read-b', 6, -1),
  ])
  const second = taggedGroup([alignment('read-c', 7, -100)])
  const payload = concat([first, second])
  return {
    compressed: concat([bgzfBlock(payload), BGZF_EOF]),
    firstRun: { start: 0n, pastEnd: BigInt(first.length) } satisfies IndexRun,
    secondRun: {
      start: BigInt(first.length),
      pastEnd: BigInt(payload.length),
    } satisfies IndexRun,
  }
}

const names = (reads: { name?: string }[]) => reads.map(r => r.name).sort()

describe('readAlignmentsForRuns', () => {
  it('reads every run when two runs share one BGZF block', async () => {
    const { compressed, firstRun, secondRun } = twoGroupGam()
    const reads = await readAlignmentsForRuns(
      compressed,
      [firstRun, secondRun],
      1n,
      100n,
    )
    expect(names(reads)).toEqual(['read-a', 'read-b', 'read-c'])
  })

  it('stops decoding at the past-end offset of the run', async () => {
    const { compressed, firstRun, secondRun } = twoGroupGam()
    expect(names(await readAlignmentsForRuns(compressed, [firstRun], 1n, 100n)))
      .toEqual(['read-a', 'read-b'])
    expect(names(await readAlignmentsForRuns(compressed, [secondRun], 1n, 100n)))
      .toEqual(['read-c'])
  })

  it('keeps only alignments inside the queried node range', async () => {
    const { compressed, firstRun, secondRun } = twoGroupGam()
    const reads = await readAlignmentsForRuns(
      compressed,
      [firstRun, secondRun],
      6n,
      6n,
    )
    expect(names(reads)).toEqual(['read-b'])
  })

  // A negative int32 is ten bytes on the wire; the 32-bit varint reader threw
  // on it, which rejected the whole file rather than one field.
  it('decodes negative alignment scores', async () => {
    const { compressed, firstRun, secondRun } = twoGroupGam()
    const reads = await readAlignmentsForRuns(
      compressed,
      [firstRun, secondRun],
      1n,
      100n,
    )
    const byName = new Map(reads.map(r => [r.name, r.score]))
    expect(byName.get('read-a')).toBe(39)
    expect(byName.get('read-b')).toBe(-1)
    expect(byName.get('read-c')).toBe(-100)
  })
})
