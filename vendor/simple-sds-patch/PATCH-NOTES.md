# simple-sds-patch

Vendored `simple-sds@0.4.1` with wasm32 fixes. Wired in via
`[patch.crates-io]` by `scripts/build-gbz-base-wasm.sh`.

| Change | Why |
| --- | --- |
| `Cargo.toml`: `default = []` (was `["libc"]`) | wasi-libc has no `mmap`; consumers don't use the `MappedSlice` path |
| `src/serialize.rs`: explicit `Serialize` for `usize` / `Vec<usize>` that read/write 8 bytes via `u64` | the blanket impl writes the native size (4 bytes on wasm32) — incompatible with files written on 64-bit |
| `src/binaries.rs`: `SUFFIXES` uses `pow_sat` (saturating const arithmetic) | `1024^4` and `1024^5` overflow `usize` on 32-bit during const eval |

Drop this directory and the matching `[patch.crates-io]` line if upstream
picks up equivalent fixes.
