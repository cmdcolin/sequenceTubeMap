# 0007 — SWR for all async data

Status: Accepted

## Context

`HeaderForm` already used SWR for filenames / BED regions / path info.
`TubeMapContainer` had a hand-rolled `useEffect` + `AbortController` + six
`useState` slots doing the same job for `getChunkedData`.

## Decision

Every async fetch goes through `useSWR`. Fetchers return the
**already-processed** shape (so SWR caches the processed result, not just the
raw response). Key shapes use tuples `['scope.kind', ...inputs]` so distinct
fetches can't collide.

## Consequences

- Switching back to a previously-viewed `viewTarget` is instant (cache hit).
- Cancellation is implicit: SWR drops stale results when the key changes, no
  manual `AbortController` plumbing.
- Don't add `useEffect`-based fetches. If a fetch needs to run in response to an
  event (not state), use `mutate` from SWR, not a side-effect.
