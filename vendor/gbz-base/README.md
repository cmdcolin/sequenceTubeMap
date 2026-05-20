# vendor/gbz-base/

This directory holds locally-built `query.wasm` and `gbz2db.wasm` that the
in-browser LocalAPI loads. It overrides the WASMs that come from the
`gbz-base` npm package (which we still depend on for the package metadata,
but whose bundled binaries are pinned to a mid-2024 source snapshot — see
below).

## Why we vendor

Three components have versioned formats that have to line up:

| Component | Source | Reads / writes |
| --- | --- | --- |
| `query.wasm` (loaded by the browser at runtime) | this dir → npm fallback | reads `.gbz.db` |
| `gbz2db.wasm` (run by `scripts/gbz2db.mjs`) | this dir → npm fallback | reads `.gbz`, writes `.gbz.db` |
| `vg gbwt --gbz-format` (writes the input `.gbz`) | external | writes a serialization version |

The npm-bundled WASMs (`gbz-base@0.1.0-alpha.1`) reject `.gbz` files produced
by modern `vg`, and reject `.gbz.db` files produced by the modern
`cargo install gbz-base` CLI. To ingest current pangenome graphs we have to
rebuild the WASMs from a newer gbz-base source — `scripts/build-gbz-base-wasm.sh`
does that and drops the output here.

## Rebuilding

```
./scripts/build-gbz-base-wasm.sh         # builds v0.5 by default
./scripts/build-gbz-base-wasm.sh v0.5    # explicit version
```

See the script header for known issues with current Rust/WASI toolchains.

## Loader resolution

`src/api/wasm/loader.browser.ts` and `loader.node.ts` import
`gbz-base/query.wasm` from the npm package. To switch to the vendored copy,
change those imports to a relative path under this directory. (Not done yet
— flipping it requires the build script to be green first.)
