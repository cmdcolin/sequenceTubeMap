import type { PathQuery } from '@gmod/gbz-base'

// The Region field takes `contig`, `sample#contig` or
// `sample#haplotype#contig`. A bare contig is the generic `_gbwt_ref` path.
//
// gbz-base ships `parsePathName`, but it only accepts the full PanSN triple or
// a bare contig; the tube map's Region field has always taken the two-part
// `sample#contig` form for a haplotype-0 reference path too.
export function pathQueryFor(contig: string): PathQuery {
  const parts = contig.split('#')
  const [sample, second] = parts
  if (parts.length === 1 || sample === undefined || second === undefined) {
    return { contig }
  }
  if (parts.length === 2) {
    return { sample, contig: second }
  }
  const haplotype = Number(second)
  return Number.isInteger(haplotype)
    ? { sample, haplotype, contig: parts.slice(2).join('#') }
    : { sample, contig: parts.slice(1).join('#') }
}
