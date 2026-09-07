/** Merges b into a, skipping elements already present in a. */
export function mergeUnique<T>(a: T[], b: T[]): T[] {
  return [...a, ...b.filter(x => !a.includes(x))]
}

// Subsample to at most `limit` items by taking every k-th one (k chosen so the
// output count lands at `limit`). Preserves the original ordering, which for
// indexed gam queries is roughly node-position-sorted, so the subsample stays
// spatially representative rather than biasing to one end of the region (which
// `slice(0, limit)` would do).
export function subsampleReads<T>(reads: T[], limit: number): T[] {
  if (reads.length <= limit) {
    return reads
  }
  const stride = reads.length / limit
  const out: T[] = []
  for (
    let i = 0;
    out.length < limit && Math.floor(i) < reads.length;
    i += stride
  ) {
    const r = reads[Math.floor(i)]
    if (r !== undefined) {
      out.push(r)
    }
  }
  return out
}
