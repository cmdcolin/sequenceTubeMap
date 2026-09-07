# Differences from upstream sequenceTubeMap

This app is a fork of [vgteam/sequenceTubeMap](https://github.com/vgteam/sequenceTubeMap),
branched at commit `33b7a7e` (2025-08-21) and about 200 commits ahead. The tube
map layout algorithm and the vg/Express backend are still recognisably
upstream's; almost everything around them has changed.

Live: [cmdcolin.github.io/sequenceTubeMap](https://cmdcolin.github.io/sequenceTubeMap/) ·
upstream: [vgteam.github.io/sequenceTubeMap](https://vgteam.github.io/sequenceTubeMap/)

---

## 1. The in-browser data path

This is the biggest divergence. Upstream's demo needs a server running `vg`;
its in-browser fallback shells a WASM build of `gbz-base query` through a WASI
shim, over a whole local file, and returns `gam: []` — graphs only, no reads.

This fork replaces that entirely:

- **`.gbz.db` read in pure TypeScript** via
  [`@gmod/gbz-base`](https://github.com/GMOD/gbz-base-js) — no WASM, no Rust
  toolchain, no vendored binary. It walks the SQLite b-trees directly and
  touches only the pages a query needs.
- **HTTP range requests on hosted graphs.** A 500 bp window into the 134 MB
  HPRC chr20 database costs roughly seven requests and half a megabyte, so
  whole-chromosome graphs browse from an object store without a download. This
  is the part that WASM-over-a-local-Blob structurally could not do.
- **Reads in the browser too.** A from-scratch GAM reader
  (`src/api/gam/`) — BGZF, libvgio type-tagged message framing, a hand-rolled
  protobuf `Alignment` decoder, and a parser for vg's `.gam.gai` binary-tree
  index so a region query reads only the virtual-offset runs that can overlap
  the node range.
- **Real haplotype names.** With optional side tables written by
  `gbz-haplotype-index`, paths report as `sample#haplotype#contig` instead of
  upstream's `unknown#N`, and the paths panel shows exact lengths.

The GitHub Pages build ships with `BACKEND_URL: false`, so the public demo is
genuinely serverless. See [gbz-base.md](gbz-base.md).

## 2. Uploading to the vgteam server

**File → Open…** can also push `.xg`/`.vg`/`.gbz`/`.gam`/`.gaf`/`.gbwt` to the
vgteam's public `api.tubemap.graphs.vg`, which runs the real `vg` toolchain and
deletes files after 24 hours (5 MB cap). So the fork offers three ways in —
vgteam server, fully in-browser, or your own self-hosted backend — where
upstream effectively assumes the last one.
See [uploading.md](uploading.md).

## 3. Headless rendering

`pnpm tubemap-cli` runs the same d3 layout under Node + jsdom and emits static
SVG/PNG — no browser, no screenshot. Useful for scripting and for putting a
tube map in a paper. Samples in
[tubemap-cli-samples/](tubemap-cli-samples/). See
[headless-rendering.md](headless-rendering.md).

## 4. Visualization features

- **Coarsened (Sankey) read view** — collapses per-read ribbons into one band
  per node→node edge, thickness scaled by traversing-read count. Rendering
  becomes O(edges) instead of O(reads), which is what makes deep-coverage
  regions browsable at all. The bands go through the normal `placeReads`
  pipeline, so they inherit lane assignment, loop topology and coloring.
- **Ignore strand** — drops the reverse-strand aux palette, and merges
  (+A→+B) with (−B→−A) into one Sankey band.
- **Node labels** — node IDs drawn on the graph, counter-scaled so they stay
  readable at any zoom.
- **Named read groups** — group reads, give each group its own palette, and
  build groups by right-clicking a read ("show only this read", "add to
  group") or a node ("add the N reads through this node"). Pending sets show
  as removable chips.
- **Legend** showing the active color schemes, including per-group palettes.
- **Level-of-detail rendering** — per-base sequence text and mismatch marks
  are skipped when zoomed out, and read counts are capped with a warning
  rather than locking the tab up.

## 5. Interface

Upstream puts every control in a long form down the page. This fork moves them
into a MUI **AppBar** — File / Examples / View / Reads / Visibility menus with
contextual enable-disable and inline help on each option — plus:

- a **paths panel** that lists the contigs in the graph so you can click one
  instead of hand-typing a region (with a warning before loading a slow path);
- a **region input** with format help and Enter-to-submit;
- **Copy link** producing a deep-link URL that encodes the full view state
  (see [linking.md](linking.md));
- download progress for large remote files, and SVG/PNG export.

## 6. Codebase

| | upstream at fork point | here |
|---|---|---|
| React | 17, class components, PropTypes | 19, function components, React Compiler |
| Language | mostly `.js` | TypeScript (`tubemap.js` → 6.2k-line typed `tubemap.ts`) |
| Build | CRA / react-scripts | Vite + Vitest (webpack for the prod bundle) |
| d3 | v5 (+ `d3-selection-multi`) | v7 |
| UI kits | MUI v4 **and** v5, react-bootstrap, reactstrap, bootstrap | MUI (inputs/dialogs) + reactstrap (layout only) |
| Async data | hand-rolled `useEffect` + `AbortController` | SWR everywhere |
| Worker IPC | `worker-rpc` | Comlink |
| Routing | react-router | none — query params only |

Non-obvious calls are recorded as short ADRs in
[`agent-docs/architectural-decision-records/`](../agent-docs/architectural-decision-records/).

## 7. What is unchanged

The tube map layout itself — node ordering, lane assignment, loop handling,
the read placement algorithm — is upstream's work, ported to TypeScript rather
than rewritten. The Express + `vg chunk` server, the tabix-indexed chunk
support contributed by Jean Monlong, the BED region navigation, and the
example data all come from upstream too.

## 8. Trade-offs

- In-browser mode only reads `.gbz.db`. Getting there needs a one-time
  `vg` + `gbz-base construct` conversion; upstream's server mode eats `.xg`
  and `.vg` directly.
- Remote `.gam` tracks are still downloaded whole — only graphs are
  range-read.
- The fork tracks upstream loosely; it is not a maintained superset, and no
  attempt has been made to keep the diff mergeable back.

---

_Much of this fork was built with Claude Code during the
[MemPanG26](https://pangenome.github.io/MemPanG26/) hackathon._
