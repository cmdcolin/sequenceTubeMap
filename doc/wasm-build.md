# In-browser gbz-base WASMs

Two WASMs in `vendor/gbz-base/` power the browser-only LocalAPI:

| File | Loaded by | Job |
| --- | --- | --- |
| `query.wasm` | `src/api/wasm/loader.{browser,node}.ts` | read `.gbz.db` at runtime |
| `gbz2db.wasm` | `scripts/gbz2db.mjs` | convert `.gbz` → `.gbz.db` |

Both are checked in, so end users don't need a Rust toolchain. The npm
`gbz-base@0.1.0-alpha.1` bundle rejects modern `.gbz` / `.gbz.db`, hence
the local build.

## TL;DR

```bash
# convert a .gbz for use in local mode (run from repo root)
vg gbwt --xg-name input.xg --index-paths --gbz-format -g out.gbz
node scripts/gbz2db.mjs out.gbz out.gbz.db

# rebuild the WASMs (only when bumping gbz-base version)
./scripts/build-gbz-base-wasm.sh            # v0.5 default; ~5 min cold
```

## Vendor patches

`scripts/build-gbz-base-wasm.sh` injects two `[patch.crates-io]` entries
into the temp build's `Cargo.toml`:

| Patch dir | Fixes |
| --- | --- |
| [`vendor/simple-sds-patch/`](../vendor/simple-sds-patch/PATCH-NOTES.md) | drop `libc` default (no wasi `mmap`); serialize `usize` as 8 bytes; saturating const arithmetic so `1024^4` doesn't overflow 32-bit `usize` |
| [`vendor/gbz-patch/`](../vendor/gbz-patch/PATCH-NOTES.md) | `usize` → `u64` in `#[repr(C)]` payload structs so wasm32 (4-byte `usize`) reads them with the right offsets |

The build script also sets `CC_wasm32_wasip1` / `AR_wasm32_wasip1` /
`CFLAGS_wasm32_wasip1` for `cc-rs` (upstream uses the older
`CC_wasm32_wasi` name).

To drop a patch: delete its `vendor/` dir and remove the matching
`[patch.crates-io]` line in the build script. Each patch dir's notes
describe what to look for upstream.

## Caveats

- **Region syntax is `<contig>:<start>-<end>`.** Contig names match GBZ
  reference paths (e.g. `Circ1`). The "Paths in this graph" panel lists
  them (via `sql.js` on the `.gbz.db`).
- **Path lengths in that panel are approximate** — derived from
  `MAX(ReferenceIndex.path_offset)`, off by up to one node.
- **Haplotype labels read `unknown#N#unknown[...]`** when the source
  paths weren't already in `sample#haplotype#contig` form. Cosmetic; the
  contig (queryable) name is correct. Use `vg gbwt --path-regex` /
  `--path-fields` if you need real haplotype metadata.
- **Bumping the WASMs requires regenerating every checked-in `.gbz.db`**
  (`query.wasm` rejects older DB schema versions).

## Follow-ups

- Upstream the two patches as PRs to [`jltsiren/simple-sds`](https://github.com/jltsiren/simple-sds) and [`jltsiren/gbwt-rs`](https://github.com/jltsiren/gbwt-rs).
- Ask [`jltsiren/gbz-base`](https://github.com/jltsiren/gbz-base) for a v0.5 npm release.
- Bump WASI SDK 20 → 22+ (untested).
- Run `gbz2db.wasm` client-side so the upload picker accepts raw `.gbz`,
  not just `.gbz.db`.
