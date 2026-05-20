# Using the upstream backend instead of WASM

The gh-pages deploy currently ships with `BACKEND_URL: false` in
`src/config.json`, which selects the `LocalAPI` → `GBZBaseAPI` → WASM path.
That backend is `gbz-base/query.wasm` and it only reads SQLite-backed
`.gbz.db` files. Everything built-in except `x.gbz.db` is `.vg.xg` + `.gam`,
so picking `snp1kg-BRCA1` on gh-pages parses an empty WASM stdout as JSON
and explodes.

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

Once switched, the WASM-compat filtering and `x.gbz.db` autoload added in
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

## Why we might still want WASM

The other agent is working on a pure-JS GAM parser. Combined with
`gbz-base/query.wasm` (and `gbz2db.wasm` for in-browser `.gbz` → `.gbz.db`
conversion, already in `node_modules/gbz-base/` but currently unused), that
would let the gh-pages deploy show reads on top of a graph without any
server at all — which is the real win over just proxying upstream.

If/when that lands:

- `GBZBaseAPI.getChunkedData` would populate `gam` instead of returning
  `gam: []` (line 250).
- We could add a BRCA1 `.gbz.db` to `exampleData/` (offline `vg gbwt` →
  `gbz2db`) and point the WASM-default data source at it, so the live demo
  matches the upstream demo content.

## What was changed in the meantime

Small fixes to keep the WASM path usable while the GAM work is in flight:

- `src/config.json` — added a `"vg \"small\" (WASM-compatible)"` entry
  pointing at `exampleData/x.gbz.db`.
- `src/common.ts` — `isLocalCompatibleDataSource()` helper (graph track ends
  in `.gbz.db` / `.db`).
- `src/App.tsx` — in local mode, default `viewTarget` is the first
  WASM-compatible `DATA_SOURCES` entry instead of an empty target; mode
  toggle to `local` also uses that target.
- `src/components/HeaderForm.tsx` — built-in dropdown hides
  non-WASM-compatible entries when `APIInterface instanceof LocalAPI`.
- `src/api/GBZBaseAPI.ts` — wraps `JSON.parse(stdout)` so feeding a
  `.vg.xg`/`.gbz` blob produces a readable error including the trailing
  WASM stderr instead of `JSON.parse: unexpected end of data`.
