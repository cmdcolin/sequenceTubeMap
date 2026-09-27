# Architecture

How a region in the URL bar becomes a drawn tube map.

## The two backends

Everything that fetches data goes through `APIInterface`
(`src/api/APIInterface.ts`). There are two implementations:

| implementation | where the work happens          |
| -------------- | ------------------------------- |
| `LocalAPI`     | the browser, in a worker        |
| `ServerAPI`    | express + `vg chunk`, over HTTP |

The page opens on `LocalAPI` and the first `.gbz.db` data source, unless a link
names a view whose graph only a vg server reads and a self-hosted server is
configured. `config.BACKEND_URL` says whether one is: a string (`""` for same
origin) names it, and literal `false` means there is none. `src/App.tsx` reads
it once (`hasSelfHostedServer`).

File → Open switches backends at runtime, between the in-browser reader, a
`ServerAPI` pointed at the vgteam's public backend, and the self-hosted server
when there is one. Nothing below `App` knows which implementation it holds. The
page keeps one `LocalAPI`, so switching back to in-browser mode finds the same
worker and the files uploaded to it.

In development `config-client.js` rewrites `false` to `""` so `pnpm start`
offers the local express backend through the Vite dev server's `/api` proxy; the
`#local` hash opts out of that rewrite. Production gh-pages builds keep `false`.

## Server path

```
ServerAPI ──HTTP──> src/server.mjs ──> vg chunk / vg paths / vg gamsort
```

The express server slices graphs and reads with the real `vg` toolchain and
returns vg-style JSON. It also holds uploads (deleted once unused for
`fileExpirationTime`), serves mounted data directories, and pushes filename
changes over a websocket. This is upstream's design, largely unchanged.

## In-browser path

```
LocalAPI ──Comlink──> Worker ──> GBZBaseAPI ──┬──> @gmod/gbz-base ──> .gbz.db
                                              │     (BlobFile | RemoteFile)
                                              └──> src/api/gam ──> .gam (+.gai)
```

`LocalAPI` is a thin proxy: it wraps a web worker with Comlink so the SQLite
page reads and GAM decoding stay off the main thread. Everything real happens in
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
([urlparams.md](urlparams.md)). There is no router.

`App` turns the current `ViewTarget` into an SWR key and fetches through
whichever `APIInterface` it holds. Fetchers return the _processed_ shape, so
revisiting a view is a cache hit. Starting a fetch aborts the one before it,
whose view is gone, and `LocalAPI` forwards the abort to the worker so that
view's work doesn't run ahead of the view on screen. The GAM reader cancels its
range requests in flight. gbz-base doesn't hand the signal to its page reads, so
a graph query stops at its next step, once the read under way lands. A
whole-file download keeps going, since the next view usually wants the same
file.

## The layout engine

The tube map is inherited from upstream and ported to TypeScript, in two parts:

- **`packages/tubemap-core`**, published as `@gmod/tubemap-core`, is the layout:
  node order, orientation, lanes, read placement and node merging, from input
  nodes and tracks to drawable shapes in layout coordinates, plus the curve and
  node outline path geometry. It has no DOM or d3, so other apps — the JBrowse
  graph genome plugin among them — draw its output their own way. Each
  `layoutTubeMap` call passes its own `LayoutState` through the passes, so calls
  share nothing.
- **`src/util/tubemap.ts`** draws a layout with d3 and handles the interaction.
  It is _not_ a React component: it holds the latest layout and its UI state at
  module level, and `TubeMap.tsx` drives it through `create()` plus a set of
  `setX()` functions, which is why only one tube map can exist per page. It
  keeps the colouring, which the layout asks for through its `trackColor` and
  `trackAlpha` options.

[todo.md](todo.md#the-layout-engine) has the clean-up still to do.

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
`doc/tubemap-cli-samples/`, at default settings.
`src/util/layout.golden.test.ts` pins every shape and node position
`layoutTubeMap` returns for the demo examples and a BRCA1 window with
reverse-strand reads, under each option that takes a different layout path, in
`src/util/layout-golden/`. A refactor that is meant to change nothing leaves
both unchanged; an intended change rewrites the layout files with
`pnpm vitest run -u src/util/layout.golden.test.ts`, and the diff names the
shapes that moved.

## Traps

- `''` is a valid `BACKEND_URL` (same origin), so test for `=== false`, never
  `!config.BACKEND_URL`.
- `config` (`src/config-global.mjs`) is a `Proxy` that reads `globalThis` on
  every access, because the client and server config modules both write it and
  end-to-end tests load both in one process. Don't "simplify" it to
  `export const config = globalThis[GLOBAL_NAME]`: that works in production and
  breaks under test.
