---
name: encodings-as-layers
description: Finish the grammar of graphics already latent in the encodings: layers and facets on a two-phase layout.
metadata:
  category: ready
  area: encodings
  first_move: "Haplotype facets: split the haplotypes into panels by PanSN sample, each panel keeping the reference."
  order: 4
---

# Encodings as a grammar of graphics

The app already has the pieces of a grammar of graphics, but hard-wires how they
combine. The coarsened view is a stat: it turns walks into per-edge bands with
computed `count`, `share` and strand. `mergeNodes`, `ignoreStrand` and the
mapping-quality cutoff are data transforms. The View menu's mapping-quality
color and opacity, read groups and strand palettes are aesthetic mappings;
palettes, the mapping-quality scale and the share ramp are scales; and
`nodeWidthOption` is the x scale.

The legend no longer restates the renderer. `src/util/scales.ts` holds scale
objects that each color a drawn track and key their own legend rows from the
tracks they colored, so a value nothing in view takes gets no row.
`src/util/encoding.ts` projects each layout track onto the variables the scales
read (`DrawnTrack`: mark, strand, mapping quality, group, share) and lays the
aesthetic mapping out as a table, `encodingFor`: one `{ color, alpha }` entry
per mark. A small spec, `Coloring.read`
(`{ color: 'group' | 'mapq' | 'strand', alpha?: 'mapq' }`), picks the read
entry; `readEncodingFrom` derives it from the View menu's flags (read groups
over mapping quality over strand, bands apart), which the `vis=` URL parameter
still carries. The renderer's colorer and `legendSections` both read the table,
and the renderer reports the projected tracks it placed, so the key can't
disagree with the picture.

The renderer applies the encoding at draw time. Layout shapes carry only their
track's `id`; `src/util/tubemap.ts` paints each from that track's `DrawnTrack`
and reuses the latest layout while its inputs and options are unchanged, so a
recolor costs a redraw but no layout. Turnaround rectangles and corners take
their track's opacity like every other shape.

Naming the field each scale reads, and letting a full view spec stand in for the
flags, would finish the job. A view would then read like:

```ts
{
  x: 'sequence' | 'log' | 'fixed',
  layers: [
    { data: 'haplotypes', stat: { edge: { ignoreStrand } },
      aes: { color: { field: 'share', scale: shareRamp }, width: 'crossings' } },
    { data: 'reads', filter: { mapq: '>= 20' },
      aes: { color: { field: 'strand', scale: strandPalettes },
             alpha: { field: 'mapq', scale: mapqAlpha } } },
  ],
}
```

