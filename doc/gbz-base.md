# In-browser gbz-base reader

The browser-only LocalAPI reads `.gbz.db` files with
[`@gmod/gbz-base`](https://github.com/GMOD/gbz-base-js), a pure TypeScript
port of the `gbz-base query` subgraph queries. It walks the SQLite b-trees
directly and fetches only the pages a query touches, so:

- uploaded files are read in place from the `File` object (`BlobFile`);
- URL-hosted files are read by HTTP range requests (`RemoteFile`). A 500 bp
  window on the 134 MB HPRC v1.1 chr20 database (the bundled URL-hosted
  example, no side tables, default context) costs about seven requests and
  half a megabyte, not a 134 MB download. Bigger windows on the full HPRC
  v2.1 database cost proportionally more — the reader's README has numbers
  for MHC- and LPA-scale queries. The host needs CORS
  (`Access-Control-Allow-Origin`) and range support, which S3 and CloudFront
  provide.

No WebAssembly, no Rust toolchain, no vendored patches.

## What this app asks of the database

`GBZBaseAPI` (`src/api/GBZBaseAPI.ts`) uses a deliberately small slice of the
reader, which is worth stating plainly for anyone comparing implementations:

- `GBZBase.open(source)` once per graph, cached for the session.
- `db.getSubgraphForRange(pathQuery, start, end, { haplotypes: 'distinct' })`
  for every view. `distinct` means the app always wants *every* haplotype
  through the window, never a chosen subset.
- `subgraph.toSubgraphJson({ names: db.hasHaplotypeIndex ? 'resolved' :
  'anonymous' })`, converted to vg-style JSON in `src/api/gbz/schema.ts`.
- `db.paths()` for the "Paths in this graph" panel.

That is the whole surface. In particular the app does **not** use
`subgraphForHaplotypes`, so the `HaplotypeAnchors` table — which makes a query
for a chosen set of haplotypes cost only that set — is not exercised here.
It matters for consumers that draw one lane per selected haplotype, such as
JBrowse 2; the tube map always draws them all.

The package comes from npm (`@gmod/gbz-base`); `pnpm-workspace.yaml` lists
it under `minimumReleaseAgeExclude` so a fresh release installs without the
default waiting period.

## Building a `.gbz.db`

Install [`gbz-base`](https://github.com/jltsiren/gbz-base)
(`cargo install --git https://github.com/jltsiren/gbz-base`) and
[`vg`](https://github.com/vgteam/vg) if you are not starting from a `.gbz`:

```bash
# from an .xg (or .vg): build a GBZ with embedded paths
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
# from a GFA (keeps PanSN sample names intact)
vg gbwt -G input.gfa --gbz-format -g input.gbz

# GBZ -> SQLite database
gbz-base construct input.gbz            # writes input.gbz.db
gbz-base construct --output other.db --overwrite input.gbz
```

Releases up to 0.5.1 call the binary `gbz2db` instead of
`gbz-base construct`.

## Version compatibility

The reader accepts exactly one schema tag, `GBZ-base version 4`
(`SCHEMA_VERSION` in `@gmod/gbz-base`), which every `gbz-base` release from
0.5.0 on writes. Anything else — older or newer — is refused with a
`SchemaVersionError` rather than being read on a guess. A future upstream
version 5 would therefore need a matching reader release before this app
could open databases built with it.

`scripts/rebuild-bundled-dbs.sh` runs this over every `.gbz` under
`exampleData/`.

## Naming haplotypes (optional)

Upstream gbz-base cannot say which haplotype a subgraph path belongs to and
labels them `unknown#N#contig`. The package ships a small Rust tool that adds
side tables (`HaplotypeSamples`, `HaplotypeLengths`, `HaplotypeAnchors`) to an
existing database; with them, every haplotype through a window is reported
under its real `sample#haplotype#contig` name, and the paths panel shows exact
lengths. What the tables hold, and the `--output` form that writes them as a
companion file beside a database you did not build, is in the
[gbz-base README](https://github.com/GMOD/gbz-base-js#readme).

```bash
cd node_modules/@gmod/gbz-base/tools/haplotype-index && cargo build --release
./target/release/gbz-haplotype-index --interval 4096 graph.gbz graph.gbz.db
# or, without the .gbz at hand:
./target/release/gbz-haplotype-index --from-db graph.gbz.db
```

`--interval` (default 4096 bp) is the size/latency knob: it sets how far apart
the samples along each path are, so halving it roughly doubles the table and
halves the `lf()` walk needed to name a path that missed every sample. Small
graphs like the bundled examples are fine at the default; the published HPRC
v2.1 tables were built at 16384. `--anchor-spacing` (default 131072 bp) does
the same for `HaplotypeAnchors`.

Upstream `gbz-base query` keeps working on the augmented database. The
bundled `exampleData/micb-kir3dl1.gbz.db` (an HPRC slice from the package's
test data) has the side tables; `hprc-chrM.gbz.db` and the URL-hosted chr20
example do not, so their haplotypes still read `unknown#N`.

## Region syntax

`<contig>:<start>-<end>` queries the generic (`_gbwt_ref`) path;
`<sample>#<contig>:<start>-<end>` a PanSN reference path (haplotype 0);
`<sample>#<haplotype>#<contig>:<start>-<end>` a specific haplotype. Only
paths the database indexed for random access (generic paths and the samples
in the GBWT `reference_samples` tag) can be queried, whichever form is used.
