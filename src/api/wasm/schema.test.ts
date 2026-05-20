import { describe, it, expect } from 'vitest'
import { convertSchema } from './schema.ts'

// gbz-base emits subpath path names as `<base>[<start>-<end>]`. tubemap.ts
// only draws the bp ruler when at least one track has indexOfFirstBase set,
// so a regression here silently kills the ruler in the WASM build.
describe('convertSchema subpath normalization', () => {
  const nodes = [{ id: 1, sequence: 'AC' }]

  it('strips the subpath suffix and lifts start into indexOfFirstBase', () => {
    const out = convertSchema({
      nodes,
      edges: [],
      paths: [
        {
          name: '_gbwt_ref#0#x[100-200]',
          path: [{ id: 1, is_reverse: false }],
        },
      ],
    })
    expect(out.path[0]!.name).toBe('_gbwt_ref#0#x')
    expect(out.path[0]!.indexOfFirstBase).toBe('100')
  })

  it('leaves names without a subpath suffix alone', () => {
    const out = convertSchema({
      nodes,
      edges: [],
      paths: [{ name: 'plain_name', path: [{ id: 1, is_reverse: false }] }],
    })
    expect(out.path[0]!.name).toBe('plain_name')
    expect(out.path[0]!.indexOfFirstBase).toBeUndefined()
  })
})
