---
name: wide-pangenome-windows
description:
  Make MHC-scale windows useful by drawing a chosen set of haplotypes, since the
  render limit only makes the refusal safe.
metadata:
  category: ready
  area: rendering
  first_move:
    "Select a haplotype set through gbz-base's subgraphInInterval({ keep }) or
    graph-walks' keep."
  order: 1
---

# Wide pangenome windows

`GRAPH_RENDER_LIMIT` in `src/components/TubeMapContainer.tsx` refuses a window
whose haplotypes make too many node visits
([measurements](../../doc/data.md#how-wide-a-region-will-draw)) instead of
freezing the tab, which makes the refusal safe rather than the feature done. The
app draws every haplotype through the window. A "show me these haplotypes"
selection would make a chosen set cheap and turn MHC-scale windows from refused
into useful. gbz-base's `subgraphInInterval({ keep })` takes a predicate on the
path name, and the companion index's `HaplotypeAnchors` make that query cost
only the walks it keeps; `@jbrowse/graph-walks` takes the same `keep` filter on
a walk name for gfa-to-tabix files.

The coarsened view now covers much of this: with no reads loaded it draws a
haplotype window up to 1,000,000 visits (a 50 kb MHC window) in about a second,
and the size notice offers a **Coarsen** button.
