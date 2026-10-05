// @vitest-environment node

import { parsePanSN } from './panSN.ts'

describe('parsePanSN', () => {
  it('reads sample, haplotype and contig from the names the bundled graphs carry', () => {
    expect(parsePanSN('HG01243#2#MT')).toEqual({
      sample: 'HG01243',
      haplotype: 2,
      contig: 'MT',
    })
    expect(parsePanSN('GRCh38#0#chrM')).toEqual({
      sample: 'GRCh38',
      haplotype: 0,
      contig: 'chrM',
    })
    expect(parsePanSN('HG00438#1#JAHBCB010000040.1')).toEqual({
      sample: 'HG00438',
      haplotype: 1,
      contig: 'JAHBCB010000040.1',
    })
  })

  it('takes the contig as the third field when more follow', () => {
    expect(parsePanSN('HG00438#2#MT#0')).toEqual({
      sample: 'HG00438',
      haplotype: 2,
      contig: 'MT',
    })
  })

  it('names no sample for placeholder samples', () => {
    expect(parsePanSN('_gbwt_ref#0#chr1')).toBeUndefined()
    expect(parsePanSN('unknown#3#chrM')).toBeUndefined()
  })

  it('names no sample for names that are not PanSN', () => {
    for (const name of [
      undefined,
      '',
      'Track A',
      'thread_12',
      'chr17',
      'GRCh38#chrM',
      '#1#chrM',
      'HG01243#two#MT',
      'HG01243#-1#MT',
      'HG01243#2#',
      'HG01243##MT',
    ]) {
      expect(parsePanSN(name)).toBeUndefined()
    }
  })
})
