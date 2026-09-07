import { describe, expect, it } from 'vitest'
import { iterateMessages } from './messageStream.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function sized(bytes: Uint8Array): number[] {
  return [bytes.length, ...bytes]
}

function group(items: Uint8Array[]): number[] {
  return [items.length, ...items.flatMap(sized)]
}

function stream(...parts: number[][]): Uint8Array {
  return Uint8Array.from(parts.flat())
}

const text = (s: string) => encoder.encode(s)

function collect(data: Uint8Array) {
  return [...iterateMessages(data)].map(m => ({
    tag: m.tag,
    text: decoder.decode(m.bytes),
    groupStart: m.groupStart,
  }))
}

describe('iterateMessages', () => {
  it('yields tagged messages and reports the group they came from', () => {
    const first = group([text('GAM'), text('one'), text('two')])
    const second = group([text('GAM'), text('three')])
    expect(collect(stream(first, second))).toEqual([
      { tag: 'GAM', text: 'one', groupStart: 0 },
      { tag: 'GAM', text: 'two', groupStart: 0 },
      { tag: 'GAM', text: 'three', groupStart: first.length },
    ])
  })

  it('treats a printable but unknown first item as a message', () => {
    expect(collect(stream(group([text('NOPE'), text('one')])))).toEqual([
      { tag: '', text: 'NOPE', groupStart: 0 },
      { tag: '', text: 'one', groupStart: 0 },
    ])
  })

  it('treats a zero-length first item as an untagged message', () => {
    expect(collect(stream(group([text(''), text('one')])))).toEqual([
      { tag: '', text: '', groupStart: 0 },
      { tag: '', text: 'one', groupStart: 0 },
    ])
  })

  it('skips a group that declares no items', () => {
    const empty = [0]
    expect(collect(stream(empty, group([text('GAM'), text('one')])))).toEqual([
      { tag: 'GAM', text: 'one', groupStart: 1 },
    ])
  })

  // A region read hands over a slice that can end mid-group, because the
  // trailing bytes live in a block we deliberately never fetched.
  it('stops at the last complete message when the tail is truncated', () => {
    const complete = group([text('GAM'), text('one')])
    const truncated = stream(complete, group([text('GAM'), text('two')]))
    for (let cut = 1; cut < truncated.length - complete.length; cut++) {
      const messages = collect(truncated.subarray(0, complete.length + cut))
      expect(messages.map(m => m.text)).toEqual(['one'])
    }
  })

  it('reuses the last sniffed tag for a following untagged group', () => {
    const tagged = group([text('GAM'), text('one')])
    const untagged = group([text('two')])
    expect(collect(stream(tagged, untagged))).toEqual([
      { tag: 'GAM', text: 'one', groupStart: 0 },
      { tag: 'GAM', text: 'two', groupStart: tagged.length },
    ])
  })

  it('yields nothing for an empty stream', () => {
    expect(collect(new Uint8Array())).toEqual([])
  })
})
