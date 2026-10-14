---
name: encodings-and-facets
description:
  How the viewer encodes, layers and facets a tube map: draw-time encoding, the
  topology/placement split, layers, and read and haplotype facets. Read before
  touching src/util/encoding.ts, src/util/scales.ts, or tubemap-core's
  layoutTopology, placeTubeMap and placeFacets.
---

# Encodings, layers and facets

The open work on this thread is in
[todo/encodings-as-layers.md](../todo/encodings-as-layers.md).

## Draw-time encoding

The legend doesn't restate the renderer. `src/util/scales.ts` holds scale
objects that each color a drawn track and key their own legend rows from the
tracks they colored, so a value nothing in view takes gets no row.
`src/util/encoding.ts` projects each layout track onto the variables the scales
read (`DrawnTrack`: mark, strand, mapping quality, group, share) and lays the
aesthetic mapping out as a table, `encodingFor`: one `{ color, alpha }` entry
per mark. A small spec, `Coloring.read`
(`{ color: 'group' | 'mapq' | 'strand', alpha?: 'mapq' }`), picks the read
entry; `readEncodingFrom` derives it from the View menu's flags (read groups
over mapping quality over strand, bands apart), which the `vis=` URL parameter
still holds. The renderer's colorer and `legendSections` both read the table,
and the renderer reports the projected tracks it placed, so the key can't
disagree with the picture.

The renderer applies the encoding at draw time. Each layout shape holds only its
track's `id`; `src/util/tubemap.ts` paints each from that track's `DrawnTrack`
and reuses the latest layout while its inputs and options are unchanged, so a
recolor costs a redraw but no layout. Turnaround rectangles and corners take
their track's opacity like every other shape.

## The two-phase layout

