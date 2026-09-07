# tubemap.ts clean-up notes

`src/util/tubemap.ts` is the layout + d3 drawing engine, ported from the
original sequenceTubeMap JavaScript. This file tracks what has been cleaned up
and what is left. Earlier revisions of this document described a `@ts-nocheck`
baseline and an error budget; both are gone, so treat anything you remember
about "~774 errors" or "drop the pragma" as historical.

## Current state

- ~6000 lines, no `@ts-nocheck`, no file-wide eslint disables.
- `npx tsc --noEmit` reports **0 errors** in `tubemap.ts`.
- `npx vitest run src/util` passes (`tubemap.test.ts` unit tests plus
  `tubemap.render.test.ts`, which drives the real d3 pipeline against jsdom
  and inspects the resulting DOM).
- The file is still listed in `eslint.config.mjs`'s `ignores`. With that entry
  removed it reports 79 errors, dominated by two groups (see below). Nothing
  else in `src/util` is ignored.

## Invariants worth knowing before you edit

- **`inputNodes` / `nodes` are 1-indexed with a real array hole at index 0.**
  The hole lets a *signed* index encode orientation (`-i` = reverse visit of
  node `i`), and index 0 has no sign, so it must never be used.
  `forEach`/`map`/`filter` skip holes; `for...of` and `Array.from` do not.
  This distinction is load-bearing: `nodeOrders` used to be allocated with
  `new Array(n)` (all holes) and its `forEach` passes silently did nothing.
- **`create()` is the only render trigger.** Every `set*` function just mutates
  `config`. A batch of visOptions changes therefore costs one layout, not one
  per option. `changeTrackVisibility` / `changeAllTracksVisibility` /
  `trackDoubleClick` call `createTubeMap()` directly because they change the
  input, not the config.
- **The pipeline promotes types as it goes.** `InputNode`/`InputTrack` are the
  loose shapes `create()` accepts; `Node`/`LayoutNode`/`Track` are the
  layout-complete shapes. The single boundary cast in `createTubeMap` is the
  acknowledged one — flag any new `as` to the user. In particular
  `Node.sequenceLength` and `LayoutNode.order` are declared required because
  `generateNodeWidth` and `generateNodeOrder` guarantee them; don't reintroduce
  `?? 0` on those.
- **`getXCoordinateOfBaseWithinNode` returns `null`** for a base past the
  node's end, and `drawMismatches` relies on that to skip stale positions.
  Callers that must produce a coordinate regardless use
  `clampedXCoordinateOfBaseWithinNode`, which maps out-of-range bases to the
  nearest node edge — never fall back to `0`, which is the far left of the
  whole image.
- **Everything attached outside the SVG is released in one place.**
  `releaseDomBindings()` (called at the top of `createTubeMap`, before the
  early exits) drops the parent's wheel listener + ResizeObserver, the hover
  tooltip in `<body>`, and the cached hover highlight.
- **`reverseMismatches` pivots on `sequenceLength`, not `node.width`.** They
  are only equal in `nodeWidthOption: 'normal'`.

## What remains

### Two eslint groups (73 of the 79 errors when un-ignored)

1. **`@typescript-eslint/no-unnecessary-condition` (~50).** Almost all are
   defensive `if (node)` / `if (node.y !== undefined)` guards against the
   sparse `nodes` array, which is typed `LayoutNode[]` even though index 0 is
   a hole and unreachable nodes have no `x`/`y`. Fixing this properly means
   typing `nodes` as `(LayoutNode | undefined)[]` and narrowing at every
   access, which cascades through the whole layout section. Do it as its own
   pass, not opportunistically.
2. **`no-console` (23).** All of these sit behind the module's `DEBUG` flag.
   They are deliberate; the file needs either a per-file `no-console` override
   in `eslint.config.mjs` (like `src/components/TubeMap.tsx` already has) or a
   small `debugLog()` wrapper before the file can be un-ignored.

### Structural work not yet done

- **Module-level mutable state.** ~25 module `let`s split into three groups:
  the inputs (`inputNodes`, `inputTracks`, `inputReads`, `inputRegion`, `bed`,
  `svgID`), per-render layout scratch (`nodes`, `tracks`, `reads`, `nodeMap`,
  `nodeOrders`, `nodesPerOrder`, `assignments`, `extraLeft`, `extraRight`,
  `maxOrder`, the five `track*` shape arrays and the four min/max
  coordinates), and UI state (`zoom`, `svg`, `hoverTooltip`,
  `highlightedTrack`, `detailHidden`, `cleanupParentBindings`,
  `coarsenedEdgeMeta`, the visibility snapshot). The layout-scratch group is
  reset in one block at the top of `createTubeMap`, so it can be gathered into
  a single `layout` object created there and threaded through as a parameter.
  It is mechanical but touches nearly every function in the file, so it wants
  a dedicated pass with the render tests as the safety net.
- **`generateBasicPathsForReads` vs `generateLaneAssignment`** walk a path with
  the same 60-line case analysis (forward / backward / same-order, with and
  without turnaround segments). The only difference is that the lane version
  also emits `SegmentAssignment`s and `lane: null`. Factoring the walk out is
  the highest-value remaining dedup and also the riskiest change in the file —
  only attempt it with the render tests green before and after.
- **`Segment.y` / `Segment.lane` are optional** but are always set by the time
  the drawing code reads them, which leaves a scattering of `!` and `?? 0`.
  A `PlacedSegment` type (or splitting placement out of `Segment`) would remove
  them.
- **`config.showExonsFlag` has no setter any more** (`changeExonVisibility` was
  dead and was removed), so the BED/exon feature paths —
  `addTrackFeatures`, `createFeatureRectangle`, and the `highlight !== 'plain'`
  branch of `generateTrackColor` — are currently unreachable. Either wire the
  toggle back up or delete that whole feature.
- **`reverseMismatches` reverse-complements a sequence and then reverses it**,
  which nets out to a plain complement. That looks like an original-code bug,
  but it is preserved verbatim (and noted in the source) because changing it
  would alter rendered output; it needs a decision from someone who knows the
  intended semantics.

## Verification before each commit

```
npx tsc --noEmit                                   # 0 errors in tubemap.ts
npx vitest run src/util src/components
npx eslint --cache src/util src/components/TubeMap.tsx
```

`tubemap.render.test.ts` is the real regression net: it renders all nine demo
examples, asserts one node `<path>` per input node (with merging off), that the
reference path lays out strictly left to right, and that no rendered attribute
ever contains `NaN`. Add to it rather than trusting the unit tests alone —
most of the historical bugs in this file were geometry, not types.

## Style rules (from the user's CLAUDE.md)

- No `any`, no typecasts. `!` is acceptable where an algorithm invariant makes
  the access provably safe; prefer it to a spurious `?? 0`, which masks bugs.
  Better still, remove the optional from the type.
- Prefer separate input/layout types over blanket optional fields.
- Avoid early returns — nest `if`s or use ternaries.
- Minimal comments; explain *why*, not *what*.
- React Compiler is enabled — skip manual `useMemo` / `useCallback` /
  `React.memo`.
- No `git stash` (multiple agents share this working tree); commit with an
  explicit pathspec.
