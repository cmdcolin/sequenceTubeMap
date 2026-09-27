# Open work

## Wide pangenome windows

`GRAPH_RENDER_LIMIT` in `src/components/TubeMapContainer.tsx` refuses a window
whose haplotypes make too many node visits
([measurements](data.md#how-wide-a-region-will-draw)) instead of freezing the
tab, which makes the refusal safe rather than the feature done. The app draws
every haplotype through the window; a "show me these haplotypes" selection
through `subgraphForHaplotypes` and the companion's `HaplotypeAnchors` would
make a chosen set cheap and turn MHC-scale windows from refused into useful.

The coarsened view now covers much of this: with no reads loaded it draws a
haplotype window up to 1,000,000 visits (a 50 kb MHC window) in about a second,
and the size notice offers a **Coarsen** button.

A region read of an indexed `.gam` fetches up to 64 kB past the start of each
run's last BGZF block, since that block's size is in a header not yet read, and
two runs that share a block fetch it twice.

## Coarsened haplotype view

Open items from the coarsened-view sessions:

- **jsdom named-element rescans** are patched out in `scripts/tubemap-cli.ts`
  (`skipNamedElementRescans`) through a jsdom internal. If a jsdom upgrade moves
  it, the CLI warns and renders without the patch: a 10 kb MHC window takes 43 s
  instead of 7 s. An upstream report is drafted but not yet filed; jsdom #4264
  fixed the attribute-change half and left tree changes invalidating
  unconditionally.
- **Layout scaling.** With placement fixed, coarsened layout is linear at about
  2.5 µs per visit; `generateNodeOrder`, `mergeNodes`' predecessor/successor
  sets and `generateTrackIndexSequences` are the remaining top costs.

## The layout engine

`packages/tubemap-core/src/layout.ts` and `src/util/tubemap.ts` pass lint.
`.oxfmtrc.json` still leaves `tubemap.ts` unformatted.

The layout keeps `nodes` typed `LayoutNode[]` rather than
`(LayoutNode | undefined)[]`: forEach, map and sort skip the hole at index 0,
and `noUncheckedIndexedAccess` already types indexed reads as possibly
undefined, so the wider type would only force guards that never fire. Fields
that `Node` and `Track` declare but not every entry gets (an unplaced node's
`x`/`y`, a normal read's `width` before `assignReadsToNodes`) are read through a
local `MaybeUnset<T, K>` view. Making them optional on the exported types would
be more honest still, but touches `geometry.ts` and `tubemap.ts`. `seq` is
optional on `InputNode`, since a `removeSequences` graph has none, and
`layoutTubeMap` fills it in as `''`.

Found along the way:

- **`compareTrackByInitialOrdering` is not transitive.** It compares two tracks'
  y where they first share an order slot inside nodes, and returns 0 for tracks
  that never do, so three tracks can each sort before the next. The sort decides
  draw order and turnaround nesting in `generateSVGShapesFromPath`, and dropping
  it reorders shapes in 60 of the goldens, so a replacement needs a deliberate
  choice of order and a look at the renders.
- **A mixed-orientation read's mismatches on a reverse visit draw mirrored.** vg
  counts their positions from the node's right end; `reverseReversedReads`
  converts them only for wholly reversed reads, and `drawMismatches` places
  every position from the left. `switchNodeOrientation` hides most cases by
  switching the node, but a node the reference crosses forward keeps them.

Structural work not yet done:

- **Module-level layout scratch.** `layout.ts` keeps its passes' working state
  (`nodes`, `tracks`, `reads`, `nodeMap`, `nodeOrders`, `nodesPerOrder`,
  `assignments`, `extraLeft`, `extraRight`, `maxOrder`, `shapes`,
  `trackForRuler`, `coarsenedEdgeMeta`) at module level, reset on every
  `layoutTubeMap` call. Threading it through as a parameter is mechanical but
  touches nearly every function in the file, so it wants a dedicated pass with
  the render and golden tests as the safety net. `tubemap.ts` holds the latest
  layout and its UI state; `imageBounds` stays there because a resize recomputes
  the zoom's extents from it long after a draw returned.
- **`generateBasicPathsForReads` vs `generateLaneAssignment`** walk a path with
  the same 60-line case analysis (forward / backward / same-order, with and
  without turnaround segments); the lane version also emits `SegmentAssignment`s
  and `lane: null`. Factoring the walk out is the highest-value remaining dedup
  and the riskiest change in the file — only attempt it with the render and
  golden tests green before and after.
- **`Segment.y` / `Segment.lane` are optional** but always set by the time the
  drawing code reads them, which leaves a scattering of `!` and `?? 0`. A
  `PlacedSegment` type (or splitting placement out of `Segment`) would remove
  them.
- **`config.showExonsFlag` has no setter**, so the BED/exon feature paths —
  `addTrackFeatures`, `createFeatureRectangle`, and the exon branch of
  `generateTrackColor` — are unreachable. Either wire the toggle back up or
  delete the feature.
- **`reverseMismatches` reverse-complements a sequence and then reverses it**,
  which nets out to a plain complement. That looks like an original-code bug,
  but the source keeps it verbatim (and says so) because changing it would alter
  rendered output; it needs a decision from someone who knows the intended
  semantics.

## Encodings as a grammar of graphics

The app already has the pieces of a grammar of graphics, but hard-wires how they
combine. The coarsened view is a stat: it turns walks into per-edge bands with
computed `count`, `share` and strand. `mergeNodes`, `ignoreStrand` and the
mapping-quality cutoff are data transforms. The View menu's mapping-quality
color and opacity, read groups and strand palettes are aesthetic mappings;
palettes, the mapping-quality scale and the share ramp are scales; and
`nodeWidthOption` is the x scale.

The legend no longer restates the renderer. `src/util/scales.ts` holds scale
objects that each color a track and write their own legend rows, and
`src/util/encoding.ts` picks the scale for each kind of drawn track (read groups
over mapping quality over strand, bands apart). The renderer's colorer and
`legendSections` both ask it, so the key can't disagree with the picture. The
View menu's flags still choose among the scales; making each choice a
`{ field, scale }` entry would finish the job. A view would then read like:

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

What remains: split haplotypes and reads into layers with a stat each. This
touches the layout's module-level scratch (see
[the layout engine](#the-layout-engine)), so it belongs with that refactor. The
colorer already reads each drawn track's computed variables (share, strand,
mapping quality, name) off `ColorableTrack`, so a layer's stat only has to fill
them in.

A general grammar engine is not the goal.
