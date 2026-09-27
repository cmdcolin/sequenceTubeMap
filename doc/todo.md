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
  `lib/generated/idl/utils.js` the CLI will throw at startup. The patch is also
  worth reporting upstream.
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
