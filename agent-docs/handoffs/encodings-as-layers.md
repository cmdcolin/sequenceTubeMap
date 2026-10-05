---
name: encodings-as-layers-handoff
description:
  Where the grammar-of-graphics thread stands after read and haplotype facets
  landed, and the next moves in order.
---

# Encodings as layers: handoff

Landed on master: draw-time encoding, the topology/placement split, layers, read
facets and haplotype facets. `git log` has the commits, and
[the todo](../todo/encodings-as-layers.md) describes how each piece works and
lists the open gaps. Figures live in `doc/images/layers-*.png` and
`doc/images/facets-*.png`, with their commands in `doc/headless-rendering.md`.

## Next moves, in order

1. **Sample-subset selector for haplotype facets.** A stack of hundreds of
   panels draws every one. Pick samples by name or by count, in the View menu
   and the URL. Pairs with
   [wide pangenome windows](../todo/wide-pangenome-windows.md), which selects
   haplotypes through `subgraphForHaplotypes`; reuse its selection rather than
   building a second one.
2. **Per-region facets.** Needs the module-level state in `src/util/tubemap.ts`
   (about 20 `let`s, `config`, hover state, subscriber stores, one `svgID` and
   one zoom) turned into an instance. Shared scales and one legend across panels
   follow from that. Do it only when a concrete comparison needs it: the
   refactor shows nothing by itself.
3. **Close the small gaps** listed under "Open gaps" in the todo: repeated node
   outline ids, read counts taken after subsampling, one band set for two banded
   read files, the node dialog's haplotype count across panels.
4. **A view spec in the URL.** `facet=`, `vis=` and `mapq=` carry the view as
   separate parameters; the todo's sketch has one spec naming layers, stats and
   encodings. Defer until a fourth encoding or layer option would add yet
   another parameter.

## Checks before publishing `@gmod/tubemap-core`

The package is not private, and the landed changes break its API: shapes lost
`color` and `alpha`, `trackColor` and `trackAlpha` are gone, and
`layoutTopology`, `placeTubeMap`, `placeFacets` and `layers` are new. No
consumer in this repo uses the removed fields; the JBrowse plugin and any other
outside consumer are unchecked. Bump the version and note the break in
`packages/tubemap-core/README.md` before publishing.

## Open questions

- Read-group coloring has no CLI or URL surface, so no figure shows it.
- `doc/images/layers-mapq.png` is the weakest gallery image: the legend overlaps
  the crop and the point takes a moment to see. Redo it or cut it.
- Each layer scales its band widths separately, so a two-read band can draw as
  wide as an eight-haplotype band. Decide whether that is acceptable or whether
  bands share one scale.

## Working notes

`EnterWorktree` branches from `origin/master`, which can lag local `master`. Run
`git rebase master` in a new worktree before editing, or the checks run against
old files. Subagents have done the heavy work well when given the todo, the
relevant commits and explicit constraints: keep goldens unchanged for existing
options, review changed goldens semantically, and look at every screenshot
before keeping it.
