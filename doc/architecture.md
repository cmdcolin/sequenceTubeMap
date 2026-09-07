# Architecture

How a region in the URL bar becomes a drawn tube map.

## The two backends

Everything that fetches data goes through `APIInterface`
(`src/api/APIInterface.ts`). There are two implementations, and which one is
live is decided once, at startup, by `config.BACKEND_URL`:

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
`false`. See
[ADR 0004](../agent-docs/architectural-decision-records/0004-api-selection.md).

## Server path

```
ServerAPI ──HTTP──> src/server.mjs ──> vg chunk / vg paths / vg gamsort
```

The express server slices graphs and reads with the real `vg` toolchain and
returns vg-style JSON. It also holds uploads (deleted on a cron), serves mounted
data directories, and pushes filename changes over a websocket. This is
upstream's design, largely unchanged.

## In-browser path

```
LocalAPI ──Comlink──> Worker ──> GBZBaseAPI ──┬──> @gmod/gbz-base ──> .gbz.db
                                              │     (BlobFile | RemoteFile)
                                              └──> src/api/gam ──> .gam (+.gai)
```

`LocalAPI` is a thin proxy: it wraps a web worker with Comlink so the SQLite
page reads and GAM decoding stay off the main thread
([ADR 0005](../agent-docs/architectural-decision-records/0005-comlink-worker.md)).
Everything real happens in `GBZBaseAPI` (`src/api/GBZBaseAPI.ts`):

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
that stand in for `trackFile` paths.

See [gbz-base.md](gbz-base.md).

## Frontend

```
urlViewTarget ──> App ──> HeaderForm        (choose data + region)
                    └──> TubeMapContainer   (SWR fetch, then render)
                            └──> TubeMap ──> src/util/tubemap.ts (d3)
```

A **`ViewTarget`** — tracks, region, BED file, data type — is the unit of
navigation. `src/urlViewTarget.ts` parses one out of the query string and
serializes it back, which is what makes every view linkable
([linking.md](linking.md)). There is no router
([ADR 0001](../agent-docs/architectural-decision-records/0001-no-router.md)).

`TubeMapContainer` turns the current `ViewTarget` into an SWR key and fetches
through whichever `APIInterface` it was given. Fetchers return the _processed_
shape, so revisiting a view is a cache hit and cancellation is implicit
([ADR 0007](../agent-docs/architectural-decision-records/0007-swr-for-async.md)).

`src/util/tubemap.ts` is the layout and drawing engine, inherited from upstream
and ported to TypeScript. It computes node order, assigns lanes, places reads,
and draws with d3. It is _not_ a React component: it holds module-level state
and is driven by `create()` plus a set of `setX()` functions that `TubeMap.tsx`
calls. That is the largest remaining piece of technical debt — it means only one
tube map can exist per page — and is tracked in `src/util/tubemap-phase2.md`.

## Conventions worth knowing

- React Compiler is on; manual `useMemo`/`useCallback`/`React.memo` is treated
  as a smell
  ([ADR 0002](../agent-docs/architectural-decision-records/0002-react-compiler.md)).
- MUI for inputs and dialogs, reactstrap for layout only
  ([ADR 0003](../agent-docs/architectural-decision-records/0003-mui-for-inputs.md)).
- `config` is a Proxy that reads `globalThis` on every access, so the client and
  server config modules can both write it in one process
  ([ADR 0006](../agent-docs/architectural-decision-records/0006-config-proxy.md)).
