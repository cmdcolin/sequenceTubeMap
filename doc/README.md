# Documentation

Start at the [project README](../README.md).

## Using the tube map

- [Introduction to the Sequence Tube Map](intro.md) — what a sequence graph is
  and what the visualization shows
- [Loading your own data](data.md) — the three ways to get a graph in
- [Deep-link URL format](linking.md) — sharing and bookmarking a view
- [Headless SVG rendering](headless-rendering.md) — `pnpm tubemap-cli`

## Running a server

- [Server data preparation](server-data.md) — data paths, Examples entries,
  pre-fetched chunks, pre-extracted subgraphs
- [Tabix-based pangenome indexes](tabix.md) — whole-pangenome browsing without a
  graph index
- [Docker container](../docker/README.md)

## Under the hood

- [Architecture](architecture.md) — how a region becomes a drawn tube map
- [In-browser gbz-base reader](gbz-base.md) — the `.gbz.db` path in detail
- [Differences from upstream sequenceTubeMap](differences-from-upstream.md)

## Contributing

- [Development guide](development.md) — setup, dev server, tests, build
- [Architectural decision records](../agent-docs/architectural-decision-records/)
