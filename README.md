# seqTubeMaps — MemPanG26 Edition

MemPanG26 Hackathon Team 2 — [Colin Diesh](https://github.com/cmdcolin) &
[Rafeed Rahman Turjya](https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en)
et al.

This is fork of https://github.com/vgteam/sequenceTubeMap with a variety of
improvements including the ability to upload custom data in the browser

Live demo - https://cmdcolin.github.io/sequenceTubeMap/

## Screenshot

![](doc/images/2.png)

## Quickstart

You can load your own "GBZ.db" files and GAM files at
https://cmdcolin.github.io/sequenceTubeMap

Prepare your files once, then open the demo or run locally. Two upstream tools
do all the work — no clone of this repo required:

- [`vg`](https://github.com/vgteam/vg) (bioconda:
  `mamba install -c bioconda vg`)
- [`gbz-base`](https://github.com/jltsiren/gbz-base) (cargo:
  `cargo install gbz-base`) — provides the `gbz2db` binary that builds the
  SQLite index the in-browser WASM consumes

Convert your graph:

```bash
# .xg → .gbz → .gbz.db
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
gbz2db input.gbz input.gbz.db
```

Starting from a GFA (e.g. an HPRC pangenome distribution):

```bash
# .gfa → .gbz → .gbz.db
vg gbwt -G input.gfa --gbz-format -g input.gbz
gbz2db input.gbz input.gbz.db
```

See the bundled "HPRC chrM" example for PanSN region querying. Notes on the
in-progress whole-chromosome HPRC workflow live in
[agent-docs/TODO.md](agent-docs/TODO.md).

Index your reads (optional):

```bash
vg gamsort -i input.sorted.gam.gai input.gam > input.sorted.gam
```

## Navigation

Navigate using `<contig>:<start>-<end>` (e.g. `Circ1:0-1320`). Open the **Paths
in this graph** panel to see available contig names.

## More docs

For headless SVG/PNG rendering via the CLI:
[doc/headless-rendering.md](doc/headless-rendering.md).

For WASM build details and caveats: [doc/wasm-build.md](doc/wasm-build.md).

For constructing deep-link URLs: [doc/linking.md](doc/linking.md).

## License

Copyright (c) 2018 Wolfgang Beyer, 2026 Colin Diesh, MIT License.

## Features added on this fork compared to upstream

- Serverless — graph + GAM parsing runs entirely in the browser; no express
  server to babysit but can be used optionally if needed. Centered on the
  `.gbz.db` SQLite format plus an in-browser GAM + GAM-index parser.
- App-bar GUI — settings on one screen, no scrolling; UI elements hidden when
  not relevant (e.g. BED picker); inline help text.
- Path picker — graphs surface their paths as one-click load buttons, no need to
  hand-type contig names.
- Node labels on sequence nodes, plus hover tooltips for read/path names and
  right-click actions on reads and nodes.
- Experimental headless CLI — emits static SVGs via Node + jsdom
  ([doc/headless-rendering.md](doc/headless-rendering.md)).
- Modernized devtooling — React + TypeScript, React Compiler, MUI AppBar, SWR.
- Ongoing: methods + docs for loading HPRC-scale pangenome subgraphs.
- And more

## Thanks!

Big thanks to the MemPanG26 organizers and group!

![MemPanG26 Edition](https://pangenome.github.io/MemPanG26/images/trippy-bridge.png)

Art from the MemPanG26 flyer :)

https://pangenome.github.io/MemPanG26/

And the original sequenceTubeMap developers!

## Footnote

Claude Code AI was used during this work.

The sequenceTubeMap code has significantly diverged from upstream at this point
but could be upstreamed piecewise or in-whole with dedicated effort

This also tries to parse gbz-base in wasm (webassembly) which uses custom
patches but this might not be accepted by upstream gbz-base project. We can, as
of now, use native gbz-base to generate the files but we use patched version to
parse files. Given this disparity, it might be troublesome and we might need a
different solution in the future
