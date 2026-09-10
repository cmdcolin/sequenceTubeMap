# In-browser gbz-base reader

The browser-only LocalAPI reads `.gbz.db` files with
[`@gmod/gbz-base`](https://github.com/GMOD/gbz-base-js), a pure TypeScript port
of the `gbz-base query` subgraph queries. It walks the SQLite b-trees directly
and fetches only the pages a query touches, so:

- uploaded files are read in place from the `File` object (`BlobFile`);
- URL-hosted files are read by HTTP range requests (`RemoteFile`). A 500 bp
  window on HPRC release 2.1's 10 GB database — the bundled URL-hosted example —
  costs 15 requests and a megabyte, not a 10 GB download. Bigger windows cost
  proportionally more; the reader's README has numbers for MHC- and LPA-scale
  queries. The host needs CORS (`Access-Control-Allow-Origin`) and range
  support, which S3 and CloudFront provide.

No WebAssembly, no Rust toolchain, no vendored patches.

## Which bundled examples use it

The **Examples** menu groups its entries by backend, and a `(gbz-base)` in the
name says the same thing: that graph is a `.gbz.db` the browser reads itself.
The entries that read one, from `DATA_SOURCES` in `src/config.json`:

| Example                                     | Graph                                      | Haplotype names                          |
| ------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| snp1kg-BRCA1 (gbz-base)                     | bundled, with a `.gam` read track          | `_gbwt_ref` paths, no haplotypes         |
| cactus (gbz-base)                           | bundled, with a `.gam` read track          | `_gbwt_ref` paths, no haplotypes         |
| backward (gbz-base)                         | bundled, `fwd` and `rev` paths             | `_gbwt_ref` paths, no haplotypes         |
| HPRC chrM (gbz-base, companion index)       | bundled, PanSN sample names                | real, from a bundled [companion index](#pointing-a-track-at-a-companion-index) |
| HPRC MICB-KIR3DL1 (gbz-base, named haplotypes) | bundled, an HPRC slice                  | real, side tables inside the database     |
| HPRC v2.1 whole genome (gbz-base, URL-hosted) | hosted, 10 GB, read by range request     | real, from the [companion index](#pointing-a-track-at-a-companion-index) |

Everything else in the menu — `snp1kg-BRCA1`, `vg "small" example`, `cactus`,
`cactus multiple reads`, `Lancet example` — is an `.xg`/`.vg`/`.gbz` graph that
`vg chunk` has to cut, so it needs the vgteam server or a self-hosted one and
the in-browser mode hides it.

## What this app asks of the database

`GBZBaseAPI` (`src/api/GBZBaseAPI.ts`) uses a deliberately small slice of the
reader, which is worth stating plainly for anyone comparing implementations:

- `GBZBase.open(source, { haplotypeIndex })` once per graph, cached for the
  session. The second source is the optional companion index described under
  [naming haplotypes](#naming-haplotypes-optional).
- `db.getSubgraphForRange(pathQuery, start, end + 1, { haplotypes: 'distinct', signal })`
  for every view. `distinct` means the app always wants _every_ haplotype
  through the window, never a chosen subset. The `+ 1` is the coordinate
  convention: the server's `vg chunk -p contig:start-end` includes `end`,
  gbz-base treats it as exclusive, and the Region field means the same thing
  whichever backend answers it.
- `subgraph.toSubgraphJson({ names: db.hasHaplotypeIndex ? 'resolved' : 'anonymous' })`,
  converted to vg-style JSON in `src/api/gbz/schema.ts`.
- `db.paths()` for the "Paths in this graph" panel.

That is the whole surface. In particular the app does **not** use
`subgraphForHaplotypes`, so the `HaplotypeAnchors` table — which makes a query
for a chosen set of haplotypes cost only that set — is not exercised here. It
matters for consumers that draw one lane per selected haplotype, such as JBrowse
2; the tube map always draws them all.

The package comes from npm (`@gmod/gbz-base`); `pnpm-workspace.yaml` lists it
under `minimumReleaseAgeExclude` so a fresh release installs without the default
waiting period.

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

Releases up to 0.5.1 call the binary `gbz2db` instead of `gbz-base construct`.

Either name works: the app recognizes any graph track ending in `.db`, not only
`.gbz.db`, since `--output` will call the database whatever you like. A file
that turns out not to be a gbz-base database is refused when it is opened, not
when it is named.

## Version compatibility

The reader accepts exactly one schema tag, `GBZ-base version 4`
(`SCHEMA_VERSION` in `@gmod/gbz-base`), which every `gbz-base` release from
0.5.0 on writes. Anything else — older or newer — is refused with a
`SchemaVersionError` rather than being read on a guess. A future upstream
version 5 would therefore need a matching reader release before this app could
open databases built with it.

`scripts/rebuild-bundled-dbs.sh` runs this over every `.gbz` under
`exampleData/`.

## Naming haplotypes (optional)

Upstream gbz-base cannot say which haplotype a subgraph path belongs to and
labels them `unknown#N#contig`. The package ships a small Rust tool that adds
side tables (`HaplotypeSamples`, `HaplotypeLengths`, `HaplotypeAnchors`) to an
existing database; with them, every haplotype through a window is reported under
its real `sample#haplotype#contig` name, and the paths panel shows exact
lengths. What the tables hold, and the `--output` form that writes them as a
companion file beside a database you did not build, is in the
[gbz-base README](https://github.com/GMOD/gbz-base-js#readme).

```bash
cd node_modules/@gmod/gbz-base/tools/haplotype-index && cargo build --release
./target/release/gbz-haplotype-index --interval 4096 graph.gbz graph.gbz.db
# or, without the .gbz at hand:
./target/release/gbz-haplotype-index --from-db graph.gbz.db
```

Build cost scales with total path length, not graph size: the full HPRC v2.1
graph (5.5 GB GBZ, 53,150 paths, 1,305 Gbp walked) takes about 13 minutes on 24
cores and yields a 7.9 GB companion database. The bundled examples take seconds.

`--interval` (default 4096 bp) is the size/latency knob: it sets how far apart
the samples along each path are, so halving it roughly doubles the table and
halves the `lf()` walk needed to name a path that missed every sample. Small
graphs like the bundled examples are fine at the default; the published HPRC
v2.1 tables were built at 16384. `--anchor-spacing` (default 131072 bp) does the
same for `HaplotypeAnchors`.

Upstream `gbz-base query` keeps working on the augmented database. The bundled
`exampleData/micb-kir3dl1.gbz.db` (an HPRC slice from the package's test data)
carries the side tables inside it, so its haplotypes read as real
`sample#haplotype#contig` names. `exampleData/hprc-chrM.gbz.db` does not: its
tables are the separate `exampleData/hprc-chrM.haplotype-index.db`, which is the
form below, 53 kB beside a 110 kB database.

### Pointing a track at a companion index

A database somebody else hosts cannot be augmented in place, which is what
`--output` is for: the side tables go in a file of their own, and the graph
track names it beside the database.

```json
{
  "trackFile": "https://example.org/graph.gbz.db",
  "haplotypeIndexFile": "https://example.org/graph.haplotype-index.db",
  "trackType": "graph"
}
```

`haplotypeIndexFile` works wherever a graph track is spelled out for the
in-browser backend — `DATA_SOURCES` in `src/config.json`, or `tracksJson=` in a
link — and is read by range request like the database itself. Only that backend
uses it: a vg server ignores it, since the graph it chunks carries the path
names already.

The published HPRC release 2.1 graph is the case this exists for. HPRC hosts the
10 GB database, JBrowse hosts the 7.9 GB companion, and the bundled "HPRC v2.1
whole genome" example reads both:

```json
{
  "trackFile": "https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38.gbz.db",
  "haplotypeIndexFile": "https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38.haplotype-index.anchored.db",
  "trackType": "graph"
}
```

Measured against those two files from a home connection, 500 bp inside _LPA_'s
KIV-2 array (`GRCh38#chr6:160620000-160620500`, the example's default region):
2 s, 15 range requests, 1 MB, for 57 nodes and 23 distinct haplotype walks —
named `HG03942#2#CM088404.1` rather than `unknown#2`.

The paths panel is the other reason to name the index. It asks for a length per
indexed path, and the companion answers that out of `HaplotypeLengths` instead
of walking the graph to the end of each one: the release 2.1 graph's 292 indexed
paths cost 2.3 s and 3.6 MB with the companion open, and 6 s and 41 MB without
it. That is why `getPathInfo` takes the index as well as the query path — the
panel asks by filename alone, and a second database opened without the index
would be slow in exactly the place a user waits.

## Region syntax

`<contig>:<start>-<end>` queries the generic (`_gbwt_ref`) path;
`<sample>#<contig>:<start>-<end>` a PanSN reference path (haplotype 0);
`<sample>#<haplotype>#<contig>:<start>-<end>` a specific haplotype. Only paths
the database indexed for random access (generic paths and the samples in the
GBWT `reference_samples` tag) can be queried, whichever form is used.
