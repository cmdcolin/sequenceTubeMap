import { describe, expect, it } from 'vitest'
import { UploadRegistry, isSiblingIndex } from './fileRegistry.ts'

function blobOfText(s: string): Blob {
  return new Blob([s])
}

describe('isSiblingIndex', () => {
  it('flags .gai / .tbi / .csi (case-insensitive)', () => {
    expect(isSiblingIndex('x.sorted.gam.gai')).toBe(true)
    expect(isSiblingIndex('x.sorted.GAM.GAI')).toBe(true)
    expect(isSiblingIndex('x.gaf.gz.tbi')).toBe(true)
    expect(isSiblingIndex('x.csi')).toBe(true)
  })

  it('does not flag the matching data file or unrelated extensions', () => {
    expect(isSiblingIndex('x.sorted.gam')).toBe(false)
    expect(isSiblingIndex('x.gaf.gz')).toBe(false)
    expect(isSiblingIndex('x.gbz')).toBe(false)
    expect(isSiblingIndex('')).toBe(false)
  })
})

describe('UploadRegistry', () => {
  it('assigns sequential string ids', () => {
    const reg = new UploadRegistry()
    const a = reg.add({ name: 'a.gam', blob: blobOfText('a') })
    const b = reg.add({ name: 'b.gam', blob: blobOfText('b') })
    expect(a.id).toBe('0')
    expect(b.id).toBe('1')
  })

  it('flags sibling-index uploads', () => {
    const reg = new UploadRegistry()
    const gam = reg.add({ name: 'x.sorted.gam', blob: blobOfText('gam') })
    const gai = reg.add({
      name: 'x.sorted.gam.gai',
      blob: blobOfText('gai'),
    })
    expect(gam.isSibling).toBe(false)
    expect(gai.isSibling).toBe(true)
  })

  it('pairs a .gam with its .gai sibling regardless of upload order', async () => {
    const reg = new UploadRegistry()
    const gam = reg.add({ name: 'x.sorted.gam', blob: blobOfText('gam') })
    const gai = reg.add({
      name: 'x.sorted.gam.gai',
      blob: blobOfText('gai'),
    })
    const sib = reg.sibling(gam.id, '.gai')
    expect(sib).not.toBeNull()
    expect(await blobText(sib!)).toBe('gai')
    // And the index isn't its own data file: looking up *its* sibling fails.
    expect(reg.sibling(gai.id, '.gai')).toBeNull()
  })

  it('returns null when no sibling was uploaded', async () => {
    const reg = new UploadRegistry()
    const gam = reg.add({ name: 'lonely.sorted.gam', blob: blobOfText('g') })
    expect(reg.sibling(gam.id, '.gai')).toBeNull()
  })

  it('returns null when the upload had no original filename', () => {
    const reg = new UploadRegistry()
    const r = reg.add({ name: '', blob: blobOfText('?') })
    expect(reg.sibling(r.id, '.gai')).toBeNull()
  })

  it('finds an upload by id', () => {
    const reg = new UploadRegistry()
    const r = reg.add({ name: 'x.gam', blob: blobOfText('hi') })
    expect(reg.get(r.id)).not.toBeNull()
    expect(reg.get('999')).toBeNull()
    expect(reg.get('not-a-number')).toBeNull()
  })

  it('works with .tbi siblings for .gaf.gz', () => {
    const reg = new UploadRegistry()
    const gaf = reg.add({ name: 'x.gaf.gz', blob: blobOfText('g') })
    reg.add({ name: 'x.gaf.gz.tbi', blob: blobOfText('t') })
    expect(reg.sibling(gaf.id, '.tbi')).not.toBeNull()
  })
})

async function blobText(b: Blob): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()))
}
