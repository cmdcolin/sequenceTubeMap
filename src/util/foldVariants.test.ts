import type { Branch } from '@jbrowse/graph-fold'
import {
  branchLabelLines,
  foldedTubes,
  foldThresholdFrom,
  isDrawnBranch,
  tubeText,
} from './foldVariants.ts'

const deletion: Branch = {
  kind: 'deletion',
  description: 'deletion',
  length: 45516,
  insertedBp: 0,
  deletedBp: 45516,
  refStart: 100,
  refEnd: 45616,
  haplotypes: 306,
  nodes: [],
  from: 'a',
  to: 'c',
}

describe('foldThresholdFrom', () => {
  it('keeps a threshold the View menu offers, as a number or as a link spells it', () => {
    expect(foldThresholdFrom(1000)).toBe(1000)
    expect(foldThresholdFrom('50')).toBe(50)
    expect(foldThresholdFrom('off')).toBe(0)
    expect(foldThresholdFrom(0)).toBe(0)
  })

  it('drops anything else, so a stale preference falls back to the default', () => {
    expect(foldThresholdFrom(75)).toBeUndefined()
    expect(foldThresholdFrom('many')).toBeUndefined()
    expect(foldThresholdFrom('')).toBeUndefined()
    expect(foldThresholdFrom(undefined)).toBeUndefined()
    expect(foldThresholdFrom(null)).toBeUndefined()
  })
})

describe('branchLabelLines', () => {
  it('gives the kind, the size and the carriers out of every haplotype', () => {
    expect(branchLabelLines(deletion, 464)).toEqual([
      'deletion 45.5 kb, 306 of 464',
    ])
  })

  it('gives both sizes of a replacement', () => {
    expect(
      branchLabelLines(
        {
          ...deletion,
          kind: 'other',
          description: 'replacement',
          length: 15683,
          insertedBp: 15683,
          deletedBp: 6341,
          haplotypes: 1,
        },
        464,
      ),
    ).toEqual(['replacement 15.7 kb for 6.3 kb, 1 of 464'])
  })

  it('says a clustered branch is a cluster, of how many sizes over what range', () => {
    expect(
      branchLabelLines(
        {
          ...deletion,
          kind: 'insertion',
          description: 'insertion',
          length: 9264,
          insertedBp: 9264,
          deletedBp: 0,
          haplotypes: 129,
          nodes: ['ins'],
          cluster: {
            members: 56,
            minLength: 8866,
            maxLength: 9527,
            haplotypes: 129,
          },
        },
        464,
      ),
    ).toEqual([
      'insertion 9.3 kb, 129 of 464',
      'cluster of 56 sizes, 8.9 kb to 9.5 kb',
    ])
  })
})

describe('isDrawnBranch', () => {
  it('takes a jump or a box, and not a walk that only starts late', () => {
    expect(isDrawnBranch(deletion)).toBe(true)
    expect(isDrawnBranch({ ...deletion, from: undefined, nodes: ['n'] })).toBe(
      true,
    )
    expect(isDrawnBranch({ ...deletion, from: undefined, to: undefined })).toBe(
      false,
    )
  })
})

describe('foldedTubes', () => {
  const walk = {
    name: 'w',
    originalBp: 0,
    foldedBp: 0,
    clippedBp: 0,
    steps: [],
  }

  it('sums the haplotypes of a tube, counts its walks and ranges what each hides', () => {
    const tubes = foldedTubes([
      { ...walk, track: 0, freq: 1, insertedBp: 0, skippedBp: 0 },
      { ...walk, track: 1, freq: 3, insertedBp: 2, skippedBp: 0 },
      { ...walk, track: 1, freq: 26, insertedBp: 15, skippedBp: 584 },
    ])

    expect(tubes.get(0)).toEqual({
      haplotypes: 1,
      walks: 1,
      minHiddenBp: 0,
      maxHiddenBp: 0,
    })
    expect(tubes.get(1)).toEqual({
      haplotypes: 29,
      walks: 2,
      minHiddenBp: 2,
      maxHiddenBp: 599,
    })
    expect(tubeText(tubes.get(1)!)).toBe(
      '29 haplotypes on 2 distinct walks, 2 bp to 599 bp folded away in each',
    )
  })
})