Layers made coarsening a per-layer choice rather than "the reads, or the
haplotypes when no reads are loaded", so haplotypes now band with reads on
screen (see [Layers](#layers)). New encodings (`color ← population`,
`alpha ← share`) become entries rather than flags, and the URL could carry the
spec instead of a growing flag list.

## The two-phase layout

`layoutTubeMap` in `packages/tubemap-core/src/layout.ts` composes two exported
phases. `layoutTopology` merges, orders and orients the nodes, sizes them and
fixes their x. `placeTubeMap` lays out the topology's haplotypes and the reads
its filters keep: lanes, read stacking, `adjustVertically` and shapes. A caller
can run the topology once and place it several times, and every placement keeps
the same node order and x.

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

No golden changed. The `brca1.mapq-500` golden never showed filter-dependent
topology: its reads cross three nodes with nothing to merge. A test in
`packages/tubemap-core/src/layout.test.ts` pins the new behavior instead, with a
read whose filtered-out edge keeps a node from merging.

## Layers

`TopologyOptions.layers` in `packages/tubemap-core/src/layout.ts` lists the
track sets placement draws, each with an optional stat:

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
golden held byte for byte and the topology no longer carries `hasReads`.

Each banded layer reports its own `Coarsening` in `layout.coarsened`, keyed by
data. Haplotype bands take ids from `COARSENED_ID_BASE` and read bands follow
them, so one `coarsenedEdgeMeta` labels both without collisions; a read band's
id therefore shifts when the haplotypes band too. Each layer sizes its bands on
its own scale, so a two-read band can draw as wide as an eight-haplotype one.

The View menu's "Band haplotypes (Sankey)" sets `coarsenedHaplotypeView`
(`vis=coarsenedHaplotypeView`, `--banded-haplotypes` in the CLI), which asks
`layOut()` in `src/util/tubemap.ts` for a banded haplotype layer over the reads,
banded as well under `coarsenedReadView`. The legend needed no change: it
already keys every drawn track by mark and source, so the graph's section shows
the share ramp and the read file's its strand, mapping-quality or band rows. The
node dialog leaves out read counts once any layer bands, since its nodes then
hold bands. Goldens `example-6.banded-haplotypes` and
`example-6.banded-haplotypes-and-reads` pin the combination; the other datasets
with reads carry one haplotype, so their new files point at older ones.

## Facets

`placeFacets` in `packages/tubemap-core/src/layout.ts` places one topology once
per subset of its reads and stacks the placements top to bottom. `facetReads`
splits the reads the mapping-quality and focus filters keep by a read field
(`FacetBy`: `read_group` or `sample_name`), one subset per value in sort order
and the reads lacking one last. `PlacementOptions.facet` (`{ by, key }`, plain
JSON, so the renderer's placement cache still keys on `JSON.stringify`) has
`placeTubeMap` place one subset. Every panel draws every haplotype, under the
topology's layers, at the topology's x, so panels line up in x exactly; lanes,
node heights and `adjustVertically` follow each panel's own reads. Read band ids
run on from one panel to the next, so they stay unique across the stack;
haplotype bands repeat in every panel under the same ids and shares.

Each panel keeps its own coordinates and carries an `offsetY`: the first sits
where an unfaceted placement draws, and each later one starts `FACET_GAP` below
the panel above plus `FACET_LABEL_HEIGHT` for its label. `FacetedLayout.bounds`
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
the stack because colors don't vary by panel, which made the per-panel legend
rows the earlier plan called for unnecessary. A node click reports the counts of
the panel clicked, found from the clicked node object; hovering a haplotype
highlights it in every panel. Node outline ids repeat across panels. A facet
change places again on the cached topology, and a color change does neither.

The View menu's **Facet reads by** (none, read group, sample) sets
`facetReadsBy`, which the `facet=` URL parameter carries beside `mapq=`, since
`vis=` holds only on/off flags; the CLI takes `--facet-reads-by`. No bundled
alignment file carries more than one read group or sample, so the goldens
(`example-6.facet-*`) give example 6's reads made-up ones, and
`exampleData/hprc-chrM-3samples.sorted.gam`, reads simulated from three HPRC
samples' chrM haplotypes, backs the figures in `doc/images/facets-*.png`.

Left out: the label scales with the zoom rather than holding its size like node
labels; the app's read render limit subsamples before faceting, so panel counts
are of the subsample; and a node's right-click menu still lists every read
through it, not the panel's.

## What remains

- The layers are a topology option, because the topology measures x from placing
  every layer as configured. A facet that draws a different layer set at the
  shared x would need the measuring placement to draw the union.
- The scales don't yet name the field they read.

Order of work:

1. **Haplotype facets.** Split the haplotypes into panels by the sample in their
   PanSN names (`HG00438#2#MT#0`), the one grouping haplotypes carry. In the
   core it is a key over `topology.tracks` beside `facetReads`'s key over reads,
   and a `PlacementOptions.facet` that names haplotypes and has `place` keep the
   subset; every panel keeps the reference, which carries the ruler and anchors
   the straightening, and `offsetY` stacking and the renderer carry over as they
   are. Haplotype bands then shade by share within the panel.
2. **Per-region facets.** Separate layouts with shared scales and legend. Wait
   until `src/util/tubemap.ts` state (about 20 module-level `let`s, `config`,
   hover state, subscriber stores, one `svgID` and one zoom) is an instance.
   Each panel costs another placement pass, so this ties to
   [wide-pangenome-windows](wide-pangenome-windows.md).

Haplotype facets come before per-region ones because they reuse the stack
placeFacets built, need no renderer refactor and answer a question the banded
view can't: how one population's or sample's haplotypes route through a region
next to another's. Per-region facets need separate topologies and an instanced
renderer first.

A general grammar engine is not the goal.
