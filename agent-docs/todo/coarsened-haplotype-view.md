---
name: coarsened-haplotype-view
description: Open items from the coarsened view: the remaining layout scaling costs.
metadata:
  category: ready
  area: rendering
  first_move: "In tubemap-core, profile generateNodeOrder, mergeNodes and generateTrackIndexSequences, the remaining top layout costs."
  order: 2
---

# Coarsened haplotype view

Open items from the coarsened-view sessions:

- **Layout scaling.** With placement fixed, coarsened layout is linear at about
  2.5 µs per visit; `generateNodeOrder`, `mergeNodes`' predecessor/successor
  sets and `generateTrackIndexSequences` are the remaining top costs. All three
  live in [GMOD/tubemap-core](https://github.com/GMOD/tubemap-core).
