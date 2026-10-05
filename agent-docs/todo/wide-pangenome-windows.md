---
name: wide-pangenome-windows
description:
  Make MHC-scale windows useful by drawing a chosen set of haplotypes, since the
  render limit only makes the refusal safe.
metadata:
  category: ready
  area: rendering
  first_move:
    'Select a haplotype set through subgraphForHaplotypes and the companion
    HaplotypeAnchors.'
  order: 1
---

# Wide pangenome windows

`GRAPH_RENDER_LIMIT` in `src/components/TubeMapContainer.tsx` refuses a window
whose haplotypes make too many node visits
([measurements](../../doc/data.md#how-wide-a-region-will-draw)) instead of
freezing the tab, which makes the refusal safe rather than the feature done. The
app draws every haplotype through the window; a "show me these haplotypes"
selection through `subgraphForHaplotypes` and the companion's `HaplotypeAnchors`
would make a chosen set cheap and turn MHC-scale windows from refused into
useful.

The coarsened view now covers much of this: with no reads loaded it draws a
haplotype window up to 1,000,000 visits (a 50 kb MHC window) in about a second,
and the size notice offers a **Coarsen** button.
