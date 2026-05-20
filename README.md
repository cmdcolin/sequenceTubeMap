# Sequence Tube Map — MemPanG26 Edition

![MemPanG26 Edition](public/mempang26-badge.svg)

> **MemPanG26 Hackathon Team 2** — Colin Diesh & [Rafeed Rahman Turjya](https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en)
>
> This is a modernized fork of the upstream [vgteam/sequenceTubeMap](https://github.com/vgteam/sequenceTubeMap). Key improvements over upstream:
>
> - **Browser-native WASM mode** — visualize GBZ graphs locally without a server, powered by [gbz-base](https://github.com/jltsiren/gbz-base) WASM (built locally; accepts modern `vg gbwt --gbz-format` output). See [TL;DR](#browser-only-wasm-mode-tldr) below.
> - **Full TypeScript conversion** — frontend components and utilities converted to TypeScript with strict types
> - **Read filtering by click** — interactive read group panel; click reads to filter, group, and color them independently
> - **React 19 + React Compiler** — eliminates manual `useMemo`/`useCallback` boilerplate; components rebuilt as functions
> - **Performance** — faster `placeReads`, large-path rendering, and d3 zoom coalescing; fit-to-height initial zoom
> - **Legend component** — color legend for active graph, haplotype, and read tracks
> - **MUI v9 UI** — standardized on Material UI v9 for selects, dialogs, and autocomplete inputs
> - **Paths panel** — browse and load paths directly from the panel with live region updates
> - **vg stderr surfaced** — server-side vg errors are now forwarded to the browser
>
> *[MemPanG26 demo](https://cmdcolin.github.io/sequenceTubeMap/)* | *[Upstream demo](https://vgteam.github.io/sequenceTubeMap/)*
>
> Development assisted by [Claude Code](https://claude.ai/code).

### No server required

The upstream proxies all graph queries through a `vg` backend at `api.tubemap.graphs.vg`. This fork replaces it with in-browser WebAssembly ([gbz-base](https://github.com/jltsiren/gbz-base)): GBZ parsing and GAM extraction run entirely in your browser — the demo at `cmdcolin.github.io` is a static GitHub Pages site with no backend.

Pre-process files once (see [TL;DR](#browser-only-wasm-mode-tldr)), then host statically or run locally with `npm run start:local`.

### Browser-only WASM mode (TL;DR)

`npm run start:local` runs without a `vg` server. Graphs must be `.gbz.db`,
reads must be indexed `.gam`. To prepare your own:

```bash
# .xg -> .gbz -> .gbz.db
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
node scripts/gbz2db.mjs input.gbz input.gbz.db

# .gam -> .gam.gai (indexed)
./scripts/prepare_gam.sh input.gam
```

Region syntax is `<contig>:<start>-<end>` (e.g. `Circ1:0-1320`); open the
"Paths in this graph" panel in the UI to see available contig names.
Details and caveats: [doc/wasm-build.md](doc/wasm-build.md).

## Contributing

Rebuilding the in-browser WASM backend (only needed when bumping gbz-base): [doc/wasm-build.md](doc/wasm-build.md).

## License

Copyright (c) 2018 Wolfgang Beyer, licensed under the MIT License.
