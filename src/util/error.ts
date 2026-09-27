// A caught value is `unknown`, and both shapes below were written out inline
// in every component that catches one.

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

// Checked by name because an abort reaches the main thread as a DOMException
// from fetch, or as a plain Error that Comlink rebuilt from the worker's.
export function isAbortError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    e.name === 'AbortError'
  )
}
