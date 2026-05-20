import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readGam, readGamRegion } from './gam.ts'
import { loadGamIndex, runsForNodeRange } from './gamIndex.ts'

function loadAsBlob(path: string): Blob {
  return new Blob([readFileSync(path)])
}

// Reference Alignments produced by `vg view -aj` on the same file. The fields
// we assert on are name + path mapping ids/edits, which are stable and the
// minimum the tubemap renderer consumes from a read.
describe('readGam', () => {
  it('decodes every Alignment in a tiny GAM', async () => {
    const blob = loadAsBlob('exampleData/cactus0_10.gam')
    const reads = await readGam(blob)
    expect(reads).toHaveLength(10)
    for (const r of reads) {
      expect(r.name).toBeTruthy()
      expect(r.path?.mapping.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("matches `vg view -aj` on the first Alignment's structure", async () => {
    const blob = loadAsBlob('exampleData/cactus0_10.gam')
    const reads = await readGam(blob)
    const r = reads[0]!
    // Spot check against a known field set from vg view -aj output.
    expect(r.name).toBe('ERR194148.45196594/1')
    expect(r.score).toBe(39)
    const firstMapping = r.path?.mapping[0]
    expect(firstMapping?.position?.node_id).toBe('443')
    expect(firstMapping?.position?.is_reverse).toBe(true)
    expect(firstMapping?.position?.offset).toBe('85')
    expect(firstMapping?.edit[0]?.from_length).toBe(15)
    expect(firstMapping?.edit[0]?.to_length).toBe(15)
  })

  it('decodes a larger GAM without errors', async () => {
    const blob = loadAsBlob('exampleData/cactus-NA12879.gam')
    const reads = await readGam(blob)
    expect(reads.length).toBeGreaterThan(50000)
  })
})

describe('GAM index', () => {
  it('parses cactus0_10.sorted.gam.gai', async () => {
    const blob = loadAsBlob('exampleData/cactus0_10.sorted.gam.gai')
    const idx = await loadGamIndex(blob)
    expect(idx.bins.size).toBeGreaterThan(0)
    expect(idx.windows.size).toBeGreaterThan(0)
  })

  it('returns runs for a node range that covers the data', async () => {
    const blob = loadAsBlob('exampleData/cactus0_10.sorted.gam.gai')
    const idx = await loadGamIndex(blob)
    const runs = runsForNodeRange(idx, 1n, 10000n)
    expect(runs.length).toBeGreaterThan(0)
  })

  it('returns no runs for a node range far past the data', async () => {
    const blob = loadAsBlob('exampleData/cactus0_10.sorted.gam.gai')
    const idx = await loadGamIndex(blob)
    const runs = runsForNodeRange(idx, 10n ** 12n, 10n ** 12n + 1n)
    expect(runs).toEqual([])
  })
})

describe('readGamRegion', () => {
  it('returns reads that overlap the queried node range', async () => {
    const gam = loadAsBlob('exampleData/cactus0_10.sorted.gam')
    const gai = loadAsBlob('exampleData/cactus0_10.sorted.gam.gai')
    const reads = await readGamRegion(gam, gai, 1n, 10000n)
    expect(reads.length).toBeGreaterThan(0)
    // Every returned read must touch the range.
    for (const r of reads) {
      const hit = r.path?.mapping.some(m => {
        const id = m.position?.node_id
        if (id === undefined) return false
        const n = typeof id === 'bigint' ? id : BigInt(id)
        return n >= 1n && n <= 10000n
      })
      expect(hit).toBe(true)
    }
  })

  it('returns nothing for a range outside the indexed nodes', async () => {
    const gam = loadAsBlob('exampleData/cactus0_10.sorted.gam')
    const gai = loadAsBlob('exampleData/cactus0_10.sorted.gam.gai')
    const reads = await readGamRegion(gam, gai, 10n ** 12n, 10n ** 12n + 1n)
    expect(reads).toHaveLength(0)
  })

  it('agrees with a full-file scan + filter on the same range', async () => {
    const gam = loadAsBlob('exampleData/cactus0_10.sorted.gam')
    const gai = loadAsBlob('exampleData/cactus0_10.sorted.gam.gai')
    const all = await readGam(gam)
    const filtered = all.filter(r =>
      r.path?.mapping.some(m => {
        const id = m.position?.node_id
        if (id === undefined) return false
        const n = typeof id === 'bigint' ? id : BigInt(id)
        return n >= 1n && n <= 10000n
      }),
    )
    const indexed = await readGamRegion(gam, gai, 1n, 10000n)
    // Same set of read names — order may differ.
    const names = (xs: { name?: string }[]) =>
      xs.map(x => x.name ?? '').sort()
    expect(names(indexed)).toEqual(names(filtered))
  })
})
