---
name: encodings-as-layers
description: Finish the grammar of graphics already latent in the encodings: layers and facets on a two-phase layout.
metadata:
  category: ready
  area: encodings
  first_move: "Facets: place one topology once per track subset and stack the panels in one SVG, aligned in x."
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

## What remains

- The layers are a topology option, because the topology measures x from placing
  every layer as configured. A facet that draws a different layer set at the
  shared x would need the measuring placement to draw the union.
- The scales don't yet name the field they read.

Order of work:

1. **Facets.** Small multiples over subsets of tracks, each a placement of one
   topology, so panels share node order and x. `placeTubeMap` would take the
   subset (haplotype names, or a read predicate like the focus filter) beside
   its read filters. Lane order, lane y, `adjustVertically` and the straightened
   reference still depend on which tracks a panel holds, so panels align in x
   only. The renderer draws one layout into one SVG with one zoom, so the
   cheapest drawing stacks the panels vertically in that SVG, each offset by the
   bounds of the panels above, under the one zoom. Haplotypes carry no
   population or sample-group metadata today (only reads carry `sample_name` and
   `read_group`), so grouping haplotypes means parsing PanSN names, and faceting
   reads by `read_group` or `sample_name` is the first case with data behind it.
   Every panel needs its own legend rows for color-only encodings.
2. **Per-region facets.** Separate layouts with shared scales and legend. Wait
   until `src/util/tubemap.ts` state (about 20 module-level `let`s, `config`,
   hover state, subscriber stores, one `svgID` and one zoom) is an instance.
   Each panel costs another placement pass, so this ties to
   [wide-pangenome-windows](wide-pangenome-windows.md).

Facets come next because a panel is a placement of a set of layers, which now
exists. Reads by read group make the first useful facet: the data is there, and
it exercises a subset filter at placement without touching the topology.

A general grammar engine is not the goal.
