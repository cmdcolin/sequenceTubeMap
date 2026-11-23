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
pnpm typecheck     # tsrs --noEmit
pnpm lint          # oxlint, with type-aware rules
pnpm check-format  # oxfmt, reporting without rewriting
pnpm check-docs    # markdown citations of src/... paths still resolve
```

`pnpm lint --fix` applies the autofixable subset. `pnpm lint:fast` skips the
type-aware pass, which is the slower half.

Rules live in `.oxlintrc.json`. The type-aware ones run through `tsrs-lint`,
which comes with `tsrs` and reads the same `tsconfig.json` `pnpm typecheck`
does, so a rule like `no-floating-promises` sees real types rather than
guessing. oxlint picks `tsrs-lint` over `oxlint-tsgolint` whenever both are
installed; `OXLINT_TSGOLINT_PATH=node_modules/.bin/tsgolint pnpm lint` runs the
Go one instead.

`tsrs` is the Rust port of `tsc`, here on TypeScript 7.1's beta. Editors still
use the `typescript` 7.0 package, so code has to compile under both.

Five type-aware rules are switched off for `.mjs` and `.js`, and the config says
why at the override: TypeScript infers those files narrowly enough that the
rules misread live code as dead. `config.BACKEND_URL === false` really is how
the gh-pages build selects the in-browser backend, and the "useless"
`height = 900` default in `scripts/screenshot-ui.mjs` really does feed the one
shot that omits `height`. Everything else in the type-aware set still applies
there.

`import/extensions` requires relative imports to spell out the file extension.
Node's ESM resolver does not guess at one, and
[`pnpm tubemap-cli`](docs/headless-rendering.md) hands `src/` straight to node,
so a bare `../Types` would break that entry point while the Vite build stayed
happy.

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
([headless-rendering.md](docs/headless-rendering.md)). A figure of the
_interface_ — the render cap's notice, the paths panel, the Examples menu —
comes from `scripts/screenshot-ui.mjs`, which drives headless Chrome over the
DevTools protocol and crops each shot to the element it is about:

```
pnpm start --port 5200 &                  # the backend is for the menu shot
google-chrome --headless=new --remote-debugging-port=9222 about:blank &
node scripts/screenshot-ui.mjs        # overwrites the PNGs in docs/images/
```

`node scripts/screenshot-ui.mjs fold-variants` takes only the shots whose file
name holds that word. The folded and unfolded figures beside them come from
`scripts/make-fold-figures.sh`.

It needs `magick` (ImageMagick) for the crop, and no browser-automation
dependency: Node's own `fetch` and `WebSocket` are the whole driver. Re-run it
when a change moves any of that UI, and commit the PNGs it rewrites.

## Developing against a local tubemap-core

The layout engine lives in
[GMOD/tubemap-core](https://github.com/GMOD/tubemap-core) and reaches the viewer
as `@jbrowse/tubemap-core` from npm. To try a layout change here before
releasing it, build a clone and link it in place of the npm copy:

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
pnpm unlink @jbrowse/tubemap-core
```

`pnpm unlink` drops the override and reinstalls the npm version.

A layout change ships in two steps. Release it from tubemap-core, where pushing
a `v<version>` tag publishes to npm. Then bump the range in `package.json`, run
`pnpm install`, rewrite any golden it changes with
`pnpm vitest run -u src/util/layout.golden.test.ts`, and commit them together.
`pnpm-workspace.yaml` lists `@jbrowse/tubemap-core` under
`minimumReleaseAgeExclude`, so a release installs as soon as npm lists it.

## Build

```
pnpm build       # production bundle into build/
```

