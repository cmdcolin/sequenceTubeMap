# 0002 — React Compiler is on; skip manual memoization

Status: Accepted

## Context

`babel-plugin-react-compiler` runs in both webpack and vite. It auto-memoizes
JSX, inline objects/arrays, and inline callbacks.

## Decision

Don't reach for `useMemo`, `useCallback`, or `React.memo`. The compiler covers
those cases.

## Consequences

- Manual memoization is treated as a code smell unless a profiler shows the
  compiler missed.
- Hot paths still need manual review — the compiler is conservative around
  hooks-of-hooks and ref reads.
