# @gmod/tubemap-core

sequenceTubeMap's layout: graph nodes and paths (and reads) in, tube map shapes
out. No DOM, d3 or React.

```ts
import { curvePaths, layoutTubeMap, nodeOutlinePath } from '@gmod/tubemap-core'

const layout = layoutTubeMap(
  [
    { name: '1', seq: 'ACGT' },
    { name: '2', seq: 'A' },
    { name: '3', seq: 'G' },
    { name: '4', seq: 'TTGCA' },
  ],
  [
    { id: 0, name: 'ref', sequence: ['1', '2', '4'], sourceTrackID: 0 },
    { id: 1, name: 'alt', sequence: ['1', '3', '4'], sourceTrackID: 0 },
  ],
  [], // reads
  { nodeWidthOption: 'compressed' },
)
```

- Track 0 is the reference; `-name` is a reverse visit
- A node without `seq` needs `sequenceLength`
- `layout.shapes`: `rectangles`, `curves` (`curvePaths` adds SVG paths),
  `verticalRectangles` and `corners` (inversions)
- Shapes carry no color: each names its track's `id`, and the caller colors it
  from that track in `layout.tracks`, so a recolor needs no new layout
- `nodeOutlinePath(node)`: a node's box as SVG path data; `new Path2D(d)` on a
  canvas
- `layout.nodes` has a hole at index 0: use `forEach` or `filter`, not
  `for...of` or `find`

## Topology and placement

`layoutTubeMap` runs two phases, also exported for running one topology under
several placements:

```ts
const topology = layoutTopology(nodes, tracks, reads, topologyOptions)
const all = placeTubeMap(topology)
const confident = placeTubeMap(topology, { mappingQualityCutoff: 30 })
```

- `layoutTopology` merges, orders, orients and sizes the nodes under the visible
  tracks and every primary read, and fixes each node's x from placing them all
- `placeTubeMap` lays out the haplotypes and the reads its options keep at the
  topology's x positions, so every placement of one topology lines up
- Read filters never move a node; one only a filtered-out read visits keeps its
  place, drawn empty

## Options

- `nodeWidthOption`: `normal` (default), `compressed`, `small`, `fixed`
- `charWidth`: px per base under `normal` (8.401)
- `trackWidth`: tube width (15)
- `mergeNodes`, `showReads` (true); `coarsenedReadView`, `ignoreStrand` (false)
- `mappingQualityCutoff`, `focusReadNames`: read filters, the only placement
  options; the rest belong to the topology

## Releasing

- Bump `version`, commit, push tag `tubemap-core-v<version>`
- `.github/workflows/publish-tubemap-core.yml` tests and publishes it