CI builds and publishes `build/` to the `gh-pages` branch automatically on every
push to `main`. That build ships `BACKEND_URL: false`, so it offers no
self-hosted backend. See [data.md](docs/data.md#option-2--in-browser).

## Architecture

How a region in the URL bar becomes a drawn tube map.

### The two backends

Everything that fetches data goes through `APIInterface`
(`src/api/APIInterface.ts`). There are two implementations:

| implementation | where the work happens          |
| -------------- | ------------------------------- |
| `LocalAPI`     | the browser, in a worker        |
| `ServerAPI`    | express + `vg chunk`, over HTTP |

The page opens on `LocalAPI` and the first in-browser data source, a walk file,
unless a link names a view whose graph only a vg server reads and a self-hosted
server is configured. `config.BACKEND_URL` says whether one is: a string (`""`
for same origin) names it, and literal `false` means there is none.
`src/App.tsx` reads it once (`hasSelfHostedServer`).

File → Open switches backends at runtime, between the in-browser reader, a
`ServerAPI` pointed at the vgteam's public backend, and the self-hosted server
when there is one. Nothing below `App` knows which implementation it holds. The
page keeps one `LocalAPI`, so switching back to in-browser mode finds the same
worker and the files uploaded to it.

### Server path

```
ServerAPI ──HTTP──> src/server.mjs ──> vg chunk / vg paths / vg gamsort
```

The express server slices graphs and reads with the real `vg` toolchain and
returns vg-style JSON. It also holds uploads (deleted once unused for
`fileExpirationTime`), serves mounted data directories, and pushes filename
changes over a websocket. This is upstream's design, largely unchanged.

### In-browser path

```
LocalAPI ──Comlink──> Worker ──> GBZBaseAPI ──┬──> @jbrowse/graph-walks ──> .walks.gz (+.idx)
                                              ├──> @gmod/gbz-base ──> .gbz.db (legacy)
                                              │     (BlobFile | RemoteFile)
                                              └──> src/api/gam ──> .gam (+.gai)
```

`LocalAPI` is a thin proxy: it wraps a web worker with Comlink so the SQLite
page reads and GAM decoding stay off the main thread. Everything real happens in
`GBZBaseAPI` (`src/api/GBZBaseAPI.ts`):

- **Graphs** come from `@jbrowse/graph-walks`, which cuts a region out of a
  gfa-to-tabix walk file; `src/api/walks/WalkFiles.ts` turns the cut into
  vg-style JSON. A graph track ending `.walks.gz` takes that path (`isWalks`),
  and every example and test that only needs a graph uses it.
- **Legacy graphs** come from `@gmod/gbz-base`, which reads `.gbz.db` SQLite
  b-trees directly. Node regions and the paths panel's read counts exist only on
  this path. An uploaded file is read from its `Blob`; a URL is read by HTTP
  range requests, so a hosted whole-chromosome database is queried without
  downloading it. `src/api/gbz/schema.ts` converts the result to the same
  vg-style JSON the server returns, so `TubeMapContainer` cannot tell the two
  backends apart.
- **Reads** come from `src/api/gam/`, a from-scratch GAM reader: BGZF
  decompression, libvgio type-tagged message framing, a protobuf `Alignment`
  decoder, and a `.gam.gai` index parser that narrows a region query to the
  virtual-offset runs that can overlap the node range. Like vg, the reader takes
  those runs in file order and stops at the first group that lies wholly past
  the range; on the bundled BRCA1 reads that skips about two thirds of what a
  narrow query used to fetch.

Uploaded files never leave the browser; `fileRegistry.ts` hands out numeric ids
that stand in for `trackFile` paths. Any other `trackFile` string resolves
against `document.baseURI`, which the main thread passes in over Comlink, not
against the worker script's `assets/` location.

`getBedRegions` and `getChunkTracks` return empty results in this backend, so
BED-driven navigation and per-chunk track lists need a server. That is a known
limitation, not a bug.

#### What the app asks of gbz-base

`GBZBaseAPI` uses a small slice of the reader:

- `GBZBase.open({ source, haplotypeIndex })` once per graph, cached for the
  session. `haplotypeIndex` is the optional companion index described in
  [data.md](docs/data.md#naming-haplotypes-optional).
- `db.getPathFragments({ path, start, end: end + 1 })`, then
  `db.getSubgraphs({ path, start, end: end + 1, haplotypes, limit, signal })`
  for a path region. The app throws on a window no fragment covers. `haplotypes`
  is `distinct`, or `all` when the view asks for every copy; either way the app
  wants every haplotype through the window, never a chosen subset. The `+ 1` is
  the coordinate convention: the server's `vg chunk -p contig:start-end`
  includes `end`, gbz-base treats it as exclusive, and the Region field means
  the same thing whichever backend answers it.
- `db.subgraphAroundNodes({ nodeIds, context, haplotypes: 'none' })` for `node:`
  regions, one edge per step from the nodes that exist.
- `subgraph.toSubgraphJson({ names: db.hasHaplotypeIndex ? 'resolved' : 'anonymous' })`,
  converted to vg-style JSON in `src/api/gbz/schema.ts`.
- `db.paths()` for the "Paths in this graph" panel. `getPathInfo` takes the
  companion index as well as the graph, because the panel asks by filename
  alone, and a second database opened without the index would walk every path to
  its end — slow in exactly the place a user waits.
- `db.subgraphInInterval({ path, start, end, haplotypes: 'none', context: 0 })`
  over each indexed path, for the node-id ranges behind the paths panel's
  per-path read counts on an uploaded read file.

The app never passes `keep` to `subgraphInInterval`, so the `HaplotypeAnchors`
table — which makes a query for a chosen set of haplotypes cost only that set —
goes unexercised here. It matters for consumers that draw one lane per selected
haplotype, such as JBrowse 2; the tube map always draws them all.

The package comes from npm (`@gmod/gbz-base`); `pnpm-workspace.yaml` lists it,
like `@jbrowse/tubemap-core`, under `minimumReleaseAgeExclude` so a fresh
release installs without the default waiting period.

### Frontend

```
urlViewTarget ──> App ──> HeaderForm        (choose data + region)
                    └──> TubeMapContainer   (SWR fetch, then render)
                            └──> TubeMap ──> src/util/tubemap.ts (d3)
```

A **`ViewTarget`** — tracks, region, BED file, data type — is the unit of
navigation. `src/urlViewTarget.ts` parses one out of the query string and
serializes it back, which is what makes every view linkable
([urlparams.md](docs/urlparams.md)). There is no router.

`App` turns the current `ViewTarget` into an SWR key and fetches through
whichever `APIInterface` it holds. Fetchers return the _processed_ shape, so
revisiting a view is a cache hit. Starting a fetch aborts the one before it,
whose view is gone, and `LocalAPI` forwards the abort to the worker so that
view's work doesn't run ahead of the view on screen. The GAM reader cancels its
range requests in flight. gbz-base doesn't hand the signal to its page reads, so
a graph query stops at its next step, once the read under way lands. A
whole-file download keeps going, since the next view usually wants the same
file.

### The layout engine

The tube map is inherited from upstream and ported to TypeScript, in two parts:

- **`@jbrowse/tubemap-core`**, installed from npm and developed in
  [GMOD/tubemap-core](https://github.com/GMOD/tubemap-core), is the layout: node
  order, orientation, lanes, read placement and node merging, from input nodes
  and tracks to drawable shapes in layout coordinates, plus the curve and node
  outline path geometry. It has no DOM or d3, so other apps — the JBrowse graph
  genome plugin among them — draw its output their own way. Each `layoutTubeMap`
  call passes its own `LayoutState` through the passes, so calls share nothing.
  `src/util/layout.golden.test.ts` pins its output on the viewer's datasets, and
  [Developing against a local tubemap-core](#developing-against-a-local-tubemap-core)
  covers changing both repos together.
- **`src/util/tubemap.ts`** draws a layout with d3 and handles the interaction.
  It is _not_ a React component: it holds the latest layout and its UI state at
  module level, and `TubeMap.tsx` drives it through `create()` plus a set of
  `setX()` functions, which is why only one tube map can exist per page. It
  colors each shape at draw time from the track its `id` names, and reuses the
  latest layout when only the coloring changed.

[layout-engine-cleanup.md](agent-docs/todo/layout-engine-cleanup.md) has the
clean-up still to do.

Invariants to know before editing it:

- **The layout's `nodes` are 1-indexed with a real array hole at index 0.** The
  hole lets a _signed_ index encode orientation (`-i` = reverse visit of node
  `i`), and index 0 has no sign, so it must never be used.
  `forEach`/`map`/`filter` skip holes; `for...of`, `find` and `Array.from` do
  not. This distinction is load-bearing: `nodeOrders` used to be allocated with
  `new Array(n)` (all holes) and its `forEach` passes silently did nothing.
- **`create()` is the only render trigger.** Every `set*` function just mutates
  `config`, so a batch of visOptions changes costs one layout, not one per
  option. `changeTrackVisibility` / `changeAllTracksVisibility` /
  `trackDoubleClick` call `createTubeMap()` directly because they change the
  input, not the config.
- **The pipeline promotes types as it goes.** `InputNode`/`InputTrack` are the
  loose shapes `layoutTubeMap` accepts; `Node`/`LayoutNode`/`Track` are the
  layout-complete shapes. The single boundary cast in `layoutTubeMap` is the
  acknowledged one; question any new `as`. `Node.seq`, `Node.sequenceLength` and
  `LayoutNode.order` are required because that promotion and `generateNodeOrder`
  guarantee them, so don't reintroduce `?? 0` on those.
- **`getXCoordinateOfBaseWithinNode` returns `null`** for a base past the node's
  end, and `drawMismatches` relies on that to skip stale positions. Callers that
  must produce a coordinate regardless use `clampedXCoordinateOfBaseWithinNode`,
  which maps out-of-range bases to the nearest node edge — never fall back to
  `0`, which is the far left of the whole image.
- **`releaseDomBindings()` releases everything attached outside the SVG**: the
  parent's wheel listener and ResizeObserver, the hover tooltip in `<body>`, and
  the cached hover highlight. `createTubeMap` calls it first, before the early
  exits, and `TubeMap` calls it on unmount.
- **`reverseMismatches` pivots on `sequenceLength`, not `node.width`.** They are
  only equal in `nodeWidthOption: 'normal'`.
- **Under `'normal'`, `pixelWidth` is one character short of the label.** It
  runs from the first letter to the last; the outline adds 9 px each side and
  `nodePixelCoordinatesInX` about half a character, which puts base i under
  letter i. Sized to the whole label, it drifts every mismatch right, by up to a
  base at a node's end, and a 1 bp node's reads overshoot its outline.

`src/util/tubemap.render.test.ts` is the real regression net: it renders all
nine demo examples, asserts one node `<path>` per input node (with merging off),
that the reference path lays out strictly left to right, and that no rendered
attribute ever contains `NaN`. Add to it rather than trusting the unit tests
alone — most of the historical bugs in this file were geometry, not types.

Those checks say what a render must never do; two golden tests pin what it does.
`scripts/tubemap-cli.test.ts` compares the CLI's SVGs byte for byte with
`docs/tubemap-cli-samples/`, at default settings.
`src/util/layout.golden.test.ts` pins every shape and node position
`layoutTubeMap` returns for the demo examples and a BRCA1 window with
reverse-strand reads, under each option that takes a different layout path, in
`src/util/layout-golden/`. A refactor that is meant to change nothing leaves
both unchanged; an intended change rewrites the layout files with
`pnpm vitest run -u src/util/layout.golden.test.ts`, and the diff names the
shapes that moved.

### Traps

- `''` is a valid `BACKEND_URL` (same origin), so test for `=== false`, never
  `!config.BACKEND_URL`.
- `config` (`src/config-global.mjs`) is a `Proxy` that reads `globalThis` on
  every access, because the client and server config modules both write it and
  end-to-end tests load both in one process. Don't "simplify" it to
  `export const config = globalThis.sequenceTubeMapConfig`: that works in
  production and breaks under test.
