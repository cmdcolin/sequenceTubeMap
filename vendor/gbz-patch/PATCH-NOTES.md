# gbz-patch

Vendored `gbz@0.6.1` with `usize` → `u64` in the `#[repr(C)]` Payload
structs (and matching `as usize` / `as u64` casts at the accessor /
mutator sites). Wired in via `[patch.crates-io]` by
`scripts/build-gbz-base-wasm.sh`.

## Why

`Header<T>` is `Serializable` (raw `mem::size_of` byte copy). Payloads
hold `usize` fields:

- `GBWTPayload` — sequences, size, offset, alphabet_size
- `MetadataPayload` — sample_count, haplotype_count, contig_count
- `SequencesPayload` — nodes

On 64-bit hosts (where `.gbz` is written) these pack to 32/24/8 bytes;
on wasm32 (`usize` = 4 bytes) they pack to 16/12/4. Raw-byte copy of
the 64-bit layout into the 32-bit struct misaligns every field after
the first `usize` — including the `flags` field that gates the
SIMPLE_SDS check. Symptom: spurious "SDSL format is not supported" on
any valid modern `.gbz`. Switching to `u64` makes the layout identical
on both targets.

## Maintenance

Drop this directory and the `[patch.crates-io]` line if upstream adds
a portable `Serialize` impl for `Header<T>` (or otherwise removes the
`usize`-layout dependence).
