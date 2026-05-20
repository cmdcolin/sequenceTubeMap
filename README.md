# Sequence Tube Map — MemPanG26 Edition

![MemPanG26 Edition](public/mempang26-badge.svg)

MemPanG26 Hackathon Team 2 — Colin Diesh & [Rafeed Rahman Turjya](https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en)

Modernized fork of [vgteam/sequenceTubeMap](https://github.com/vgteam/sequenceTubeMap) with browser-native WASM — no server needed.

[MemPanG26 demo](https://cmdcolin.github.io/sequenceTubeMap/) | [Upstream demo](https://vgteam.github.io/sequenceTubeMap/)

## Quickstart

Prepare your files once, then open the demo or run locally.

Convert your graph:

```bash
# .xg → .gbz → .gbz.db
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
node scripts/gbz2db.mjs input.gbz input.gbz.db
```

Index your reads (optional):

```bash
./scripts/prepare_gam.sh input.gam   # produces input.gam.gai
```

Run locally:

```bash
npm run start:local
```

Navigate using `<contig>:<start>-<end>` (e.g. `Circ1:0-1320`). Open the **Paths in this graph** panel to see available contig names.

For WASM build details and caveats: [doc/wasm-build.md](doc/wasm-build.md).

## License

Copyright (c) 2018 Wolfgang Beyer, 2026 Colin Diesh, MIT License.
