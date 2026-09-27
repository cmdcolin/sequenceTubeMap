// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { formatTrackDisplayName } from './trackName.ts'

describe('formatTrackDisplayName', () => {
  it('shows a PanSN name as is', () => {
    expect(formatTrackDisplayName('CHM13#0#chrM')).toBe('CHM13#0#chrM')
  })

  it('shows a gbz-base reference path by its contig', () => {
    expect(formatTrackDisplayName('_gbwt_ref#0#17')).toBe('17')
  })

  it('names an anonymized cluster and its weight', () => {
    expect(formatTrackDisplayName('unknown#3#17')).toBe('17 haplotype #3')
    expect(formatTrackDisplayName('unknown#3#17', 5)).toBe('17 haplotype #3 ×5')
  })

  it('names a vg thread', () => {
    expect(formatTrackDisplayName('thread_2')).toBe('thread 2')
  })

  it('has something to say for a nameless track', () => {
    expect(formatTrackDisplayName(undefined)).toBe('(unnamed)')
  })
})
