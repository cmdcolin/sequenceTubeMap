// A PanSN path name: sample#haplotype#contig, sometimes with further
// #-separated fields such as a fragment offset after the contig.
// https://github.com/pangenome/PanSN-spec
export interface PanSNName {
  sample: string
  haplotype: number
  contig: string
}

// gbz-base names a generic reference `_gbwt_ref#0#contig` and a haplotype the
// GBWT kept no metadata for `unknown#N#contig`; neither names a sample.
const NOT_SAMPLES = new Set(['_gbwt_ref', 'unknown'])

// The sample, haplotype and contig of a PanSN name, or undefined for any other
// name: fewer than three fields, an empty sample or contig, a haplotype that
// isn't a whole number, or a placeholder sample.
export function parsePanSN(name: string | undefined): PanSNName | undefined {
  const [sample, haplotype, contig] = name?.split('#') ?? []
  if (
    sample === undefined ||
    sample === '' ||
    NOT_SAMPLES.has(sample) ||
    haplotype === undefined ||
    !/^\d+$/.test(haplotype) ||
    contig === undefined ||
    contig === ''
  ) {
    return undefined
  }
  return { sample, haplotype: Number(haplotype), contig }
}
