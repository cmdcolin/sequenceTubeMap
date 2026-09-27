# Open work

## Wide pangenome windows

`GRAPH_RENDER_LIMIT` in `src/components/TubeMapContainer.tsx` refuses a window
whose haplotypes make too many node visits
([measurements](data.md#how-wide-a-region-will-draw)) instead of freezing the
tab, which makes the refusal safe rather than the feature done. The app draws
every haplotype through the window; a "show me these haplotypes" selection
through `subgraphForHaplotypes` and the companion's `HaplotypeAnchors` would
make a chosen set cheap and turn MHC-scale windows from refused into useful.

Remote `.gam` tracks are still downloaded whole; range-reading them would need
the `.gai` index consulted first.

## The layout engine

`src/util/tubemap.ts` is typecheck-clean with no `@ts-nocheck`, but
`.oxlintrc.json` still ignores it. Un-ignored it reports 80 errors in three
groups:

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

- **Module-level mutable state**, grouped under banner comments into the inputs
  (`svgID`, `inputNodes`, `inputTracks`, `inputReads`, `inputRegion`, `bed`),
  per-render layout scratch (`nodes`, `tracks`, `reads`, `nodeMap`,
  `nodeOrders`, `nodesPerOrder`, `assignments`, `extraLeft`, `extraRight`,
  `maxOrder`, `shapes`, `trackForRuler`), and UI state (`svg`, `zoom`,
  `imageBounds`, `hoverTooltip`, `highlightedTrack`, `detailHidden`,
  `cleanupParentBindings`, `coarsenedEdgeMeta`, the visibility snapshot).
  Threading the layout scratch through as a `layout` parameter is mechanical but
  touches nearly every function in the file, so it wants a dedicated pass with
  the render tests as the safety net. `imageBounds` cannot become a parameter
  as-is: the exported `zoomBy()` reads it from the toolbar long after
  `createTubeMap` returned.
- **`generateBasicPathsForReads` vs `generateLaneAssignment`** walk a path with
  the same 60-line case analysis (forward / backward / same-order, with and
  without turnaround segments); the lane version also emits `SegmentAssignment`s
  and `lane: null`. Factoring the walk out is the highest-value remaining dedup
  and the riskiest change in the file — only attempt it with the render tests
  green before and after.
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
