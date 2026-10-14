---
name: tiled-tubemap-layout
description: Why side scroll with lazy loading cannot tile the tube map layout, which depends on the whole window, and the plugin-side path that could: reference-pinned columns plus lane stability across re-cuts.
---

# Side scroll with lazy loading, and why the layout is the obstacle

Surveyed 2026-09-27 against this app and
`~/src/jb2plugins/jbrowse-plugin-graphgenomeviewer`.

## What exists

- **The plugin already scrolls.** Its `LinearGraphDisplay` sits inside the
  JBrowse LinearGenomeView, follows its scroll and zoom, and when the view
  leaves the loaded window re-cuts the window plus one screen each side through
  region-indexed adapters (tabix rGFA, gbz-base over range requests). It caps at
  5 Mb with a Force load button, caps parsed graphs at 20,000 nodes, and has a
  coarse tier past a zoom level. Its tube map layout is `@jbrowse/tubemap-core`,
  developed in [GMOD/tubemap-core](https://github.com/GMOD/tubemap-core).
- **This app re-fetches on every move.** Shift, widen and narrow are a new
  region string, a full fetch and a full redraw; d3-zoom pans within the loaded
  content only (`translateExtent` is clamped to the layout bounds in
  `src/util/tubemap.ts`).
- **Node ids are stable across requests** in both backends, so stitching is not
  blocked on identity. `vg simplify` and the default merge-nodes option both
  rewrite nodes, and haplotype walks are deduplicated per window, so tracks
  would need identities before two windows' walks could be joined.

## Why neither tiles

Linear-browser lazy loading works because a block's pixels depend only on that
block. In `layoutTubeMap` (tubemap-core's `layout.ts`) a node's column and every
walk's lane depend on the whole window: it straightens on track 0, merges nodes,
and orders nodes across all tracks twice. Appending a neighbouring chunk can
reorder and re-lane the graph anywhere, and x is in layout-order space, not bp.

## The plausible path

1. Do it in the plugin, which has the scroll and re-cut architecture, and land
   the layout work in tubemap-core so both benefit.
2. Start from the plugin's `tubemapref` mode, where columns are pinned to
   reference bp and only off-reference bubbles float. Check whether scrolling
   there already feels stable; if it does, the remaining problem is keeping
   haplotype lanes stable across re-cuts, which is much smaller than general
   incremental layout.
3. Lane stability across cuts: seed `generateNodeOrder` and lane assignment from
   the previous cut's result for the nodes both cuts share, so a re-cut is a
   perturbation rather than a fresh solve.

## The plugin's coarse tier at whole-chromosome zoom

The coarse tier has no bp cap; only the fine tier has the 5 Mb one. The fold
size bounds it instead: on HPRC's `fold10000` pair a whole-chr1 cut is 3,573
segments and 5,063 links, and every hosted coarse pair (HPRC, mouse, bovine,
Arabidopsis) is under 1 MB compressed for the whole genome (2026-10-14).

The plugin's 20k `maxGraphNodes` check skips layouts that draw no nodes, tube
maps and walk rows included, and the coarse fetch has no byte budget. A pair
folded much finer than 10 kb would reach a tube map unchecked.
