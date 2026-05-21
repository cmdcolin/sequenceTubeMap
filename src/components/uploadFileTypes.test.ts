import { describe, it, expect } from 'vitest'
import {
  detectType,
  isIndexSibling,
  isLocallyAccepted,
} from './uploadFileTypes.ts'

describe('detectType', () => {
  it('classifies graph formats', () => {
    expect(detectType('example.xg')).toBe('graph')
    expect(detectType('example.vg')).toBe('graph')
    expect(detectType('example.gbz')).toBe('graph')
    expect(detectType('example.gbz.db')).toBe('graph')
  })

  it('classifies read formats', () => {
    expect(detectType('example.gam')).toBe('read')
    expect(detectType('example.gaf')).toBe('read')
    expect(detectType('example.gaf.gz')).toBe('read')
  })

  it('classifies haplotype formats', () => {
    expect(detectType('h.gbwt')).toBe('haplotype')
  })

  it('classifies sibling index files as read (they pair with a .gam)', () => {
    expect(detectType('example.gam.gai')).toBe('read')
    expect(detectType('example.gai')).toBe('read')
    expect(detectType('example.gaf.gz.tbi')).toBe('read')
  })

  it('returns null for unknown extensions', () => {
    expect(detectType('readme.txt')).toBeNull()
    expect(detectType('weird.fa')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(detectType('EXAMPLE.XG')).toBe('graph')
    expect(detectType('Reads.GAM.GAI')).toBe('read')
  })
})

describe('isIndexSibling', () => {
  it('recognizes .gai and .tbi suffixes', () => {
    expect(isIndexSibling('reads.gam.gai')).toBe(true)
    expect(isIndexSibling('reads.gai')).toBe(true)
    expect(isIndexSibling('reads.gaf.gz.tbi')).toBe(true)
  })

  it('returns false for non-index files', () => {
    expect(isIndexSibling('reads.gam')).toBe(false)
    expect(isIndexSibling('graph.xg')).toBe(false)
  })
})

describe('isLocallyAccepted', () => {
  it('accepts the WASM-supported set', () => {
    expect(isLocallyAccepted('graph.gbz.db')).toBe(true)
    expect(isLocallyAccepted('graph.db')).toBe(true)
    expect(isLocallyAccepted('reads.gam')).toBe(true)
    expect(isLocallyAccepted('reads.gam.gai')).toBe(true)
  })

  it('rejects formats the WASM API cannot read', () => {
    expect(isLocallyAccepted('graph.xg')).toBe(false)
    expect(isLocallyAccepted('graph.vg')).toBe(false)
    expect(isLocallyAccepted('reads.gaf')).toBe(false)
    expect(isLocallyAccepted('h.gbwt')).toBe(false)
  })
})
