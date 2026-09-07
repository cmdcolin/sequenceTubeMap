// A caught value is `unknown`, and both shapes below were written out inline
// in every component that catches one.

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}
