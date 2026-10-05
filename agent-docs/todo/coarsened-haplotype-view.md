---
name: coarsened-haplotype-view
description: Open items from the coarsened view: the jsdom named-element rescan patch in the CLI and the remaining layout scaling costs.
metadata:
  category: ready
  area: rendering
  first_move: "Drop the jsdom named-element patch once a jsdom release fixes tree-change invalidation."
  order: 2
---

# Coarsened haplotype view

Open items from the coarsened-view sessions:

- **jsdom named-element rescans** are patched out in `scripts/tubemap-cli.ts`
  (`skipNamedElementRescans`) through a jsdom internal. If a jsdom upgrade moves
  it, the CLI warns and renders without the patch: a 10 kb MHC window takes 43 s
  instead of 7 s. The upstream report is filed; jsdom #4264 fixed the
  attribute-change half and left tree changes invalidating unconditionally. Drop
  the patch once a jsdom release fixes the tree-change half.
- **Layout scaling.** With placement fixed, coarsened layout is linear at about
  2.5 µs per visit; `generateNodeOrder`, `mergeNodes`' predecessor/successor
  sets and `generateTrackIndexSequences` are the remaining top costs.
