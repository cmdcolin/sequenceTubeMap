import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BlobFile } from 'generic-filehandle2'
import type { GenericFilehandle } from 'generic-filehandle2'
import { readGam, readGamRegion } from './gam.ts'
import { loadGamIndex, runsForNodeRange } from './gamIndex.ts'
import type { VgRead } from '../../util/tubemap.ts'

function loadAsBlob(path: string): Blob {
  return new Blob([readFileSync(path)])
}

// A handle that tallies what it was asked for, so a test can assert the
// region reader seeks rather than downloads.
class CountingFile implements GenericFilehandle {
  bytesRead = 0
  reads = 0
  inFlight = 0
  maxInFlight = 0
  constructor(private readonly inner: GenericFilehandle) {}
  async read(length: number, position: number) {
    this.reads++
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    try {
      const bytes = await this.inner.read(length, position)
      this.bytesRead += bytes.length
      return bytes
    } finally {
      this.inFlight--
    }
  }
  readFile(): never {
    throw new Error('readFile would defeat the point of a range read')
  }
  stat() {
    return this.inner.stat()
  }
  close() {
    return this.inner.close()
  }
}

function countingSource(path: string): CountingFile {
  return new CountingFile(new BlobFile(loadAsBlob(path)))
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
    const reads = await readGamRegion(new BlobFile(gam), gai, 1n, 10000n)
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
    const reads = await readGamRegion(
      new BlobFile(gam),
      gai,
      10n ** 12n,
      10n ** 12n + 1n,
    )
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
    const indexed = await readGamRegion(new BlobFile(gam), gai, 1n, 10000n)
    // Same set of read names — order may differ.
    const names = (xs: { name?: string }[]) =>
      xs.map(x => x.name ?? '').sort()
    expect(names(indexed)).toEqual(names(filtered))
  })

  // Regression: BRCA1's gai has runs with non-zero in-block offsets (e.g.
  // run.start = (block << 16) | 33306). The reader has to skip those bytes
  // before iterating message groups, or it lands mid-group and either reads
  // a truncated varint or "successfully" frames junk that fails to decode.
  // It also has to tolerate the tail of the slice landing inside another
  // bin's group that spans into a block we deliberately didn't fetch.
  //
  // The "exact same names as a full-scan filter" check is the real teeth: if
  // the truncation tolerance ever starts silently dropping reads from inside
  // our run (vs. only dropping unrelated tail bytes), this assertion fails.
  it('matches full-scan filter on a BRCA1 narrow range', async () => {
    const gam = loadAsBlob('exampleData/internal/NA12878-BRCA1.sorted.gam')
    const gai = loadAsBlob('exampleData/internal/NA12878-BRCA1.sorted.gam.gai')
    const all = await readGam(gam)
    const inRange = (r: VgRead) =>
      r.path?.mapping.some(m => {
        const id = m.position?.node_id
        if (id === undefined) return false
        const n = BigInt(id)
        return n >= 1n && n <= 24n
      }) ?? false
    const filtered = all.filter(inRange)
    const indexed = await readGamRegion(new BlobFile(gam), gai, 1n, 24n)
    expect(indexed.length).toBeGreaterThan(0)
    // Not just the same set but the same order. Runs are read concurrently,
    // so this is what catches a result assembled in completion order rather
    // than file order — the ordering subsampleReads depends on.
    const names = (xs: { name?: string }[]) => xs.map(x => x.name ?? '')
    expect(names(indexed)).toEqual(names(filtered))
  })

  // Several runs in flight at once, so a query spanning them costs about one
  // round trip rather than one per run.
  it('fetches several runs concurrently', async () => {
    const source = countingSource(
      'exampleData/internal/NA12878-BRCA1.sorted.gam',
    )
    const gai = loadAsBlob('exampleData/internal/NA12878-BRCA1.sorted.gam.gai')
    await readGamRegion(source, gai, 1n, 24n)
    expect(source.reads).toBeGreaterThan(1)
    expect(source.maxInFlight).toBeGreaterThan(1)
  })

  // The reason the index exists: a narrow query has to touch a small part of
  // the file. NA12878-BRCA1.sorted.gam is ~2.9 MB across 285 BGZF blocks, and
  // its index puts nodes 1-24 in a handful of runs. Reading it whole "worked"
  // for years and made a URL-hosted GAM cost a full download per region.
  it('reads a fraction of the file for a narrow range', async () => {
    const source = countingSource('exampleData/internal/NA12878-BRCA1.sorted.gam')
    const gai = loadAsBlob('exampleData/internal/NA12878-BRCA1.sorted.gam.gai')
    const { size } = await source.stat()
    const indexed = await readGamRegion(source, gai, 1n, 24n)
    expect(indexed.length).toBeGreaterThan(0)
    expect(source.bytesRead).toBeLessThan(size / 2)
    // One request per run, not one per block.
    expect(source.reads).toBeLessThan(10)
  })

  // The exact node set the caller wants, rather than the id range the index
  // can express. Punching the nodes one read visits out of an otherwise full
  // range has to drop exactly that read and leave the rest alone.
  it('filters to an exact node set when given one', async () => {
    const gam = loadAsBlob('exampleData/internal/NA12878-BRCA1.sorted.gam')
    const gai = loadAsBlob('exampleData/internal/NA12878-BRCA1.sorted.gam.gai')
    const names = (xs: { name?: string }[]) => xs.map(x => x.name ?? '').sort()
    const nodeIdsOf = (r: VgRead) =>
      (r.path?.mapping ?? []).map(m => BigInt(m.position!.node_id))

    const whole = new Set<bigint>()
    for (let id = 1n; id <= 24n; id++) {
      whole.add(id)
    }
    const ranged = await readGamRegion(new BlobFile(gam), gai, 1n, 24n)
    // A set covering the whole range is the same answer as no set at all.
    expect(names(await readGamRegion(new BlobFile(gam), gai, 1n, 24n, whole)))
      .toEqual(names(ranged))

    const victim = ranged[0]!
    const holed = new Set(whole)
    for (const id of nodeIdsOf(victim)) {
      holed.delete(id)
    }
    const punched = await readGamRegion(
      new BlobFile(gam),
      gai,
      1n,
      24n,
      holed,
    )
    expect(punched.map(r => r.name)).not.toContain(victim.name)
    // Everything still in is there because it visits a node the set kept, and
    // everything dropped visited only nodes the set removed.
    for (const r of punched) {
      expect(nodeIdsOf(r).some(id => holed.has(id))).toBe(true)
    }
    const keptNames = new Set(punched.map(r => r.name))
    for (const r of ranged.filter(r => !keptNames.has(r.name))) {
      expect(nodeIdsOf(r).some(id => holed.has(id))).toBe(false)
    }
  })
})
