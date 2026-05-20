# Architectural Decision Records

Short, immutable records of decisions that are easy to miss when reading the
code. Add a new file when you make a non-obvious call that future readers (or
agents) might otherwise unwind by accident.

Conventions:

- Filename `NNNN-kebab-slug.md`, numbered in order of acceptance.
- Each record has: Context (what we were faced with), Decision (what we picked),
  Consequences (what changes because of this — both good and bad).
- Don't edit accepted records. Supersede them with a new one if the decision
  changes, and link back from both directions.

Index:

- [0001 — Drop react-router](0001-no-router.md)
- [0002 — React Compiler is on; skip manual memoization](0002-react-compiler.md)
- [0003 — MUI for inputs and dialogs; reactstrap only for layout](0003-mui-for-inputs.md)
- [0004 — Two API backends selected by BACKEND_URL](0004-api-selection.md)
- [0005 — Comlink for main↔worker IPC](0005-comlink-worker.md)
- [0006 — Late-bind config through a Proxy](0006-config-proxy.md)
- [0007 — SWR for all async data](0007-swr-for-async.md)
