# Differences from upstream sequenceTubeMap

A fork of [vgteam/sequenceTubeMap](https://github.com/vgteam/sequenceTubeMap),
branched at `33b7a7e` (2025-08-21) and about 200 commits ahead. The layout
algorithm and the vg/Express backend are still upstream's; most of what
surrounds them has changed.

Live:
[cmdcolin.github.io/sequenceTubeMap](https://cmdcolin.github.io/sequenceTubeMap/)
· upstream:
[vgteam.github.io/sequenceTubeMap](https://vgteam.github.io/sequenceTubeMap/)

## The in-browser data path

The biggest divergence. Upstream's demo needs a server running `vg`; its
in-browser fallback shells a WASM build of `gbz-base query` through a WASI shim,
over a whole local file, and returns `gam: []` — graphs only, no reads. This
fork replaces that:

- **`.gbz.db` read in pure TypeScript** via
  [`@gmod/gbz-base`](https://github.com/GMOD/gbz-base-js) — no WASM, no Rust
  toolchain, no vendored binary. It walks the SQLite b-trees directly and
  touches only the pages a query needs.
- **HTTP range requests on hosted graphs.** A 500 bp window into the 134 MB HPRC
  chr20 database costs roughly seven requests and half a megabyte, so
  whole-chromosome graphs browse from an object store without a download.
- **Reads in the browser too.** A from-scratch GAM reader (`src/api/gam/`):
  BGZF, libvgio type-tagged message framing, a hand-rolled protobuf `Alignment`
  decoder, and a parser for vg's `.gam.gai` binary-tree index, so a region query
  reads only the virtual-offset runs that can overlap the node range.
- **Real haplotype names.** With optional side tables written by
  `gbz-haplotype-index`, paths report as `sample#haplotype#contig` instead of
  `unknown#N`, and the paths panel shows exact lengths.

The GitHub Pages build ships `BACKEND_URL: false`, so the public demo runs with
no server at all. See [gbz-base.md](gbz-base.md).

## Uploading to the vgteam server

**File → Open…** can push `.xg`/`.vg`/`.gbz`/`.gam`/`.gaf`/`.gbwt` to the
vgteam's public `api.tubemap.graphs.vg`, which runs `vg` server-side and deletes
files after 24 hours (5 MB cap). With the in-browser mode and a self-hosted
backend, that makes three ways to load data. See [data.md](data.md).

## Headless rendering

`pnpm tubemap-cli` runs the same d3 layout under Node + jsdom and writes an SVG,
with no browser involved. Samples in
[tubemap-cli-samples/](tubemap-cli-samples/). See
[headless-rendering.md](headless-rendering.md).

## Visualization

- **Coarsened (Sankey) read view** — collapses per-read ribbons into one band
  per node→node edge, thickness scaled by traversing-read count, so rendering is
  O(edges) rather than O(reads). The bands go through the normal `placeReads`
  pipeline and inherit lane assignment, loop topology and coloring.
- **Ignore strand** — drops the reverse-strand aux palette, and merges (+A→+B)
  with (−B→−A) into one Sankey band.
- **Node labels** — node IDs on the graph, counter-scaled to stay readable at
  any zoom.
- **Named read groups** — each with its own palette, built by right-clicking a
  read ("show only this read", "add to group") or a node ("add the N reads
  through this node"). Pending sets show as removable chips.
- **Legend** for the active color schemes, including per-group palettes.
- **Level-of-detail rendering** — per-base sequence text and mismatch marks are
  skipped when zoomed out, and read counts are capped with a warning.

## Interface

Upstream puts every control in one long form down the page. This fork moves them
into a MUI AppBar — Examples / File / View menus, with contextual enable-disable
and inline help per option (View holds the display flags and the read options,
and opens the per-track visibility checklist as a dialog) — plus:

- a **paths panel** listing the contigs in the graph, so a region can be clicked
  rather than typed (with a warning before loading a slow path);
- a **region input** with format help and Enter-to-submit;
- **Copy link**, encoding the full view state as a URL (see
  [linking.md](linking.md));
- download progress for large remote files.

## Codebase

|            | upstream at fork point                                    | here                                                     |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------- |
| React      | 17, class components, PropTypes                           | 19, function components, React Compiler                  |
| Language   | mostly `.js`                                              | TypeScript (`tubemap.js` → 6.2k-line typed `tubemap.ts`) |
| Build      | CRA / react-scripts                                       | Vite + Vitest                                            |
| d3         | v5 (+ `d3-selection-multi`)                               | v7                                                       |
| UI kits    | MUI v4 **and** v5, react-bootstrap, reactstrap, bootstrap | MUI (inputs/dialogs) + reactstrap (layout only)          |
| Async data | hand-rolled `useEffect` + `AbortController`               | SWR everywhere                                           |
| Worker IPC | `worker-rpc`                                              | Comlink                                                  |
| Routing    | react-router                                              | none — query params only                                 |

Non-obvious calls are recorded as ADRs in
[`agent-docs/architectural-decision-records/`](../agent-docs/architectural-decision-records/).

## What is unchanged

The layout itself — node ordering, lane assignment, loop handling, read
placement — is upstream's, ported to TypeScript rather than rewritten. So are
the Express + `vg chunk` server, the tabix-indexed chunk support contributed by
Jean Monlong, BED region navigation, SVG download, and the example data.

## Trade-offs

- In-browser mode reads only `.gbz.db`, which needs a one-time `vg` +
  `gbz-base construct` conversion; upstream's server mode takes `.xg` and `.vg`
  directly.
- Remote `.gam` tracks are still downloaded whole — only graphs are range-read.
- The fork is not a maintained superset of upstream, and the diff is not kept
  mergeable back.
