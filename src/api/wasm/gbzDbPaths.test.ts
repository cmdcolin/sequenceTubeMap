import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { readGbzDbPaths } from './gbzDbPaths.ts'

// Smoke-test the SQL query + sql.js wiring against a checked-in fixture so
// a future bump of the WASM build (or sql.js, or the schema) can't silently
// break path-surfacing.
describe('readGbzDbPaths', () => {
  it('returns the reference paths from x.gbz.db', async () => {
    const bytes = await readFile('exampleData/x.gbz.db')
    const blob = new Blob([new Uint8Array(bytes)])
    const paths = await readGbzDbPaths(blob)

    const names = paths.map(p => p.name)
    // x.gbz has one reference path "x" (sample _gbwt_ref, stripped).
    expect(names).toContain('x')
    expect(paths).toHaveLength(1)

    // We strip the `_gbwt_ref#…` sample prefix, so no surfaced name
    // should retain GBWT path-name internals.
    expect(names.every(n => !n.includes('#') || !n.startsWith('_'))).toBe(true)

    // Lengths come from MAX(ReferenceIndex.path_offset).
    const xPath = paths.find(p => p.name === 'x')
    expect(xPath).toBeDefined()
    expect(xPath!.length).toBeGreaterThan(0)
  }, 20000) // first call lazy-loads sql.js wasm
})
