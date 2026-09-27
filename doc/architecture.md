# Architecture

How a region in the URL bar becomes a drawn tube map, and the decisions behind
the code's shape.

## The two backends

Everything that fetches data goes through `APIInterface`
(`src/api/APIInterface.ts`). There are two implementations, and `App` picks the
live one once, at startup, from `config.BACKEND_URL`:

| `BACKEND_URL`                   | implementation | where the work happens          |
| ------------------------------- | -------------- | ------------------------------- |
| a string (`""` for same origin) | `ServerAPI`    | express + `vg chunk`, over HTTP |
| literal `false`                 | `LocalAPI`     | the browser, in a worker        |

`src/App.tsx` reads that once (`isLocalMode`) and constructs the interface. The
app can also switch at runtime — the upload dialog builds a `ServerAPI` pointed
at the vgteam's public backend — but nothing below `App` knows which
implementation it holds.

In development `config-client.js` rewrites `false` to `""` so `pnpm start`
reaches the local express backend through the Vite dev server's `/api` proxy;
the `#local` hash opts out of that rewrite. Production gh-pages builds keep
`false`. See [decision 4](#4--two-api-backends-selected-by-backend_url).

## Server path

```
ServerAPI ──HTTP──> src/server.mjs ──> vg chunk / vg paths / vg gamsort
```

The express server slices graphs and reads with the real `vg` toolchain and
returns vg-style JSON. It also holds uploads (deleted on a cron), serves mounted
data directories, and pushes filename changes over a websocket. This is
upstream's design, largely unchanged.

The vgteam's public `https://api.tubemap.graphs.vg` answers any origin with
`Access-Control-Allow-Origin: *`, and its websocket handshake returns 101 and
echoes the origin, which is what lets a gh-pages build upload to it. Re-check
with:

```
curl -i -H 'Origin: https://cmdcolin.github.io' \
  https://api.tubemap.graphs.vg/api/v0/getFilenames
```

## In-browser path

```
LocalAPI ──Comlink──> Worker ──> GBZBaseAPI ──┬──> @gmod/gbz-base ──> .gbz.db
                                              │     (BlobFile | RemoteFile)
                                              └──> src/api/gam ──> .gam (+.gai)
```

`LocalAPI` is a thin proxy: it wraps a web worker with Comlink so the SQLite
page reads and GAM decoding stay off the main thread
([decision 5](#5--comlink-for-mainworker-ipc)). Everything real happens in
`GBZBaseAPI` (`src/api/GBZBaseAPI.ts`):

- **Graphs** come from `@gmod/gbz-base`, which reads `.gbz.db` SQLite b-trees
  directly. An uploaded file is read from its `Blob`; a URL is read by HTTP
  range requests, so a hosted whole-chromosome database is queried without
  downloading it. `src/api/gbz/schema.ts` converts the result to the same
  vg-style JSON the server returns, so `TubeMapContainer` cannot tell the two
  backends apart.
- **Reads** come from `src/api/gam/`, a from-scratch GAM reader: BGZF
  decompression, libvgio type-tagged message framing, a protobuf `Alignment`
  decoder, and a `.gam.gai` index parser that narrows a region query to the
  virtual-offset runs that can overlap the node range.

Uploaded files never leave the browser; `fileRegistry.ts` hands out numeric ids
that stand in for `trackFile` paths. Any other `trackFile` string resolves
against `document.baseURI`, which the main thread passes in over Comlink, not
against the worker script's `assets/` location.

`getBedRegions` and `getChunkTracks` return empty results in this backend, so
BED-driven navigation and per-chunk track lists need a server. That is a known
limitation, not a bug.

### What the app asks of gbz-base

`GBZBaseAPI` uses a deliberately small slice of the reader:

- `GBZBase.open(source, { haplotypeIndex })` once per graph, cached for the
  session. The second source is the optional companion index described in
  [data.md](data.md#naming-haplotypes-optional).
- `db.getSubgraphForRange(pathQuery, start, end + 1, { haplotypes: 'distinct', signal })`
  for every view. `distinct` means the app always wants _every_ haplotype
  through the window, never a chosen subset. The `+ 1` is the coordinate
  convention: the server's `vg chunk -p contig:start-end` includes `end`,
  gbz-base treats it as exclusive, and the Region field means the same thing
  whichever backend answers it.
- `subgraph.toSubgraphJson({ names: db.hasHaplotypeIndex ? 'resolved' : 'anonymous' })`,
  converted to vg-style JSON in `src/api/gbz/schema.ts`.
- `db.paths()` for the "Paths in this graph" panel. `getPathInfo` takes the
  companion index as well as the graph, because the panel asks by filename
  alone, and a second database opened without the index would walk every path to
  its end — slow in exactly the place a user waits.

That is the whole surface. In particular the app does **not** use
`subgraphForHaplotypes`, so the `HaplotypeAnchors` table — which makes a query
for a chosen set of haplotypes cost only that set — goes unexercised here. It
matters for consumers that draw one lane per selected haplotype, such as JBrowse
2; the tube map always draws them all.

The package comes from npm (`@gmod/gbz-base`); `pnpm-workspace.yaml` lists it
under `minimumReleaseAgeExclude` so a fresh release installs without the default
waiting period.

## Frontend

```
urlViewTarget ──> App ──> HeaderForm        (choose data + region)
                    └──> TubeMapContainer   (SWR fetch, then render)
                            └──> TubeMap ──> src/util/tubemap.ts (d3)
```

A **`ViewTarget`** — tracks, region, BED file, data type — is the unit of
navigation. `src/urlViewTarget.ts` parses one out of the query string and
serializes it back, which is what makes every view linkable
([urlparams.md](urlparams.md)). There is no router
([decision 1](#1--drop-react-router)).

`TubeMapContainer` turns the current `ViewTarget` into an SWR key and fetches
through whichever `APIInterface` it was given. Fetchers return the _processed_
shape, so revisiting a view is a cache hit and cancellation is implicit
([decision 7](#7--swr-for-all-async-data)).

## The layout engine

`src/util/tubemap.ts` is the layout and drawing engine, inherited from upstream
and ported to TypeScript. It computes node order, assigns lanes, places reads,
and draws with d3. It is _not_ a React component: it holds module-level state
and `TubeMap.tsx` drives it through `create()` plus a set of `setX()` functions.
That is the largest remaining piece of technical debt — it means only one tube
map can exist per page; [todo.md](todo.md#the-layout-engine) has the clean-up
still to do.

Invariants to know before editing it:

- **`inputNodes` / `nodes` are 1-indexed with a real array hole at index 0.**
  The hole lets a _signed_ index encode orientation (`-i` = reverse visit of
  node `i`), and index 0 has no sign, so it must never be used.
  `forEach`/`map`/`filter` skip holes; `for...of` and `Array.from` do not. This
  distinction is load-bearing: `nodeOrders` used to be allocated with
  `new Array(n)` (all holes) and its `forEach` passes silently did nothing.
- **`create()` is the only render trigger.** Every `set*` function just mutates
  `config`, so a batch of visOptions changes costs one layout, not one per
  option. `changeTrackVisibility` / `changeAllTracksVisibility` /
  `trackDoubleClick` call `createTubeMap()` directly because they change the
  input, not the config.
- **The pipeline promotes types as it goes.** `InputNode`/`InputTrack` are the
  loose shapes `create()` accepts; `Node`/`LayoutNode`/`Track` are the
  layout-complete shapes. The single boundary cast in `createTubeMap` is the
  acknowledged one; question any new `as`. `Node.sequenceLength` and
  `LayoutNode.order` are required because `generateNodeWidth` and
  `generateNodeOrder` guarantee them, so don't reintroduce `?? 0` on those.
- **`getXCoordinateOfBaseWithinNode` returns `null`** for a base past the node's
  end, and `drawMismatches` relies on that to skip stale positions. Callers that
  must produce a coordinate regardless use `clampedXCoordinateOfBaseWithinNode`,
  which maps out-of-range bases to the nearest node edge — never fall back to
  `0`, which is the far left of the whole image.
- **`releaseDomBindings()` releases everything attached outside the SVG**: the
  parent's wheel listener and ResizeObserver, the hover tooltip in `<body>`, and
  the cached hover highlight. `createTubeMap` calls it first, before the early
  exits.
- **`reverseMismatches` pivots on `sequenceLength`, not `node.width`.** They are
  only equal in `nodeWidthOption: 'normal'`.

`src/util/tubemap.render.test.ts` is the real regression net: it renders all
nine demo examples, asserts one node `<path>` per input node (with merging off),
that the reference path lays out strictly left to right, and that no rendered
attribute ever contains `NaN`. Add to it rather than trusting the unit tests
alone — most of the historical bugs in this file were geometry, not types.

## Decisions

Calls that are easy to miss when reading the code, and easy to unwind by
accident. Add one when you make a non-obvious call; when a decision changes,
rewrite its entry and say what it replaced.

### 1 — Drop react-router

The app is one screen and shares state through query parameters, not paths. It
used to render under a single `<Route path="/">`, which stopped matching once
the app deployed to `cmdcolin.github.io/sequenceTubeMap/`, leaving a blank page.
A `basename` would have tied the build artifact to its deploy URL.

So `index.tsx` mounts `<App />` directly and `react-router-dom` is gone. The
same build runs at `/`, `/sequenceTubeMap/` or any other subpath without
rebuilding. If real client-side routing is ever needed, prefer query params, or
a HashRouter so the basename problem doesn't come back. `SafeLink` is now just a
renamed `<a>`, worth inlining if it gains no other job.

### 2 — React Compiler is on; skip manual memoization

`babel-plugin-react-compiler` runs in the Vite build and dev server, as a Babel
pass wired up through `@rolldown/plugin-babel` (`@vitejs/plugin-react` 6
transforms JSX with oxc and has no babel option of its own). It memoizes JSX,
inline objects and arrays, and inline callbacks, so treat `useMemo`,
`useCallback` and `React.memo` as a smell unless a profiler shows the compiler
missed. Hot paths still deserve review — the compiler is conservative around
hooks-of-hooks and ref reads.

### 3 — MUI for inputs and dialogs; reactstrap only for layout

The codebase used to mix react-bootstrap, reactstrap and Material-UI, with three
dropdown styles on one page. Inputs, selects, autocompletes, dialogs and toggle
groups now use **MUI**; `Container` / `Row` / `Col` / `Navbar` and Bootstrap
utility classes use **reactstrap**, kept for the grid. Tests for selects use
`mouseDown` + `findByRole('option')`, not `change` events. Don't pull in
`@material-ui/core` (v4) again.

### 4 — Two API backends selected by `BACKEND_URL`

`APIInterface` is the contract; `ServerAPI` and `LocalAPI` are the two
implementations, and `config.BACKEND_URL` picks one: `false` selects `LocalAPI`,
any string (including `""` for same origin) selects `ServerAPI`. In development
`config-client.js` overrides `false` to `""` when `NODE_ENV !== 'production'`,
so `pnpm start` reaches the express backend without editing `config.json`;
production builds tree-shake the override.

Adding an API method means updating the interface and both implementations,
which keeps the rest of the app oblivious. Don't reintroduce
`!config.BACKEND_URL` checks — `''` is a valid `BACKEND_URL`.

### 5 — Comlink for main↔worker IPC

`LocalAPI` runs `GBZBaseAPI` in a web worker so SQLite page reads and GAM
decoding don't block the main thread. Comlink, which replaced `worker-rpc`,
wraps the worker as a proxied class: add a method to `WorkerAPI` in
`WorkerImplementation.ts` and the proxy type follows. Anything crossing the
boundary must be structured-cloneable or wrapped in `Comlink.proxy` (as the
filename-change callbacks are), so no closures over main-thread state. The
worker starts lazily on the first call, and cancellation goes through
`AbortSignal` → a numeric `cancelID`, because signals don't cross the bridge.

### 6 — Late-bind `config` through a Proxy

`config-global.mjs` exports `config`, which both `config-client.js` (browser)
and `config-server.mjs` (express) write. End-to-end tests load both in one
process, and when `config` was a snapshot taken at import, whichever ran first
won and the other's writes — notably the dev-mode `BACKEND_URL` override — were
lost. `config` is now a `Proxy` that reads `globalThis[GLOBAL_NAME]` on every
access, so the last writer wins even after a consumer has evaluated. Don't
"simplify" it back to `export const config = globalThis[GLOBAL_NAME]`: that
works in production and breaks under test. The proxy is typed `any`; a real
config schema would be better.

### 7 — SWR for all async data

`HeaderForm` already used SWR for filenames, BED regions and path info, while
`TubeMapContainer` hand-rolled the same job with `useEffect`, an
`AbortController` and six `useState` slots. Every async fetch now goes through
`useSWR`. Fetchers return the already-processed shape, so SWR caches the result
rather than the raw response, and keys are tuples `['scope.kind', ...inputs]` so
distinct fetches can't collide. Revisiting a view is a cache hit, and SWR drops
stale results when the key changes, so cancellation needs no plumbing. Don't add
`useEffect`-based fetches; for a fetch triggered by an event rather than state,
use SWR's `mutate`.
