import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { readGbzDbPaths } from './gbzDbPaths.ts'

// Smoke-test the SQL query + sql.js wiring against the checked-in Toxo
// fixture so a future bump of the WASM build (or sql.js, or the schema)
// can't silently break path-surfacing.
describe('readGbzDbPaths', () => {
  it('returns the reference contigs from the Toxo .gbz.db', async () => {
    const bytes = await readFile(
      'exampleData/Toxo/Toxo_SB_numeric.gbz.db',
    )
    const blob = new Blob([new Uint8Array(bytes)])
    const paths = await readGbzDbPaths(blob)

    const names = paths.map(p => p.name)
    // Spot-check a few of the expected contigs. The Toxo source XG has
    // Circ1..Circ11 plus a Circ2_Circ3 composite — that's 12 paths.
    expect(names).toContain('Circ1')
    expect(names).toContain('Circ11')
    expect(names).toContain('Circ2_Circ3')
    expect(paths).toHaveLength(12)

    // We strip the `_gbwt_ref#…` sample prefix, so no surfaced name
    // should retain GBWT path-name internals.
    expect(names.every(n => !n.includes('#') || !n.startsWith('_'))).toBe(true)

    // Lengths come from MAX(ReferenceIndex.path_offset). They're
    // approximate, but should be > 0 for a non-trivial path.
    const circ1 = paths.find(p => p.name === 'Circ1')
    expect(circ1).toBeDefined()
    expect(circ1!.length).toBeGreaterThan(0)
  }, 20000) // first call lazy-loads sql.js wasm
})
