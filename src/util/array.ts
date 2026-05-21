/** Merges b into a, skipping elements already present in a. */
export function mergeUnique<T>(a: T[], b: T[]): T[] {
  return [...a, ...b.filter(x => !a.includes(x))]
}
