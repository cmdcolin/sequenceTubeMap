// Format a raw vg/gbz path name for display in legends and hover tooltips.
//
// gbz-base emits three flavors of path names:
//   * Real PanSN, e.g. `CHM13#0#chrM`           — show as-is
//   * Anonymized cluster: `unknown#N#contig`    — vg gbwt strips real sample
//     names from non-reference haplotypes; render as "contig haplotype #N"
//     and append the cluster weight when known (with --distinct, identical
//     traversals are collapsed and gbz-base reports their count as freq).
//   * vg-internal threads: `thread_N`           — render as "thread N"
//
// `freq` is the haplotype-cluster weight from --distinct (or vg's per-path
// frequency). Surfaced as "×N" so the user can see relative abundance.
export function formatTrackDisplayName(
  name: string | undefined,
  freq?: number,
): string {
  if (name === undefined) return '(unnamed)'
  const anon = /^unknown#(\d+)#(.+)$/.exec(name)
  if (anon) {
    const base = `${anon[2]} haplotype #${anon[1]}`
    return freq !== undefined && freq > 1 ? `${base} ×${freq}` : base
  }
  const thread = /^thread_(\d+)$/.exec(name)
  if (thread) {
    const base = `thread ${thread[1]}`
    return freq !== undefined && freq > 1 ? `${base} ×${freq}` : base
  }
  return freq !== undefined && freq > 1 ? `${name} ×${freq}` : name
}
