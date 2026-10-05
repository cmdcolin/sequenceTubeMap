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

Runs the Vite dev server for the frontend, which starts `src/server.mjs` for the
backend alongside it and stops it on exit. Vite serves on 5173 unless that is
taken, and proxies `/api` (including websockets) to the backend. The backend
listens on `SERVER_PORT`, else `serverPort` in `src/config.json`, else 3000;
Vite reads the same two to find it.

Use this rather than `pnpm build` + `pnpm serve` while developing — the build is
minified and hard to debug.

To work on the browser-only path without a backend at all:

```
pnpm start:local
```

That launches the Vite dev server alone and opens `/#local`. Both commands open
on the in-browser backend. In development `config-client.js` normally rewrites
`BACKEND_URL: false` to `''` so File → Open offers the express backend too; the
`#local` hash skips that rewrite, leaving `config.json`'s `false` in place, so
the app never asks for a backend that isn't running.

## Checks

The same five things CI runs, all runnable alone:

```
pnpm test          # vitest, single run
pnpm typecheck     # tsc --noEmit
pnpm lint          # oxlint, with type-aware rules
pnpm check-format  # oxfmt, reporting without rewriting
pnpm check-docs    # markdown citations of src/... paths still resolve
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

The tree is formatter-clean and CI fails on drift, so run `pnpm format` before
committing. `.git-blame-ignore-revs` lists the commit that first formatted
everything; GitHub's blame view skips it, and
`git config blame.ignoreRevsFile .git-blame-ignore-revs` makes local blame skip
it too.

## Figures in the docs

A figure of a tube map comes from `pnpm tubemap-cli`
([headless-rendering.md](headless-rendering.md)). A figure of the _interface_ —
the render cap's notice, the paths panel, the Examples menu — comes from
`scripts/screenshot-ui.mjs`, which drives headless Chrome over the DevTools
protocol and crops each shot to the element it is about:

```
pnpm start --port 5200 &                  # the backend is for the menu shot
google-chrome --headless=new --remote-debugging-port=9222 about:blank &
node scripts/screenshot-ui.mjs        # overwrites the PNGs in doc/images/
```

It needs `magick` (ImageMagick) for the crop, and no browser-automation
dependency: Node's own `fetch` and `WebSocket` are the whole driver. Re-run it
when a change moves any of that UI, and commit the PNGs it rewrites.

## Developing against a local tubemap-core

The layout engine lives in
[GMOD/tubemap-core](https://github.com/GMOD/tubemap-core) and reaches the viewer
as `@gmod/tubemap-core` from npm. To try a layout change here before releasing
it, build a clone and link it in place of the npm copy:

```
core=~/src/gmod/tubemap-core   # any path works
git clone https://github.com/GMOD/tubemap-core $core
pnpm -C $core install
pnpm -C $core build
pnpm link $core
```

The package exports its compiled `dist/`, not its sources, so run
`pnpm -C $core build` after each change there; `pnpm start`, `pnpm test` and
`pnpm tubemap-cli` all read the rebuilt `dist/`.
`src/util/layout.golden.test.ts` shows what the change does to the viewer's
layouts.

`pnpm link` records a `link:` entry under `overrides` in `pnpm-workspace.yaml`
and `pnpm-lock.yaml`. Never commit those two edits: CI's
`pnpm install --frozen-lockfile` has no clone to link. Undo the link with:

```
pnpm unlink @gmod/tubemap-core
```

`pnpm unlink` drops the override and reinstalls the npm version.

A layout change ships in two steps. Release it from tubemap-core, where pushing
a `v<version>` tag publishes to npm. Then bump the range in `package.json`, run
`pnpm install`, rewrite any golden it changes with
`pnpm vitest run -u src/util/layout.golden.test.ts`, and commit them together.
`pnpm-workspace.yaml` lists `@gmod/tubemap-core` under
`minimumReleaseAgeExclude`, so a release installs as soon as npm lists it.

## Build

```
pnpm build       # production bundle into build/
```

CI builds and publishes `build/` to the `gh-pages` branch automatically on every
push to `master`. That build ships `BACKEND_URL: false`, so it offers no
self-hosted backend. See [data.md](data.md#option-2--in-browser).
