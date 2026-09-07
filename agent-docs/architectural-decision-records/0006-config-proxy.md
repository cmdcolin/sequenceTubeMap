# 0006 — Late-bind `config` through a Proxy

Status: Accepted

## Context

`config-global.mjs` exports `config`, which is also written by both
`config-client.js` (browser) and `config-server.mjs` (express). End-to-end tests
load **both** in one process; whichever ran first used to win, and the other's
mutations were silently lost (notably the dev-mode `BACKEND_URL` override from
[[0004-api-selection]]).

## Decision

`config-global.mjs` exports a `Proxy` that reads `globalThis[GLOBAL_NAME]` on
every property access instead of snapshotting it at import time.

## Consequences

- "Last writer to globalThis wins" reliably, even after the consumer module has
  already evaluated.
- Don't "simplify" back to `export const config = globalThis[GLOBAL_NAME]` —
  it'll work in production and break under test.
- The proxy is typed as `any` (JSDoc cast). A real config schema would be
  better; not done.
