---
name: encodings-as-layers
description: Finish the grammar of graphics already latent in the encodings: per-layer stats and coarsening, a view spec in place of flags.
metadata:
  category: ready
  area: encodings
  first_move: "Split haplotypes and reads into layers with a stat each."
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
per mark, chosen from the View menu's flags (read groups over mapping quality
over strand, bands apart). The renderer's colorer and `legendSections` both read
it, and the renderer reports the projected tracks it placed, so the key can't
disagree with the picture. Naming the field each scale reads, and letting a view
spec pick the entries instead of the flags, would finish the job. A view would
then read like:

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

What remains: split haplotypes and reads into layers with a stat each. The
layout now passes a `LayoutState` rather than module-level scratch, so a layer
can run its passes on its own state. The colorer already reads each drawn
track's computed variables (share, strand, mapping quality, name) off
`ColorableTrack`, so a layer's stat only has to fill them in.

A general grammar engine is not the goal.
