import { foldThresholdFrom, memberNames } from './foldVariants.ts'

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

describe('memberNames', () => {
  const tube = {
    id: 1,
    name: 'w0',
    label: '7 haplotypes',
    sequence: [],
    freq: 7,
    sourceTrackID: 0,
    variation: {
      walks: 7,
      foldedAwayBp: { min: 0, median: 0, max: 0 },
      insertedBp: { min: 0, median: 0, max: 0 },
      skippedBp: { min: 0, median: 0, max: 0 },
    },
  }

  it('names every walk of a few', () => {
    expect(memberNames({ ...tube, names: ['a', 'b'] })).toBe('a, b')
  })

  it('names the first of many and counts the rest', () => {
    expect(
      memberNames({ ...tube, names: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    ).toBe('a, b, c, d, e and 2 more')
  })
})