`layoutTubeMap` in [tubemap-core](https://github.com/GMOD/tubemap-core)'s
`layout.ts` composes two exported phases. `layoutTopology` merges, orders and
orients the nodes, sizes them and fixes their x. `placeTubeMap` lays out the
topology's haplotypes and the reads its filters keep: lanes, read stacking,
`adjustVertically` and shapes. A caller can run the topology once and place it
several times, and every placement keeps the same node order and x.

The topology reads every visible haplotype and every primary read, unfiltered.
Reads can't stay out of it: `generateNodeOrder` orders a node only reads reach
from those reads, `mergeNodes` must not merge across an edge only a read takes,
and reads vote in `switchNodeOrientation`. A haplotype-only topology would drop
read-only nodes and move every default view with reads. The mapping-quality and
focus filters now run at placement, so they no longer change how nodes merge or
order. A node only filtered-out reads visit keeps its place, drawn empty, and
secondary alignments still drop at the input. Hiding a haplotype stays a
topology input, since the reference straightens around the first visible track.

The topology holds x too, but x needs a placement: `calculateExtraSpace` sizes
each gap from the turns and slopes of placed tracks. So `layoutTopology`
measures x from placing every track and read under its options, which is why
`trackWidth`, the layers and `ignoreStrand` are `TopologyOptions` although they
leave node order alone. A filter then changes no x. When the filters keep every
read, `placeTubeMap` returns that measuring placement, so a default view still
places once; a filtered view places twice.

The renderer caches both phases. `layOut()` in `src/util/tubemap.ts` keys the
topology on the inputs and `TopologyOptions` and the placement on that topology
and `PlacementOptions`, so a mapping-quality or focus change costs a placement
only and a color change costs neither. Above the read render limit, the
container subsamples the reads outside the JSX, where the React Compiler keys
the subsample on the reads, the limit and `coarsenedReadView`; inline in the
`<TubeMap>` element it shared that element's scope, so any View menu change
handed the renderer a new array and missed both caches.

No golden shows filter-dependent topology: the `brca1.mapq-500` golden's reads
cross three nodes with nothing to merge. A test in tubemap-core's
`layout.test.ts` pins the behavior instead, with a read whose filtered-out edge
keeps a node from merging.

## Layers

`TopologyOptions.layers` in tubemap-core's `layout.ts` lists the track sets
placement draws, each with an optional stat:

```ts
layers: [{ data: 'haplotypes', stat: 'coarsen' }, { data: 'reads' }]
```

`coarsen` is the only stat. On the haplotypes it bands every haplotype but the
reference, which keeps its lane and the ruler; on the reads it bands the reads.
Banded haplotypes join the read overlay, and `placeReads` stacks one set per
layer and source file in every node, haplotype bands first, so the reads sit
under the bands and `adjustVertically3` pushes lower nodes clear of both. When
`layers` is unset, `layersFrom` turns `coarsenedReadView` into the old either/or
(the reads, or the haplotypes when no reads were loaded), so every earlier
golden held byte for byte and the topology no longer has a `hasReads` field.

Each banded layer reports its own `Coarsening` in `layout.coarsened`, keyed by
data. Haplotype bands take ids from `COARSENED_ID_BASE` and read bands follow
them, so one `coarsenedEdgeMeta` labels both without collisions; a read band's
id therefore shifts when the haplotypes band too. Each layer sizes its bands on
its own scale, so a two-read band can draw as wide as an eight-haplotype one
([shared-band-scale](../ideas/waiting-on-a-call/shared-band-scale.md)).

The View menu's "Band haplotypes (Sankey)" sets `coarsenedHaplotypeView`
(`vis=coarsenedHaplotypeView`, `--banded-haplotypes` in the CLI), which asks
`layOut()` in `src/util/tubemap.ts` for a banded haplotype layer over the reads,
banded as well under `coarsenedReadView`. The legend keys every drawn track by
mark and source, so the graph's section shows the share ramp and the read file's
its strand, mapping-quality or band rows. The node dialog leaves out read counts
once any layer bands, since its nodes then hold bands. Goldens
`example-6.banded-haplotypes` and `example-6.banded-haplotypes-and-reads` pin
the combination; the other datasets with reads have one haplotype, so their new
files point at older ones.

## Facets

`placeFacets` in tubemap-core's `layout.ts` places one topology once per subset
of its tracks and reads and stacks the placements top to bottom. `facetReads`
splits the reads the mapping-quality and focus filters keep by a read field
(`ReadFacetBy`: `read_group` or `sample_name`), one subset per value in sort
order and the reads lacking one last. `PlacementOptions.facet` (`{ by, key }`,
plain JSON, so the renderer's placement cache still keys on `JSON.stringify`)
has `placeTubeMap` place one subset. Every panel draws every haplotype, under
the topology's layers, at the topology's x, so panels line up in x exactly;
lanes, node heights and `adjustVertically` follow each panel's own reads. Read
band ids run on from one panel to the next, so they stay unique across the
stack; haplotype bands repeat in every panel under the same ids and shares.

Each panel keeps its own coordinates and has an `offsetY`: the first sits where
an unfaceted placement draws, and each later one starts `FACET_GAP` below the
panel above plus `FACET_LABEL_HEIGHT` for its label. `FacetedLayout.bounds`
covers the stack and the first label. The offsets stay out of the shapes because
baking them in would mean rewriting corner path strings and merging node arrays
that tracks index by position; instead `src/util/tubemap.ts` draws each panel in
a `<g class="facet">` translated by its offset, under one zoom. An unfaceted
view, or one with no reads left to split, is one panel of `placeTubeMap`'s
layout drawn straight into the drawing, so its DOM and every earlier golden stay
as they were.

Per panel the renderer draws the label (`Read group A · 12 reads`), tracks, node
outlines, sequence text, mismatches and node labels, since node heights and read
stacking differ by panel. The ruler draws once, above the first label, from the
first panel's layout: x is shared. The legend keys each drawn track once, by id,
so a haplotype repeated in every panel adds one row, not one per panel, and
paints resolve by id because a repeated track has one paint. One legend covers
the stack, since colors don't vary by panel. A node click reports the counts of
the panel clicked, found from the clicked node object; hovering a haplotype
highlights it in every panel. Node outline ids repeat across panels. A facet
change places again on the cached topology, and a color change does neither.

The View menu's **Facet by** (none, read group, read sample, haplotype sample)
sets `facetBy`, which the `facet=` URL parameter holds beside `mapq=`, since
`vis=` holds only on/off flags; the CLI takes `--facet-by`. No bundled alignment
file has more than one read group or sample, so the goldens
(`example-6.facet-*`) give example 6's reads made-up ones, and
`exampleData/hprc-chrM-3samples.sorted.gam`, reads simulated from three HPRC
samples' chrM haplotypes, backs the figures in `doc/images/facets-*.png`.

Panel labels sit in a `g.facet-label-group` that the zoom counter-scales like
node labels, capped at 2.5 so a label never crosses the rule above it, and
`svgExport` drops the scale for a figure. A node's right-click menu lists only
the reads the clicked panel holds (`facetHoldsRead`), still from the unfiltered
input.

## Haplotype facets

`facetBy: 'haplotype_sample'` splits the haplotypes by the sample in their PanSN
names. `parsePanSN` in tubemap-core's `panSN.ts` reads `sample#haplotype#contig`
(further `#` fields allowed) and names no sample for anything else: fewer than
three fields, an empty sample or contig, a haplotype that isn't a whole number,
or gbz-base's placeholder samples `_gbwt_ref` and `unknown`. `facetHaplotypes`
makes one subset per sample in sort order, then one (`key: null`) for the
haplotypes with no PanSN sample, each holding the reference: track 0, which the
topology straightened, and the ruler's track when that is another. The reference
takes no panel of its own. With no haplotype beside the reference nothing
splits, and the view is one unfaceted panel.

`Facet` is a union: `ReadFacet` (`{ by, key }`) and `HaplotypeFacet`, which is
`{ by: 'haplotype_sample', key }` or `{ by: 'haplotype_sample', reads: true }`
for the last panel, all plain JSON for the placement cache. `selectTracks` and
`selectReads` read it, so `placeTubeMap(topology, { facet })` places any one
panel exactly as the stack does; `place` takes the tracks as well as the reads.

Reads under a haplotype facet draw in that last panel, beside the reference
alone, and in no sample panel. Repeating them under every sample would multiply
the stack's height by the sample count for reads that come from the sequenced
individual, not from the samples the haplotypes name; drawing them only when a
read facet is also on would hide them by default. The two facets don't nest (a
read facet repeats every haplotype, a haplotype facet sets the reads apart), so
the View menu offers one choice among four rather than two controls.

Under a banded haplotype layer each panel bands only its own haplotypes, so a
band's share is of the panel's haplotypes: for a diploid sample 50% reads as
heterozygous and 100% as homozygous. Shares of the whole cohort would shade an
edge alike in every panel that takes it, which says more about the allele than
the sample, and the unfaceted banded view already shows that. Haplotype band ids
run on from one panel to the next (`BandIdBase`), where under a read facet the
haplotype bands still repeat under one id set. The share legend says "1 to all
of a panel's other haplotypes" once panels band different totals. A share counts
walks, so a haplotype that walks the window twice counts twice in its band
totals while the label (`haplotypeCount`) counts it once.

gbz-base's `haplotypes: 'distinct'` collapses identical walks into one named for
whichever sorted first, which would file the others under that walk's sample.
`fetchTargetFor` in `src/util/visOptions.ts` sets `ViewTarget.allHaplotypes`
under a haplotype facet, App and the CLI key their fetch on it, and `GBZBaseAPI`
asks for `'all'`. The server backend ignores the field. The cost is one tube per
haplotype: a hosted HPRC window brings in all of its several hundred.

The renderer labels a sample panel `Sample HG02886 · 2 haplotypes`, the unnamed
one `No PanSN sample · 3 haplotypes` and the last `Reads · 112 reads`. Goldens:
`example-6.facet-haplotype-sample` (no demo haplotype has a PanSN name, so one
unnamed panel and the reads), `hprc-chrM.facet-haplotype-sample` (42
one-haplotype sample panels and the simulated reads; the first two and the reads
panel pinned whole) and `micb-kir3dl1.facet-haplotype-sample-banded` (45 panels,
two diploid ones pinned). `doc/images/facets-haplotypes-*.png` draw the real
HPRC haplotypes in `exampleData/micb-kir3dl1.gbz.db` and
`exampleData/hprc-chrM.gbz.db`; `scripts/make-facet-figures.sh` regenerates
them.
