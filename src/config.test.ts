// @vitest-environment node

import { readFileSync } from 'fs'
import config from './config.json' with { type: 'json' }

const HPRC_F8_WALKS =
  'https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38-f8.GRCh38.walks.gz'

const hostedWalkFiles = config.DATA_SOURCES.flatMap(source =>
  source.tracks.map(track => track.trackFile),
).filter(file => file?.startsWith('https://') && file.endsWith('.walks.gz'))

describe('the hosted HPRC walk file', () => {
  it('is the format 8 file in the example data sources', () => {
    expect(hostedWalkFiles).toEqual([HPRC_F8_WALKS])
  })

  it('is the format 8 file in docs/data.md', () => {
    const doc = readFileSync('docs/data.md', 'utf-8')
    expect(doc).toContain(HPRC_F8_WALKS)
    expect(doc).not.toMatch(/hprc-v2\.1-mc-(grch38|chm13)\.\w+\.walks\.gz/)
  })
})
