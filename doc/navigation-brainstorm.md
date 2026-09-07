# Tube Map navigation — brainstorm

Hackathon notes on making it easier for users to "navigate" a sequence tube map
without having to know paths, coordinates, or node IDs up front. Motivating
case: a fragmented circular mitochondrial pangenome (`exampleData/Toxo`) with
many `Circ*` contigs and reads that cycle through shared nodes.

## What's there today

### Region input syntax
`src/common.ts` (`parseRegion`) and `src/components/RegionInput.tsx` accept:

- `path:start-end`
- `path:start+distance`
- `node:N-M` and `node:N+context` — node-ID navigation already exists

### Server endpoints
`src/server.mjs`:

- `/getPathNames` returns names only (`vg paths -L`, or `tabix -l` in pgtabix
  mode). **No lengths returned.** That's the root cause of the crash class —
  the UI can't bounds-check.
- `/getChunkedData` shells out to `vg chunk` (or `chunkix.py` in tabix mode).
  Out-of-bounds end coordinate produces:
  `error[vg chunk]: input region Circ1:0-99999999 is out of bounds of path Circ1 which has length 2017`
  and the request 500s.

### URL params already work
`src/urlViewTarget.ts` (`urlParamsToViewTarget`) does
`qs.parse(parsed.search.substr(1))`. A CLI launcher just needs to construct a
`qs.stringify`-style URL — no new URL schema needed.

### Click handlers are half-wired
`src/util/tubemap.ts`:

- `nodeSingleClick` (line 3404) populates an info panel — works.
- `nodeDoubleClick` (line 4390) writes to a legacy DOM `nodeID` input that's
  no longer in the modern HeaderForm. Re-targeting it to `handleRegionChange`
  is a small change.

## Toxo dataset shape

- 23 nodes, 31 edges, cyclic (`vg stats -A` → cyclic).
- 12 `Circ*` paths (1097–2922 bp), heavily overlapping.
  Node 18 lives in 4+ paths, node 13 in 5.
- 6635 reads, mean ~1.4 kb, cycling through nodes.
- The whole graph fits in one chunk: `node:1-23` returns 23 nodes / 12 paths
  in well under a second.

So for this class of graph, **rendering the entire thing is fine** — the user
just needs a way to ask for it.

## Useful vg / odgi primitives we're not using yet

| Command | Output | Use |
|---|---|---|
| `vg paths -E -x g.xg` | name + length | bounds-check before sending |
| `vg paths -C` | per-path cyclicity | UI hint for circular paths |
| `vg paths -X -p name` | JSON walk (node sequence) | breadcrumbs / step nav |
| `vg stats -r` | min:max node ID | "render all" default region |
| `vg find -n ID -c K` | K-step neighborhood | click-to-expand from a node |
| `vg find -N file -c K` | K-step neighborhood of a node set | multi-node region |
| `vg depth -g aln g.xg` | per-node coverage | rank "hot" entry nodes from reads |
| `odgi extract -n ID -c K` | same as vg find but on odgi | alternative backend |
| `odgi server` | HTTP coordinate liftover | could front lookups |

## Ideas — ordered roughly by leverage

### 1. Add `/getPathInfo` (lengths + cyclicity)
One `vg paths -E` (and `-C`) call when a graph is selected, cached server-side
per graph file. `RegionInput` then shows `Circ1: 0–2017 (cyclic)` and clamps
`end ≤ length` before the Go button enables. Kills the crash class entirely.
Cheapest, biggest correctness win.

For pgtabix mode the same info is derivable from `pos.bed.gz` with
`tabix pos.bed.gz <path>` and a max-end aggregation, or precomputed once.

### 2. "Paths in this graph" panel
Sidebar listing the paths from the graph with length, node count, and a
"Load full path" button per row. For the Toxo workflow this replaces typing
names entirely. Trivial once #1 is in.

### 3. Re-wire `nodeDoubleClick`
Pass a callback from `HeaderForm` into `TubeMap` so double-click sets
`region = "node:ID+context"` and triggers Go. Single-click already shows the
info panel — leave it. Now the user navigates by clicking around.

### 4. Multi-node region syntax
Extend `parseRegion` to accept `nodes:5,7,13+2` (set + context). Server uses
`vg find -N <file> -c K` instead of `vg chunk`. Lets the user *grow* a
node-of-interest set by shift-clicking, which is the natural workflow for a
fragmented mito where there's no single reference path.

### 5. CLI launcher script
`scripts/open-tubemap.py --graph foo.xg --gam foo.gam --nodes 5,7,13 [--port 3000]`
emits a URL using the same `qs` schema `CopyLink.tsx` already produces, prints
it, and optionally `xdg-open`s the browser. No server change needed — purely
uses the existing URL→viewTarget plumbing. Pairs perfectly with #4.

Sketch of the URL format (matches what CopyLink emits today):

```
http://localhost:3000/?
  tracks[0][trackFile]=Toxo_SB_numeric.xg&
  tracks[0][trackType]=graph&
  tracks[1][trackFile]=...sorted.gam&
  tracks[1][trackType]=read&
  region=nodes:5,7,13%2B2&
  dataType=mounted+files
```

### 6. Whole-graph "All" button
For graphs under some node threshold (or always — let the user click), set
`region = node:<min>-<max>` from `vg stats -r`. Toxo loads the whole thing in
one shot.

### 7. Read-driven entry suggestions
When a GAM is attached, run `vg depth -g` once, surface top-N most-covered
nodes as quick-jump chips. For the cycling-reads case this surfaces the
"interesting" nodes without the user knowing anything about the graph.

### 8. Path-walk breadcrumbs
After landing in `Circ1:500-1000`, show "step 4/9 along Circ1" with prev/next
buttons that walk node-by-node using the `vg paths -X` walk. Helps build a
mental model on a cyclic graph.

## Recommended hackathon path

A small, compounding stack:

- **#1** path lengths — fixes the crash, unlocks bounds-aware UI
- **#2** paths panel — biggest discoverability win for Toxo
- **#3** click-to-navigate — turns the rendering into the navigator
- **#5** CLI launcher + **#4** multi-node URL syntax — scripts the entry point

Each is independently shippable, and together they remove nearly all manual
coordinate typing for a Toxo-style workflow.
