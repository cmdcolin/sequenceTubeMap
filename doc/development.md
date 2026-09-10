# Development Guide

## Prerequisites

- Node 22.6 or newer (`.nvmrc` pins 22). `pnpm serve` runs `src/server.mjs` with
  `--experimental-strip-types`, which needs 22.6+; Node 24 strips types without
  the flag and accepts it as a no-op.
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
pnpm lint        # oxlint, with type-aware rules
pnpm check-docs  # markdown citations of src/... paths still resolve
```

`pnpm lint --fix` applies the autofixable subset. `pnpm lint:fast` skips the
type-aware pass, which is the slower half.

Rules live in `.oxlintrc.json`. The type-aware ones need `oxlint-tsgolint`,
which reads the same `tsconfig.json` `pnpm typecheck` does, so a rule like
`no-floating-promises` sees real types rather than guessing.

Five type-aware rules are switched off for `.mjs` and `.js`, and the config says
why at the override: TypeScript infers those files narrowly enough that the
rules misread live code as dead. `config.BACKEND_URL === false` really is how
the gh-pages build selects the in-browser backend, and the "useless"
`height = 900` default in `scripts/screenshot-ui.mjs` really does feed the one
shot that omits `height`. Everything else in the type-aware set still applies
there.

`import/extensions` requires relative imports to spell out the file extension.
Node's ESM resolver does not guess at one, and
[`pnpm tubemap-cli`](headless-rendering.md) hands `src/` straight to node, so a
bare `../Types` would break that entry point while the Vite build stayed happy.

For one test by name:

```
pnpm test -t "can retrieve the list of mounted graph files"
```

For watch mode, `pnpm vitest` without `run`.

Tests needing `vg` — `src/scripts.test.ts` and three in `src/end-to-end.test.js`
— skip themselves when the binary is not on `PATH` or in `config.vgPath`, so a
clean local run means the same thing whether or not you have it. CI installs vg,
so they always run there.

## Formatting

```
pnpm format
```

oxfmt over `.mjs`, `.js`, `.ts`, `.tsx`, `.css` and `.md`, configured in
`.oxfmtrc.json` to match what the tree already looks like: single quotes, no
semicolons, trailing commas, no parens on single-argument arrows. The settings
came across from `.prettierrc.json` via `oxfmt --migrate=prettier`.

Most of the tree has never been through a formatter, so `pnpm format` rewrites
far more than whatever you were editing. `pnpm check-format` lists what differs
without touching anything. Neither runs in CI.

## Figures in the docs

A figure of a tube map comes from `pnpm tubemap-cli`
([headless-rendering.md](headless-rendering.md)). A figure of the *interface* —
the render cap's notice, the paths panel, the Examples menu — comes from
`scripts/screenshot-ui.mjs`, which drives headless Chrome over the DevTools
protocol and crops each shot to the element it is about:

```
pnpm serve &                                                  # for the menu shot
pnpm vite --port 5200 &
google-chrome --headless=new --remote-debugging-port=9222 about:blank &
node scripts/screenshot-ui.mjs        # overwrites the PNGs in doc/images/
```

It needs `magick` (ImageMagick) for the crop, and no browser-automation
dependency: Node's own `fetch` and `WebSocket` are the whole driver. Re-run it
when a change moves any of that UI, and commit the PNGs it rewrites.

## Build

```
pnpm build       # production bundle into build/
```

CI builds and publishes `build/` to the `gh-pages` branch automatically on every
push to `master`. That build ships `BACKEND_URL: false`, which selects the
in-browser backend. See [gbz-base.md](gbz-base.md).
