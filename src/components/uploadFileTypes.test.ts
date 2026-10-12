// @vitest-environment node

import { describe, it, expect } from 'vitest'
import '../config-client.js'
import { config } from '../config-global.mjs'
import {
  INDEX_EXTS,
  SERVER_ACCEPT,
  detectType,
  isIndexSibling,
  isLocallyAccepted,
  pairHaplotypeIndexes,
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
  })

  // GAF has no upload route: the server can neither sort nor tabix-index one,
  // so it is only usable as an already-indexed file mounted in the data
  // directory. Claiming it here sent the file and then failed.
  it('does not offer GAF as an uploadable read format', () => {
    expect(detectType('example.gaf')).toBeNull()
    expect(detectType('example.gaf.gz')).toBeNull()
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
  it('accepts what the in-browser reader opens', () => {
    expect(isLocallyAccepted('graph.gbz.db')).toBe(true)
    expect(isLocallyAccepted('graph.db')).toBe(true)
    expect(isLocallyAccepted('graph.haplotype-index.db')).toBe(true)
    expect(isLocallyAccepted('reads.gam')).toBe(true)
    expect(isLocallyAccepted('reads.gam.gai')).toBe(true)
    expect(isLocallyAccepted('hprc.GRCh38.walks.bed.gz')).toBe(true)
    expect(isLocallyAccepted('hprc.GRCh38.walks.bed.gz.tbi')).toBe(true)
  })

  it('rejects formats the in-browser reader cannot read', () => {
    expect(isLocallyAccepted('graph.xg')).toBe(false)
    expect(isLocallyAccepted('graph.vg')).toBe(false)
    expect(isLocallyAccepted('reads.gaf')).toBe(false)
    expect(isLocallyAccepted('h.gbwt')).toBe(false)
  })
})

describe('gfa-to-tabix walk files', () => {
  it('stage the walk file as a graph track and its index beside it', () => {
    expect(detectType('hprc.GRCh38.walks.bed.gz')).toBe('graph')
    expect(isIndexSibling('hprc.GRCh38.walks.bed.gz')).toBe(false)
    for (const name of ['hprc.GRCh38.walks.bed.gz.tbi']) {
      expect(detectType(name)).not.toBeNull()
      expect(isIndexSibling(name)).toBe(true)
    }
  })

  it('are not offered to a server, which cannot read them', () => {
    expect(SERVER_ACCEPT.split(',')).not.toContain('.walks.bed.gz')
  })
})

describe('pairHaplotypeIndexes', () => {
  it('stages a companion haplotype index beside its graph', () => {
    expect(detectType('graph.haplotype-index.db')).toBe('graph')
    expect(isIndexSibling('graph.haplotype-index.db')).toBe(true)
  })

  it('pairs each graph with the index of its name', () => {
    expect(
      pairHaplotypeIndexes(
        ['b.gbz.db', 'a.gbz.db', 'c.db'],
        ['a.haplotype-index.db', 'b.haplotype-index.db'],
      ),
    ).toEqual([1, 0, undefined])
  })

  it('pairs a lone index with a lone graph whatever their names', () => {
    expect(
      pairHaplotypeIndexes(['g.gbz.db'], ['other.haplotype-index.db']),
    ).toEqual([0])
    expect(
      pairHaplotypeIndexes(
        ['g.gbz.db', 'h.gbz.db'],
        ['other.haplotype-index.db'],
      ),
    ).toEqual([undefined, undefined])
  })
})

describe('config.fileTypeToExtensions', () => {
  const serverAllowed = Object.values(
    config.fileTypeToExtensions as Record<string, string>,
  ).flatMap(list => list.split(','))

  it('allows every non-index extension the upload panel offers to a server', () => {
    const offered = SERVER_ACCEPT.split(',').filter(
      ext => !INDEX_EXTS.includes(ext),
    )
    expect(offered.filter(ext => !serverAllowed.includes(ext))).toEqual([])
  })
})
