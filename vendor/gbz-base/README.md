# vendor/gbz-base/

Locally-built `query.wasm` and `gbz2db.wasm` for the browser-only
LocalAPI. Built by `scripts/build-gbz-base-wasm.sh`; see
[`doc/wasm-build.md`](../../doc/wasm-build.md) for details.

Loaders that resolve these:

- `src/api/wasm/loader.browser.ts` — webpack URL import (`query.wasm`)
- `src/api/wasm/loader.node.ts` — node/vitest fs read (`query.wasm`)
- `scripts/gbz2db.mjs` — Node CLI runner (`gbz2db.wasm`)
