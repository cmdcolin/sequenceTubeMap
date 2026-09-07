# Development Guide

## Prerequisites

- Node 22.6 or newer (`.nvmrc` pins 22). `pnpm serve` runs `src/server.mjs`
  with `--experimental-strip-types`, which needs 22.6+; Node 24 strips types
  without the flag and accepts it as a no-op.
- [pnpm](https://pnpm.io/) — the lockfile is `pnpm-lock.yaml`; npm and yarn will
  not reproduce it
- [`vg`](https://github.com/vgteam/vg), optional. Only the tests that shell out
  to it need it, and they skip when it is absent.

```
pnpm install
```

## Development server

```
pnpm start
```

Runs two processes under `concurrently`: the Vite dev server for the frontend
and `src/server.mjs` for the backend. Vite serves on 5173 unless that is taken,
and proxies `/api` (including websockets) to the backend. The backend listens on
`SERVER_PORT`, else `serverPort` in `src/config.json`, else 3000; Vite reads the
same two to find it.

Use this rather than `pnpm build` + `pnpm serve` while developing — the build is
minified and hard to debug.

To work on the browser-only path without a backend at all:

```
pnpm start:local
```

That launches the Vite dev server alone and opens `/#local`. In development
`config-client.js` normally rewrites `BACKEND_URL: false` to `''` so the app
talks to the express backend; the `#local` hash skips that rewrite, leaving
`config.json`'s `false` in place, which selects `LocalAPI`. See
[ADR 0004](../agent-docs/architectural-decision-records/0004-api-selection.md).

## Checks

The same four things CI runs, all runnable alone:

```
pnpm test        # vitest, single run
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm check-docs  # markdown citations of src/... paths still resolve
```

`pnpm lint --cache --fix` applies the autofixable subset.

For one test by name:

```
pnpm test -t "can retrieve the list of mounted graph files"
```

For watch mode, `pnpm vitest` without `run`.

Tests needing `vg` — `src/scripts.test.ts` and three in
`src/end-to-end.test.js` — skip themselves when the binary is not on `PATH` or
in `config.vgPath`, so a clean local run means the same thing whether or not you
have it. CI installs vg, so they always run there.

## Formatting

```
pnpm format
```

Prettier over `.mjs`, `.js`, `.ts`, `.tsx` and `.css`, configured in
`.prettierrc.json` to match what the tree already looks like: single quotes, no
semicolons, trailing commas, no parens on single-argument arrows.

## Build

```
pnpm build       # production bundle into build/
pnpm dep         # build, publish build/ to gh-pages
```

The gh-pages build ships `BACKEND_URL: false`, which selects the in-browser
backend. See [gbz-base.md](gbz-base.md).
