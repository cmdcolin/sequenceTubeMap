# Sequence Tube Map — MemPanG26 Edition

MemPanG26 Hackathon Team 2 — Colin Diesh &
[Rafeed Rahman Turjya](https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en)

Updated fork of https://github.com/vgteam/sequenceTubeMap with a variety of
improvements including the ability to upload custom data in the browser

Live demo - https://cmdcolin.github.io/sequenceTubeMap/

## Screenshot

![](img/1.png)

## Quickstart

You can load your own "GBZ.db" files and GAM files at
https://cmdcolin.github.io/sequenceTubeMap

Prepare your files once, then open the demo or run locally.

Convert your graph:

```bash
# .xg → .gbz → .gbz.db
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
node scripts/gbz2db.mjs input.gbz input.gbz.db
```

Starting from a GFA (e.g. an HPRC pangenome distribution):

```bash
# .gfa → .gbz → .gbz.db
vg gbwt -G input.gfa --gbz-format -g input.gbz
node scripts/gbz2db.mjs input.gbz input.gbz.db
```

PanSN-named paths (`sample#haplotype#contig`) are queried as
`sample#contig:start-end` in the Region field — see the bundled
"HPRC chrM" example.

Whole-chromosome HPRC graphs are large (chr20 is ~130 MB as a .gbz.db).
To bundle a small browseable slice instead, chunk with `vg chunk -T` to
preserve the haplotype walks, then rebuild:

```bash
# Extract ~100kb around a region, keeping haplotype threads
vg chunk -x input.gbz -p "GRCh38#0#chr20:1000000-1100000" -c 20 -T -O gfa \
  | vg convert -f - > slice.gfa
vg gbwt -G slice.gfa --gbz-format -g slice.gbz
node scripts/gbz2db.mjs slice.gbz slice.gbz.db
```

Index your reads (optional):

```bash
./scripts/prepare_gam.sh input.gam   # produces input.gam.gai
```

## Navigation

Navigate using `<contig>:<start>-<end>` (e.g. `Circ1:0-1320`). Open the **Paths
in this graph** panel to see available contig names.

## More docs

For WASM build details and caveats: [doc/wasm-build.md](doc/wasm-build.md).

For constructing deep-link URLs: [doc/linking.md](doc/linking.md).

## License

Copyright (c) 2018 Wolfgang Beyer, 2026 Colin Diesh, MIT License.

## Footnote

Claude Code AI was used during this work. Note that the code has significantly
diverged from upstream at this point due to being insane hackathon quality
agentic coding but could be upstreamed piecewise or in whole with effort

## Features added on this fork compared to upstream

- **Serverless/static** — runs entirely in-browser via gbz-base WASM; upload
  `.gbz.db` and `.gam.gai` files directly, nothing leaves your machine
- **Read/node filtering** — right-click reads or nodes to build a staged filter
  set; named read groups with custom palette coloring
- **Node labels** — configurable color palette per node, track legend panel
- **Fit-to-height zoom** preserved across re-renders; performance improvements
  for large graphs
- **Modernized stack** — CRA → custom webpack setup, class → function
  components, React Compiler, full TypeScript, MUI AppBar header, SWR

## Thanks!

Big thanks to the MemPanG26 organizers and group!

![MemPanG26 Edition](https://pangenome.github.io/MemPanG26/images/trippy-bridge.png)

https://pangenome.github.io/MemPanG26/
