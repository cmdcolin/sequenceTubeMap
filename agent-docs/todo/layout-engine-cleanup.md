---
name: layout-engine-cleanup
description: Layout clean-up: the non-transitive track comparison, optional Segment.y and Segment.lane, and MaybeUnset fields on exported types.
metadata:
  category: ready
  area: layout
  first_move: "In tubemap-core, choose a deliberate draw order to replace the non-transitive compareTrackByInitialOrdering and review the 60 changed goldens."
  order: 3
---

# The layout engine

The layout code lives in
[GMOD/tubemap-core](https://github.com/GMOD/tubemap-core); the goldens stay here
in `src/util/layout-golden/`. Work on both through a
[linked local clone](../../doc/development.md#developing-against-a-local-tubemap-core).

The layout keeps `nodes` typed `LayoutNode[]` rather than
`(LayoutNode | undefined)[]`: forEach, map and sort skip the hole at index 0,
and `noUncheckedIndexedAccess` already types indexed reads as possibly
undefined, so the wider type would only force guards that never fire. Fields
that `Node` and `Track` declare but not every entry gets (an unplaced node's
`x`/`y`, a normal read's `width` before `assignReadsToNodes`) are read through a
local `MaybeUnset<T, K>` view. Making them optional on the exported types would
be more honest still, but touches tubemap-core's `geometry.ts` and the viewer's
`src/util/tubemap.ts`. `seq` is optional on `InputNode`, since a
`removeSequences` graph has none, and `layoutTubeMap` fills it in as `''`.

Found along the way: **`compareTrackByInitialOrdering` is not transitive.** It
compares two tracks' y where they first share an order slot inside nodes, and
returns 0 for tracks that never do, so three tracks can each sort before the
next. The sort decides draw order and turnaround nesting in
`generateSVGShapesFromPath`, and dropping it reorders shapes in 60 of the
goldens, so a replacement needs a deliberate choice of order and a look at the
renders.

Structural work not yet done: **`Segment.y` / `Segment.lane` are optional** but
always set by the time the drawing code reads them, which leaves a scattering of
`!` and `?? 0`. A `PlacedSegment` type (or splitting placement out of `Segment`)
would remove them.
