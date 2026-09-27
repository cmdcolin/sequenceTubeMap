# @gmod/tubemap-core

The sequenceTubeMap layout on its own: give it a graph's nodes and the paths
(and reads) through it, and it returns tube map shapes in layout coordinates. It
has no DOM, d3 or React dependency, so a canvas, an SVG string or another app
can draw the result. The sequenceTubeMap app draws it with d3; the JBrowse graph
genome plugin draws it on a canvas.

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
  {
    nodeWidthOption: 'compressed',
    trackColor: t => (t.id ? 'purple' : 'teal'),
  },
)
```

A node name prefixed `-` is a reverse visit. Track 0 is the reference: the
layout straightens it and orders every other node around it.

`layout.shapes` holds what to draw, back to front:

- `rectangles` — a track's straight runs, through nodes and between them
- `curves` — a track changing lanes between columns; `curvePaths(curves, type)`
  returns them in draw order with an SVG `path` set on each
- `verticalRectangles` and `corners` — a track turning around at an inversion
- `nodeOutlinePath(node)` — each node's rounded outline, for every node with an
  `x` (unreached nodes have none)

Paths are SVG path data, so on a canvas `ctx.fill(new Path2D(curve.path))` draws
the same shape.

`layout.nodes` is 1-indexed with a hole at 0, so iterate it with `forEach` or
`flatMap`, which skip holes, rather than `for...of`.

## Options

| option                 | default     |                                                  |
| ---------------------- | ----------- | ------------------------------------------------ |
| `nodeWidthOption`      | `'normal'`  | `normal`, `compressed` (log2), `small`, `fixed`  |
| `charWidth`            | `8.401`     | px per base under `normal`                       |
| `mergeNodes`           | `true`      | merge runs of nodes every track passes through   |
| `showReads`            | `true`      |                                                  |
| `coarsenedReadView`    | `false`     | one band per edge, weighted by read count        |
| `ignoreStrand`         | `false`     | coarsened bands merge both traversals of an edge |
| `mappingQualityCutoff` | `0`         | drop reads below it                              |
| `focusReadNames`       | `null`      | draw only these reads                            |
| `trackColor`           | categorical | `(track, highlight) => color`                    |
| `trackAlpha`           | `1`         | `(track) => alpha`                               |

## Developing

The package lives in the sequenceTubeMap repo as a pnpm workspace member, and
the app imports its TypeScript source directly. `pnpm build` here emits `dist/`,
which is what npm gets.
