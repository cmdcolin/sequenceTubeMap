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

Remote `.gam` tracks are still downloaded whole; range-reading them would need
the `.gai` index consulted first.

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

`packages/tubemap-core/src/layout.ts` and `src/util/tubemap.ts` are
typecheck-clean with no `@ts-nocheck`, but `.oxlintrc.json` still ignores both.
Un-ignored, the layout reports most of the errors, in three groups:

1. **`no-unnecessary-condition` (51).** Almost all are defensive `if (node)` /
   `if (node.y !== undefined)` guards against the sparse `nodes` array, typed
   `LayoutNode[]` even though index 0 is a hole and unreachable nodes have no
   `x`/`y`. Fixing this properly means typing `nodes` as
   `(LayoutNode | undefined)[]` and narrowing at every access, which cascades
   through the whole layout section. Do it as its own pass, not
   opportunistically.
2. **`no-console` (23).** All sit behind the module's `DEBUG` flag and are
   deliberate. The file needs a per-file `no-console` override like
   `src/components/TubeMap.tsx` has, or a small `debugLog()` wrapper.
3. **`prefer-nullish-coalescing` (6).**

Structural work not yet done:

- **Module-level layout scratch.** `layout.ts` keeps its passes' working state
  (`nodes`, `tracks`, `reads`, `nodeMap`, `nodeOrders`, `nodesPerOrder`,
  `assignments`, `extraLeft`, `extraRight`, `maxOrder`, `shapes`,
  `trackForRuler`, `coarsenedEdgeMeta`) at module level, reset on every
  `layoutTubeMap` call. Threading it through as a parameter is mechanical but
  touches nearly every function in the file, so it wants a dedicated pass with
  the render and golden tests as the safety net. `tubemap.ts` holds the latest
  layout and its UI state; `imageBounds` stays there because the exported
  `zoomBy()` reads it long after a draw returned.
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
  `addTrackFeatures`, `createFeatureRectangle`, and the `highlight !== 'plain'`
  branch of `generateTrackColor` — are unreachable. Either wire the toggle back
  up or delete the feature.
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

The cost of leaving them hard-wired is the legend. `src/util/legend.ts` restates
`generateTrackColor`'s precedence (groups over mapping quality over strand,
bands apart) so the key matches the drawing, and every color change has to be
made in both. If each mapping were a `{ field, scale }` and each scale could
write its own legend row, the key would be the list of scales in use and could
not disagree with the picture. A view would then read like:

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

In order, each step useful alone:

1. Give every drawn track a record of computed variables (count, crossings,
   share, strand, mapping quality, group) for the colorer to read.
   `Track.haplotypeShare` is the first of these.
2. Replace the color and opacity flags with mappings onto scale objects that
   produce their own legend rows, and delete the restated precedence in
   `legend.ts`.
3. Split haplotypes and reads into layers with a stat each. This touches the
   layout's module-level scratch (see [the layout engine](#the-layout-engine)),
   so it belongs with that refactor.

A general grammar engine is not the goal; steps 1 and 2 capture most of the
value.
