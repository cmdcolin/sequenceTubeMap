import type { FileType } from '../Types.ts'

export const GRAPH_EXTS = ['.xg', '.vg', '.hg', '.pg', '.gbz', '.gbz.db', '.db']
export const READ_EXTS = ['.gam', '.gaf', '.gaf.gz']
export const HAPLOTYPE_EXTS = ['.gbwt']
// .gai is the sibling index for a sorted .gam, .tbi for a tabixed .gaf.gz.
// In server mode the server creates these itself so they're silently skipped;
// in local/WASM mode they're stored alongside the .gam for sibling lookup.
export const INDEX_EXTS = ['.gai', '.tbi']
// Local/WASM mode only supports .gbz.db/.db graphs and .gam reads (+.gai index).
export const LOCAL_EXTS = ['.gbz.db', '.db', '.gam', '.gai']

export const LOCAL_ACCEPT = LOCAL_EXTS.join(',')
export const SERVER_ACCEPT = [
  ...GRAPH_EXTS,
  ...READ_EXTS,
  ...HAPLOTYPE_EXTS,
  ...INDEX_EXTS,
].join(',')

export function isIndexSibling(name: string): boolean {
  const lower = name.toLowerCase()
  return INDEX_EXTS.some(e => lower.endsWith(e))
}

export function detectType(name: string): FileType | null {
  const lower = name.toLowerCase()
  if (INDEX_EXTS.some(e => lower.endsWith(e))) {
    return 'read'
  }
  if (GRAPH_EXTS.some(e => lower.endsWith(e))) {
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
