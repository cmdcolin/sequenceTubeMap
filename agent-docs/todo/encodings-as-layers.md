---
name: encodings-as-layers
description: Finish the grammar of graphics already latent in the encodings: layers and facets on a two-phase layout.
metadata:
  category: ready
  area: encodings
  first_move: "Per-region facets: turn src/util/tubemap.ts's module state into an instance so separate layouts can share one zoom and legend."
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

[reference/encodings-and-facets.md](../reference/encodings-and-facets.md)
describes what has landed: the scales and draw-time encoding, the two-phase
layout, layers, and read and haplotype facets.

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
screen. New encodings (`color ← population`, `alpha ← share`) become entries
rather than flags, and the URL could carry the spec instead of a growing flag
list.

## Open gaps

- The app's read render limit subsamples before faceting, so panel read counts
  are of the subsample.
- Banding reads from two files merges their crossings of an edge into one band
  that takes the first file's `sourceTrackID`, so one band set covers both
  files: the legend and the colorer can't tell their bands apart.
- The node dialog's `Haplotypes:` counts the topology's walks through the node,
  not the panel's.
- A stack of hundreds of panels draws every one; nothing pages or filters the
  samples.
- Read-group coloring has no CLI or URL surface, so no figure shows it.

## What remains

- The layers are a topology option, because the topology measures x from placing
  every layer as configured. A facet that draws a different layer set at the
  shared x would need the measuring placement to draw the union.
- The scales don't yet name the field they read.

Order of work:

1. **Per-region facets.** Separate layouts with shared scales and legend. First
   turn `src/util/tubemap.ts` state (about 20 module-level `let`s, `config`,
   hover state, subscriber stores, one `svgID` and one zoom) into an instance,
   so several layouts can draw under one zoom. Each panel costs another
   placement pass, so this ties to
   [wide-pangenome-windows](wide-pangenome-windows.md).
2. **A sample subset.** Choose which samples a haplotype facet draws, through
   the haplotype selection the wide-windows work brings, rather than one panel
   per sample in the window.

Per-region facets come next because the single-topology facets (reads and
haplotypes) now cover what one placement stack can show; anything else needs
separate topologies, and those need an instanced renderer first.

A general grammar engine is not the goal.
