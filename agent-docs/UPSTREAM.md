# Using the upstream backend instead of the in-browser reader

The gh-pages deploy currently ships with `BACKEND_URL: false` in
`src/config.json`, which selects the `LocalAPI` → `GBZBaseAPI` path. That backend is the
`@gmod/gbz-base` TypeScript reader and it only reads SQLite-backed `.gbz.db`
files. Built-ins that are `.vg.xg` + `.gam` (e.g. the first `snp1kg-BRCA1`
entry) cannot be opened by it and fail with "Not a SQLite database".

The vgteam upstream demo at https://vgteam.github.io/sequenceTubeMap/ avoids
the problem by pointing `BACKEND_URL` at `https://api.tubemap.graphs.vg`,
which runs the real Express server (`src/server.mjs`) with `vg chunk` behind
it. That backend understands `.vg.xg` + `.gam` natively, so BRCA1 + reads
just work.

## How to switch

In `src/config.json`:

```json
"BACKEND_URL": "https://api.tubemap.graphs.vg",
```

`App.tsx:51` keys off `BACKEND_URL === false` (literal), so any string puts
the app into server mode. The URL is composed at `App.tsx:53` as
`${config.BACKEND_URL}/api/v0`.

Once switched, the local-compat filtering and `x.gbz.db` autoload added in
the current changes become dead code — fine to leave for now since they
also help the offline/upload story, but worth removing if we commit fully
to the upstream server.

## Caveats before flipping

- **CORS.** The upstream API has to send
  `Access-Control-Allow-Origin: https://cmdcolin.github.io` (or `*`) for our
  fork to call it. Sanity check:

  ```
  curl -i -H 'Origin: https://cmdcolin.github.io' \
    https://api.tubemap.graphs.vg/api/v0/getFilenames
  ```

- **WebSocket.** `ServerAPI` opens a `ws://`/`wss://` connection to receive
  push notifications when mounted filenames change. Look in
  `src/api/ServerAPI.ts` for how the WS URL is derived from `apiUrl` — if it
  just swaps `http`→`ws`, we'd hit `wss://api.tubemap.graphs.vg/api/v0`, and
  that endpoint also needs to be CORS-permissive and reachable.

- **Uptime / coupling.** Using upstream means our demo dies whenever theirs
  does, and silently changes whenever they redeploy. Acceptable for a fork
  demo, but worth noting in the README.

## Why we still want the in-browser reader

The pure-JS GAM parser (`src/api/gam/`) plus `@gmod/gbz-base` let the
gh-pages deploy show reads on top of a graph without any server at all, and
read whole-chromosome `.gbz.db` files from an object store by range requests
— which is the real win over just proxying upstream. Conversion of `.gbz` to
`.gbz.db` stays offline (`gbz-base construct`, see `doc/gbz-base.md`).

## What was changed in the meantime

Small fixes that keep the in-browser path usable:

- `src/config.json` — added a `"vg \"small\" (WASM-compatible)"` entry
  pointing at `exampleData/x.gbz.db`.
- `src/common.ts` — `isLocalCompatibleDataSource()` helper (graph track ends
  in `.gbz.db` / `.db`).
- `src/App.tsx` — in local mode, default `viewTarget` is the first
  WASM-compatible `DATA_SOURCES` entry instead of an empty target; mode
  toggle to `local` also uses that target.
- `src/components/HeaderForm.tsx` — built-in dropdown hides
  non-WASM-compatible entries when `APIInterface instanceof LocalAPI`.
- `src/api/GBZBaseAPI.ts` — wraps `GBZBase.open` so feeding a `.vg.xg`/`.gbz`
  blob produces a readable error naming the file and the supported format.
