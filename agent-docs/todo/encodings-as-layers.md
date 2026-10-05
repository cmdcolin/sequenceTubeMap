---
name: encodings-as-layers
description: Finish the grammar of graphics already latent in the encodings: layers and facets on a two-phase layout.
metadata:
  category: ready
  area: encodings
  first_move: "Give placeTubeMap layers, each a track set with its own stat, starting with banded haplotypes under reads."
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

Layers make coarsening a per-layer choice rather than today's "the reads, or the
haplotypes when no reads are loaded", so haplotypes could be banded with reads
on screen. New encodings (`color ← population`, `alpha ← share`) become entries
rather than flags, and the URL could carry the spec instead of a growing flag
list.

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
`trackWidth`, `coarsenedReadView` and `ignoreStrand` are `TopologyOptions`
although they leave node order alone. A filter then changes no x. When the
filters keep every read, `layoutTubeMap` returns that measuring placement, so a
default view still places once; a filtered view places twice.

No golden changed. The `brca1.mapq-500` golden never showed filter-dependent
topology: its reads cross three nodes with nothing to merge. A test in
`packages/tubemap-core/src/layout.test.ts` pins the new behavior instead, with a
read whose filtered-out edge keeps a node from merging.

## What remains

- Coarsening is either/or. Banded haplotypes reuse `state.reads` and exist only
  when no reads load; one `coarsened` value and one `coarsenedEdgeMeta` mean two
  banded layers would overwrite each other.
- `coarsenedReadView` and `ignoreStrand` should move from `TopologyOptions` to
  the layer that bands, with the measuring placement drawing every layer.
- The renderer still calls `layoutTubeMap`, so a mapping-quality change reruns
  the topology. Caching the topology in `layOut()` in `src/util/tubemap.ts`
  would make a filter change cost a placement only.
- The scales don't yet name the field they read.

Order of work:

1. **Layers.** `placeTubeMap` takes layers, each a set of tracks with its own
   stat, so haplotypes can draw banded with reads on screen. Within one
   placement, reads already stack under haplotypes at `node.y + contentHeight`
   and `adjustVertically3` pushes lower nodes down, so a banded layer slots into
   the read overlay; what it needs is band ids, metadata and a `Coarsening` per
   layer.
2. **Facets.** Small multiples over subsets of tracks, each a placement of one
   topology, so panels share node order and x. Lane order, lane y,
   `adjustVertically` and the straightened reference still depend on which
   tracks a panel holds, so panels align in x only. Haplotypes carry no
   population or sample-group metadata today (only reads carry `sample_name` and
   `read_group`), so grouping haplotypes means parsing PanSN names. Every panel
   needs its own legend rows for color-only encodings, and the renderer draws
   one layout into one SVG with one zoom.
3. **Per-region facets.** Separate layouts with shared scales and legend. Wait
   until `src/util/tubemap.ts` state (about 20 module-level `let`s, `config`,
   hover state, subscriber stores, one `svgID` and one zoom) is an instance.
   Each panel costs another placement pass, so this ties to
   [wide-pangenome-windows](wide-pangenome-windows.md).

Layers come first. They change the core and the legend but keep the renderer's
single panel, and they turn coarsening into a per-layer stat that facets then
reuse, a panel being a placement of a set of layers. Facets first would mean
multi-panel drawing in a renderer built around one SVG before the layer spec
they draw from exists.

The colorer already reads each drawn track's computed variables (share, strand,
mapping quality, name) off `ColorableTrack`, so a layer's stat only has to fill
them in.

A general grammar engine is not the goal.
