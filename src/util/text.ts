// Middle-ellipsis truncation. Filenames often carry pipeline provenance in the
// prefix (sample/run ids) and format info in the suffix (.sorted.gam), so
// head+tail beats CSS text-overflow which would only keep the prefix. Full
// label is preserved in the `title` attribute for hover.
export function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) {
    return s
  }
  if (max <= 0) {
    return ''
  }
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  // slice(-0) is slice(0), i.e. the whole string, so a zero-length tail has to
  // drop out of the template entirely.
  const tail = keep - head
  return tail === 0
    ? `${s.slice(0, head)}…`
    : `${s.slice(0, head)}…${s.slice(-tail)}`
}
