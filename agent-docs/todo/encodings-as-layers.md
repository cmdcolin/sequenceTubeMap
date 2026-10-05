---
name: encodings-as-layers
description: Finish the grammar of graphics already latent in the encodings: layers and facets on a two-phase layout.
metadata:
  category: ready
  area: encodings
  first_move: "Split layoutTubeMap into topology and placement, and decide whether read filters affect topology."
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
recolor costs a redraw but no layout. Turnaround rectangles and corners still
take no opacity, as before the move, so a read faded by mapping quality draws
its turnarounds opaque.

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

## What remains

The layer split is harder than the sketch above suggests, because reads and
haplotypes shape each other's layout in `packages/tubemap-core/src/layout.ts`:

- The mapq and focus filters run before topology (`layoutTubeMap`, 214-216).
  Reads then feed `mergeNodes`, `generateNodeOrder` and `switchNodeOrientation`,
  so changing the mapq cutoff changes how haplotype nodes merge and order (the
  `brca1.mapq-500` golden shows it). A per-layer filter that leaves haplotypes
  alone changes behavior and the goldens.
- Reads stack under haplotypes at `node.y + contentHeight`, and
  `adjustVertically3` pushes lower haplotype nodes down.
- Coarsening is either/or. Banded haplotypes reuse `state.reads` and exist only
  when no reads load; one `coarsened` value and one `coarsenedEdgeMeta` reset
  mean two banded layers would overwrite each other.

The scales don't yet name the field they read.

Order of work:

1. **Split `layoutTubeMap` into topology and placement.** Topology (merge,
   order, orientation, node widths) runs once on all tracks; placement (lanes,
   reads) runs per layer or panel. Decide here whether read filters affect
   topology. Layers, banded haplotypes with reads on screen, and facets all wait
   on this split.
2. **Facets.** Small multiples over subsets of tracks, drawn from one layout so
   panels align. Re-laying out per panel breaks alignment: lane order, lane y,
   `adjustVertically`, the straightened reference and even x gaps
   (`calculateExtraSpace`) all depend on which tracks are present. Panels
   sharing a layout keep the full height, with 15 px gaps per missing haplotype
   and 7 px per missing read, so k panels take about k times the height; x takes
   the maximum extra space over all panels. Haplotypes carry no population or
   sample-group metadata today (only reads carry `sample_name` and
   `read_group`), so grouping haplotypes means parsing PanSN names. Every panel
   needs its own legend rows for color-only encodings.
3. **Per-region facets.** Separate layouts with shared scales and legend. Wait
   until `src/util/tubemap.ts` state (about 20 module-level `let`s, `config`,
   hover state, subscriber stores, one `svgID` and one zoom) is an instance.
   Each panel costs another placement pass, so this ties to
   [wide-pangenome-windows](wide-pangenome-windows.md).

The layout now passes a `LayoutState` rather than module-level scratch, so a
layer can run its passes on its own state. The colorer already reads each drawn
track's computed variables (share, strand, mapping quality, name) off
`ColorableTrack`, so a layer's stat only has to fill them in. Review the layout
goldens (66) at step 1.

A general grammar engine is not the goal.
