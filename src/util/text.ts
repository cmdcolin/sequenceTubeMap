// Middle-ellipsis truncation. Filenames often carry pipeline provenance in the
// prefix (sample/run ids) and format info in the suffix (.sorted.gam), so
// head+tail beats CSS text-overflow which would only keep the prefix. Full
// label is preserved in the `title` attribute for hover.
export function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
