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

All 464 haplotypes of
[HPRC release 2.1](https://doi.org/10.64898/2026.07.21.739710) through a CT
microsatellite at `chr20:48,000,600-48,001,000`, on 240 distinct routes: 46
allele lengths from 608 to 680 bp. Each rung of the staircase is a haplotype
leaving the repeat one copy earlier than its neighbour. The browser reads the
figure straight off HPRC's 10 GB hosted `.gbz.db` by range requests, with no
server, and names each haplotype from the companion haplotype index beside it —
the haplotype through any node is `HG01243#2#…`, not `unknown#57`.

The same locus about 300 bp to the right, where the haplotypes are back in
register:

[![HPRC v2.1 chr20 haplotypes in register](doc/images/hprc-v2.1-chr20-register.png)][demo-chr20]

Both figures are crops of one drawing, which the app lays out end to end and
lets you scroll.

## What a tube map shows

A sequence graph encodes many related sequences — individuals of one species, or
homologous sequences across species — in one structure, so their shared
stretches and their differences are easy to find. It has two parts:

- A **node** is a stretch of bases; its length sets its drawn width.
- A **path** is one of the underlying sequences, walking through a series of
  nodes.

Two paths over the same three nodes spell the same sequence:

![Two paths through three nodes](doc/images/example1.png)

Where the sequences differ, the paths part around a bubble:

![Two paths diverging in the middle](doc/images/example2.png)

An inversion is one node traversed in both directions rather than two nodes:

![A node traversed in both directions](doc/images/example3.png)

General graph tools such as Graphviz or d3's force layouts draw nodes joined by
edges, with no notion of a path running through many nodes or of a node's
orientation. The tube map lays out paths as lines on a transit map and draws
them with d3.

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

GAM alignments across the snp1kg BRCA1 graph. Red marks reads whose every node
visit is on the reverse strand; a read in mixed orientation is drawn forward, in
blue:

[![BRCA1 reads](doc/images/brca1-reads.png)][demo-reads]

The link carries the View menu's compressed node widths as well as the region.
The browser subsamples to 100 reads to stay responsive; the banner above the map
raises that.

The coarsened (Sankey) view collapses per-read ribbons into one band per
node-to-node edge, scaled by how many reads traverse it, so rendering is
O(edges) rather than O(reads). Allele balance at each bubble becomes readable at
a glance:

[![BRCA1 reads, coarsened](doc/images/brca1-reads-coarsened.png)][demo-coarsened]

## Navigating and sharing

Type `<contig>:<start>-<end>` (e.g. `Circ1:0-1320`) in the region box, or open
**Paths in this graph** to browse the contigs a graph contains. `chr1:1000+500`
and `node:42-55` also work. The URL carries the data, region and view options,
so any tube map can be shared as a link — see
[URL parameters](doc/urlparams.md).

[![The app with BRCA1 reads loaded](doc/images/1.png)][demo-brca1]

## Headless rendering

`pnpm tubemap-cli` renders any source and region to SVG without a browser, which
is how every figure here but the app screenshot was made —
[headless SVG rendering](doc/headless-rendering.md).

## Docs

- [doc/data.md](doc/data.md) — the three ways to load a graph and its reads,
  building a `.gbz.db`, naming haplotypes, region syntax
- [doc/server.md](doc/server.md) — running the server in Docker or from a
  checkout, its data directory, pre-extracted chunks, tabix indexes
- [doc/urlparams.md](doc/urlparams.md) — every parameter a link can carry
- [doc/headless-rendering.md](doc/headless-rendering.md) — `pnpm tubemap-cli`
  and its options
- [doc/differences-from-upstream.md](doc/differences-from-upstream.md) — what
  changed from vgteam/sequenceTubeMap
- [doc/development.md](doc/development.md) — setup, dev server, checks, build
- [doc/architecture.md](doc/architecture.md) — how a region becomes a drawn tube
  map
- [doc/todo.md](doc/todo.md) — unfinished work

## Thanks

Big thanks to the [MemPanG26](https://pangenome.github.io/MemPanG26/) organizers
and group, and to the original sequenceTubeMap developers!

_Claude Code AI was used during this work._

[demo-brca1]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-100
[demo-chr20]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=HPRC%20v2.1%20whole%20genome%20(gbz-base%2C%20URL-hosted)&region=GRCh38%23chr20:48000600-48001000
[demo-reads]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-1000&vis=compressedView
[demo-coarsened]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-1000&vis=compressedView,coarsenedReadView
