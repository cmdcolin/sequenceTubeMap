# gbz-base patch — preserve PanSN path names in subgraph output

Forked from upstream gbz-base v0.5 (https://github.com/jltsiren/gbz-base).
Built into `vendor/gbz-base/query.wasm` and `gbz2db.wasm` via
`scripts/build-gbz-base-wasm.sh`.

## What this changes

Upstream gbz-base anonymizes every non-reference path in `Subgraph::write_gfa`
and `Subgraph::write_json` (see `src/subgraph.rs:1809` and `:1870` upstream,
plus the comment at `:44`: *"Other paths remain anonymous, as we cannot
identify them efficiently using the GBWT"*). The result is that anything
outside the queried reference comes out as `unknown#N#contig`, which is
useless for HPRC-style visualization where the *whole point* is to see which
sample contributed which haplotype.

This patch adds the missing identification step. `PathInfo` now carries the
GBWT `start_pos` of each extracted path, and a new `Subgraph::resolve_path_names`
(GBZ-backed) / `resolve_path_names_db` (DB-backed) pair walks each path
backward through the GBWT until it lands on a known sequence start, then
looks up the real PanSN `FullPathName` from the GBWT metadata (or the
SQLite `Paths` table for `.gbz.db`). The JSON / GFA writers prefer the
resolved name and only fall back to `unknown#N#contig` when resolution
truly fails (no metadata, non-bidirectional GBWT, etc.).

The `bin/query.rs` driver now calls the appropriate resolver after
`Subgraph::from_gbz` / `Subgraph::from_db`. With `--distinct`, the first
member of each cluster wins the name, and the existing `weight` field
communicates how many samples share it.

## Files changed vs upstream v0.5

* `src/subgraph.rs`
  - `PathInfo`: added `start_pos: Option<Pos>` and `path_name: Option<FullPathName>`.
  - Hand-rolled `Ord` (the new `Option<FullPathName>` field doesn't derive it; the existing `distinct_paths` only sorts by `path`).
  - `extract_paths`: store the starting `Pos` when constructing each `PathInfo`.
  - `distinct_paths`: carry the first cluster member's `start_pos` into the merged `PathInfo`.
  - New `Subgraph::resolve_path_names(&GBZ)` — backward-walk + endmarker reverse lookup against in-memory GBWT metadata.
  - New `Subgraph::resolve_path_names_db(&mut GraphInterface)` — same algorithm but loads BWT records on demand via SQLite.
  - `write_json` / `write_gfa`: prefer `path_name` over `WalkMetadata::anonymous` when present.

* `src/db.rs`
  - `GraphInterface`: added an `all_paths` prepared statement and a public `all_paths()` method so `resolve_path_names_db` can enumerate every path's `(fw_start, rev_start, handle)` tuple in one pass.

* `src/bin/query.rs`
  - Both branches now call the relevant `resolve_path_names*` after the subgraph is built.

## Why we vendor the whole tree

Earlier the build script downloaded `gbz-base-v0.5.tar.gz` into `tmp/` and
applied vendored crate patches via `[patch.crates-io]`. That works for tiny
edits but our changes here touch real source files. Carrying the full
source in `vendor/gbz-base-patch/` is simpler to diff and review, and the
`.cargo/config.toml` clearing native CPU targeting is part of the fork.

The companion `simple-sds` and `gbz` patches still live at
`vendor/simple-sds-patch/` and `vendor/gbz-patch/` and are referenced via
`[patch.crates-io]` in `vendor/gbz-base-patch/Cargo.toml`.
