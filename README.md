# seqTubeMaps — MemPanG26 Edition

A fork of [vgteam/sequenceTubeMap](https://github.com/vgteam/sequenceTubeMap)
that draws pangenome graphs and reads over them as tube maps, in the browser.
This edition adds in-browser reading of `.gbz.db` files, uploads, and a
modernised React/TypeScript UI.

Live demo — https://cmdcolin.github.io/sequenceTubeMap/

MemPanG26 Hackathon Team 2 — [Colin Diesh](https://github.com/cmdcolin) &
[Rafeed Rahman Turjya](https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en)
et al.

[![HPRC v2.1 chr20 microsatellite](doc/images/hprc-v2.1-chr20-str.png)][demo-chr20]

All 464 haplotypes of HPRC release 2.1 through a CT microsatellite on chr20, one
rung of the staircase per repeat length. The browser reads them straight off
HPRC's 10 GB hosted `.gbz.db` by range requests, with no server.

## Loading data

Use **File → Open…**, or pick a dataset from the **Examples** menu.

|                             | Where the work happens  | Size limit    | Setup needed                  |
| --------------------------- | ----------------------- | ------------- | ----------------------------- |
| **vgteam server** (default) | `api.tubemap.graphs.vg` | 5 MB per file | none                          |
| **In-browser**              | your browser            | none          | one-time `.gbz.db` conversion |
| **Self-hosted server**      | your machine            | none          | Docker or a local checkout    |

The servers take `.xg`, `.vg` and `.gbz` graphs and `.gam` reads directly. The
in-browser mode needs a graph converted to `.gbz.db` first, and reads a hosted
one by range requests, so a whole-pangenome graph browses without a download.
[Loading your own data](doc/data.md) covers all three.

## Reads over a graph

GAM alignments drawn along the graph they align to; red reads are on the reverse
strand. A coarsened view collapses them into one band per edge, weighted by read
count.

[![BRCA1 reads](doc/images/brca1-reads.png)][demo-reads]

## Navigating and sharing

Type `<contig>:<start>-<end>` (e.g. `Circ1:0-1320`) in the region box, or open
**Paths in this graph** to browse the contigs a graph contains. `chr1:1000+500`
and `node:42-55` also work. The URL carries the data, region and view options,
so any tube map can be shared as a link — see
[URL parameters](doc/urlparams.md).

## Headless rendering

`pnpm tubemap-cli` renders any source and region to SVG without a browser, which
is how every figure here was made —
[headless SVG rendering](doc/headless-rendering.md).

## Docs

- [doc/intro.md](doc/intro.md) — what a sequence graph is and how a tube map
  draws one
- [doc/gallery.md](doc/gallery.md) — more figures, each linked into the live
  demo
- [doc/data.md](doc/data.md) — the three ways to load a graph and its reads
- [doc/urlparams.md](doc/urlparams.md) — every parameter a link can carry
- [doc/headless-rendering.md](doc/headless-rendering.md) — `pnpm tubemap-cli`
  and its options
- [doc/server-data.md](doc/server-data.md) — data paths, Examples entries and
  pre-extracted subgraphs on a self-hosted server
- [doc/tabix.md](doc/tabix.md) — whole-pangenome browsing from tabix indexes
- [docker/README.md](docker/README.md) — running the server in Docker
- [doc/architecture.md](doc/architecture.md) — how a region becomes a drawn tube
  map
- [doc/gbz-base.md](doc/gbz-base.md) — the in-browser `.gbz.db` reader
- [doc/differences-from-upstream.md](doc/differences-from-upstream.md) — what
  changed from vgteam/sequenceTubeMap
- [doc/development.md](doc/development.md) — setup, dev server, tests, build
- [agent-docs/architectural-decision-records/](agent-docs/architectural-decision-records/)
  — why the code is shaped the way it is

## Thanks

Big thanks to the [MemPanG26](https://pangenome.github.io/MemPanG26/) organizers
and group, and to the original sequenceTubeMap developers!

_Claude Code AI was used during this work._

[demo-chr20]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=HPRC%20v2.1%20whole%20genome%20(gbz-base%2C%20URL-hosted)&region=GRCh38%23chr20:48000600-48001000
[demo-reads]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-1000&vis=compressedView
