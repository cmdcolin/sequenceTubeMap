---
name: shared-band-scale
description:
  Each banded layer scales band widths to that layer's heaviest edge, so a
  two-read band can draw as wide as an eight-haplotype band. Decide whether
  bands share one scale.
---

# One band width scale across layers

tubemap-core's `layout.ts` sizes a layer's bands from that layer's heaviest
edge: band width grows with the square root of an edge's crossings, relative to
the most crossed edge in the same layer. With haplotypes and reads both banded
([reference/encodings-and-facets.md](../../reference/encodings-and-facets.md#layers)),
a two-read band can draw as wide as an eight-haplotype one.

## The call

- **Keep per-layer scales.** Each layer uses its full width range, so a layer
  with few crossings stays readable beside one with many. Widths don't compare
  across layers.
- **Share one scale.** Widths compare across layers, but a thin read layer under
  hundreds of haplotypes draws as hairlines.
