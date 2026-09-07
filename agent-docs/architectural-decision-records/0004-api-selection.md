# 0004 — Two API backends selected by `BACKEND_URL`

Status: Accepted

## Context

The app can run two ways:

- Against the express server (full vg toolkit, server-side file slicing).
- Entirely in the browser via a WASM build of `gbz-base` (gh-pages demo).

`APIInterface` is the contract; `ServerAPI` and `LocalAPI` are the two
implementations. `LocalAPI` runs `GBZBaseAPI` inside a Web Worker via Comlink
(see [[0005-comlink-worker]]).

## Decision

`config.BACKEND_URL` selects the implementation:

- `false` → `LocalAPI` (WASM, no network).
- Any string (including `""` for same-origin) → `ServerAPI`.

In development, `config-client.js` overrides `false` → `""` when
`NODE_ENV !== 'production'`, so `pnpm start` reaches the express backend via the
Vite dev server's `/api` proxy without flipping config.json. Production gh-pages
builds tree-shake the override and keep `BACKEND_URL=false`.

`GBZBaseAPI` falls back to `fetch()` for non-numeric `trackFile` strings, so
built-in `DATA_SOURCES` paths (`exampleData/cactus.vg.xg`) work in LocalAPI mode
too. The worker resolves them against `document.baseURI` (passed in via
Comlink), not the worker script's `assets/` location.

## Consequences

- Adding a new API method means updating the interface plus both
  implementations. Worth it — the rest of the app stays oblivious.
- Don't reintroduce `!config.BACKEND_URL` checks. `''` is a valid `BACKEND_URL`.
- LocalAPI's `getBedRegions` / `getChunkTracks` / `getPathInfo` currently return
  empty results — graph rendering works, BED-driven navigation and per-chunk
  track lists don't. Surface this as a known limitation, not a bug.
