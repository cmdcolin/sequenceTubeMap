import type { FileType } from '../Types.ts'

export const GRAPH_EXTS = ['.xg', '.vg', '.hg', '.pg', '.gbz', '.gbz.db', '.db']
// Graph files only the in-browser reader opens, and the files that go with a
// graph there rather than being tracks: a companion haplotype index, and a
// walk file's node and link files and the .tbi of each
const LOCAL_GRAPH_EXTS = ['.walks.bed.gz', '.nodes.bed.gz', '.links.bed.gz']
// Upload only. A .gaf/.gaf.gz can be a read track when it is mounted in the
// server's data directory already sorted and tabix-indexed, but the upload
// route has no way to produce that index, so offering it here only produced a
// server-side rejection after the file had been sent.
export const READ_EXTS = ['.gam']
export const HAPLOTYPE_EXTS = ['.gbwt']
// .gai is the sibling index for a sorted .gam, .tbi for a tabixed .gaf.gz.
// In server mode the server creates these itself so they're silently skipped;
// in local mode they're stored alongside the .gam for sibling lookup.
export const INDEX_EXTS = ['.gai', '.tbi']
const LOCAL_COMPANION_EXTS = [
  '.haplotype-index.db',
  '.nodes.bed.gz',
  '.links.bed.gz',
]
export const LOCAL_EXTS = [
  '.gbz.db',
  '.db',
  '.walks.bed.gz',
  '.nodes.bed.gz',
  '.links.bed.gz',
  '.tbi',
  '.gam',
  '.gai',
]

export const LOCAL_ACCEPT = LOCAL_EXTS.join(',')
export const SERVER_ACCEPT = [
  ...GRAPH_EXTS,
  ...READ_EXTS,
  ...HAPLOTYPE_EXTS,
  ...INDEX_EXTS,
].join(',')

export function isIndexSibling(name: string): boolean {
  const lower = name.toLowerCase()
  return [...INDEX_EXTS, ...LOCAL_COMPANION_EXTS].some(e => lower.endsWith(e))
}

export function detectType(name: string): FileType | null {
  const lower = name.toLowerCase()
  if (INDEX_EXTS.some(e => lower.endsWith(e))) {
    return 'read'
  }
  if ([...GRAPH_EXTS, ...LOCAL_GRAPH_EXTS].some(e => lower.endsWith(e))) {
    return 'graph'
  }
  if (READ_EXTS.some(e => lower.endsWith(e))) {
    return 'read'
  }
  if (HAPLOTYPE_EXTS.some(e => lower.endsWith(e))) {
    return 'haplotype'
  }
  return null
}

export function isLocallyAccepted(name: string): boolean {
  const lower = name.toLowerCase()
  return LOCAL_EXTS.some(e => lower.endsWith(e))
}

// Which companion haplotype index, by position in `indexNames`, each uploaded
// `.gbz.db` graph takes: `graph.haplotype-index.db` goes with `graph.gbz.db`,
// and a lone index with a lone graph whatever their names.
export function pairHaplotypeIndexes(
  graphNames: string[],
  indexNames: string[],
): (number | undefined)[] {
  const stem = (name: string) =>
    name.replace(/\.haplotype-index\.db$|(\.gbz)?\.db$/i, '').toLowerCase()
  return graphNames.map(graph => {
    const byName = indexNames.findIndex(index => stem(index) === stem(graph))
    if (byName >= 0) {
      return byName
    }
    return graphNames.length === 1 && indexNames.length === 1 ? 0 : undefined
  })
}
