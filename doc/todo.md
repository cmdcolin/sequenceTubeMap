# Open work

Things that need more thought before they reach user-facing docs or final UX.

## PanSN query input asymmetry

The Region field accepts `contig`, `sample#contig` and `sample#haplotype#contig`
(`pathQueryFor` in `src/api/GBZBaseAPI.ts`); `@gmod/gbz-base` takes the
haplotype number, so a 3-part name is no longer silently truncated. What still
limits it is the database: only paths gbz-base indexed for random access
(generic paths and the GBWT `reference_samples`) can anchor a query, so
`HG00438#2#MT:1-100` fails with "has not been indexed for random access" unless
that sample was a reference sample at construction time.

- **Query input**: any indexed path, in any of the three forms.
- **Response output**: 3-part — every haplotype traversing the queried node
  range is returned. Names are real `sample#haplotype#contig` when the database
  has the `HaplotypeSamples` side tables
  ([data.md](data.md#naming-haplotypes-optional)); otherwise `unknown#N#contig`,
  as upstream emits.

Open questions:

- Should the Region field explain the "not indexed" failure with a hint to pick
  a reference sample from the paths panel?
- Worth landing a small inline help tooltip on the Region input that explains
  "query an indexed path; response includes all haplotypes"?

## The URL-hosted HPRC release 2.1 example

"HPRC v2.1 whole genome (gbz-base, URL-hosted)" is HPRC's published 10 GB
`.gbz.db` read straight off S3 by range request, with JBrowse's 7.9 GB companion
haplotype index beside it for the names. `skipAutoLoad` keeps a menu selection
from firing a query on its own; the Go button does that.

- Read tracks (`.gam`) given by URL are still downloaded whole; the progress UI
  covers those. Range-reading GAM would need the `.gai` index consulted first.
- The default region (`GRCh38#chr6:160620000-160620500`, inside _LPA_'s KIV-2
  array) draws 23 distinct walks and is legible. The chr20 microsatellite the
  README figures use draws 240 over the same 464 haplotypes, a far denser
  picture — worth an entry of its own, or is one enough?
- Every haplotype through the window is drawn; there is no "show me these
  haplotypes" selection, so the only way to afford a wide window is not to open
  it. `GRAPH_RENDER_LIMIT` in `src/components/TubeMapContainer.tsx` refuses one
  instead of freezing the tab
  ([measurements](data.md#how-wide-a-region-will-draw)), which makes the refusal
  safe rather than the feature done. `subgraphForHaplotypes` with the
  companion's `HaplotypeAnchors` is what would make a chosen set cheap, and
  would turn the MHC-scale windows from refused into useful.

## Navigation

Hackathon ideas for reaching a region without knowing paths, coordinates or node
IDs up front, motivated by a fragmented circular mitochondrial pangenome
(`exampleData/Toxo`: 23 nodes, 12 overlapping `Circ*` paths, 6635 reads cycling
through shared nodes, small enough that `node:1-23` draws the whole graph in
under a second). Path lengths and the paths panel have landed; these have not:

- **Multi-node regions** — `nodes:5,7,13+2` (a set plus context), answered with
  `vg find -N <file> -c K` instead of `vg chunk`, so shift-clicking grows a
  node-of-interest set. Suits a fragmented mito with no single reference path.
- **Click to navigate** — double-clicking a node sets `node:ID+context` and
  loads it, turning the rendering into the navigator.
- **A whole-graph button** — for small graphs, `node:<min>-<max>` from
  `vg stats -r`.
- **Read-driven entry points** — with a GAM attached, `vg depth -g` once and
  offer the most-covered nodes as quick-jump chips.
- **Path-walk breadcrumbs** — "step 4/9 along Circ1" with prev/next, walking
  node by node from `vg paths -X`.
- **A CLI launcher** —
  `scripts/open-tubemap.py --graph foo.xg --gam foo.gam --nodes 5,7,13` printing
  (and optionally opening) the link [urlparams.md](urlparams.md) describes.
  Pairs with multi-node regions.

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
