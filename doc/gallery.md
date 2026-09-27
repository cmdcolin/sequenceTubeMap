# Gallery

Every figure below links to the same data and region in the live demo. The view
is a URL, so any tube map you reach can be shared as one
([every parameter a link can carry](urlparams.md)).

## A pangenome, not a reference

All 464 haplotypes of
[HPRC release 2.1](https://doi.org/10.64898/2026.07.21.739710) through a CT
microsatellite at `chr20:48,000,600-48,001,000`, on 240 distinct routes: 46
allele lengths from 608 to 680 bp. Each rung of the staircase is a haplotype
leaving the repeat one copy earlier than its neighbour. The browser reads the
figure straight off HPRC's 10 GB hosted `.gbz.db` by range requests, with no
server, and names each haplotype from the companion haplotype index beside it —
the haplotype through any node is `HG01243#2#…`, not `unknown#57`.

![HPRC v2.1 chr20 microsatellite](images/hprc-v2.1-chr20-str.png)

The same locus about 300 bp to the right, where the haplotypes are back in
register:

![HPRC v2.1 chr20 haplotypes in register](images/hprc-v2.1-chr20-register.png)

[Open chr20:48,000,600-48,001,000 in the live demo][demo-chr20]. Both figures
are crops of that one drawing, which the app lays out end to end and lets you
scroll.

## Reads over a graph

GAM alignments across the snp1kg BRCA1 graph. Red marks reads whose every node
visit is on the reverse strand; a read in mixed orientation is drawn forward, in
blue:

![BRCA1 reads](images/brca1-reads.png)

[Open BRCA1 17:1-1000 in the live demo][demo-reads]. The link carries the View
menu's compressed node widths as well as the region. The browser subsamples to
100 reads to stay responsive; the banner above the map raises that.

## The same reads, coarsened

The Sankey view collapses per-read ribbons into one band per node-to-node edge,
scaled by how many reads traverse it, so rendering is O(edges) rather than
O(reads). Allele balance at each bubble becomes readable at a glance:

![BRCA1 reads, coarsened](images/brca1-reads-coarsened.png)

[Open the coarsened view in the live demo][demo-coarsened]

## The app

The region box, the paths panel, and the subsampling banner over a BRCA1 read
pileup:

[![The app with BRCA1 reads loaded](images/1.png)][demo-brca1]

`pnpm tubemap-cli` produced every figure above except the app screenshot — see
[headless SVG rendering](headless-rendering.md).

[demo-brca1]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-100
[demo-chr20]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=HPRC%20v2.1%20whole%20genome%20(gbz-base%2C%20URL-hosted)&region=GRCh38%23chr20:48000600-48001000
[demo-reads]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-1000&vis=compressedView
[demo-coarsened]:
  https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-1000&vis=compressedView,coarsenedReadView
