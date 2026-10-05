---
name: todo
description:
  Index of the open work in todo/. Read when picking up work, and before filing
  anything new here.
---

# Todo

One file per item under [todo/](todo/). Each carries its row in its own
frontmatter: `metadata.category`, `area`, `first_move`, `order`. This index has
no generator, so edit it when an entry changes.

## Ready to take

| Item                                                              | Area      | First move                                                                                                                    |
| ----------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Wide pangenome windows](todo/wide-pangenome-windows.md)          | rendering | Select a haplotype set through subgraphForHaplotypes and the companion HaplotypeAnchors.                                      |
| [Coarsened haplotype view](todo/coarsened-haplotype-view.md)      | rendering | Profile generateNodeOrder, mergeNodes and generateTrackIndexSequences, the remaining top layout costs.                        |
| [The layout engine](todo/layout-engine-cleanup.md)                | layout    | Choose a deliberate draw order to replace the non-transitive compareTrackByInitialOrdering and review the 60 changed goldens. |
| [Encodings as a grammar of graphics](todo/encodings-as-layers.md) | encodings | Move color and alpha out of layout so the renderer applies the encoding at draw time.                                         |
