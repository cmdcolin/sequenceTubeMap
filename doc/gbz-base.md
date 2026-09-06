# In-browser gbz-base reader

The browser-only LocalAPI reads `.gbz.db` files with
[`@gmod/gbz-base`](https://github.com/GMOD/gbz-base-js), a pure TypeScript
port of the `gbz-base query` subgraph queries. It walks the SQLite b-trees
directly and fetches only the pages a query touches, so:

- uploaded files are read in place from the `File` object (`BlobFile`);
- URL-hosted files are read by HTTP range requests (`RemoteFile`). A 500 bp
  window on the 134 MB HPRC chr20 database costs about seven requests and
  half a megabyte, not a 134 MB download. The host needs CORS
  (`Access-Control-Allow-Origin`) and range support, which S3 and CloudFront
  provide.

No WebAssembly, no Rust toolchain, no vendored patches. `GBZBaseAPI`
(`src/api/GBZBaseAPI.ts`) opens each graph once with `GBZBase.open`, answers
`getChunkedData` with `subgraphInInterval(..., { haplotypes: 'distinct' })`,
and converts `subgraph.toJSON()` (the same JSON `gbz-base query --format json`
prints) into vg-style JSON in `src/api/gbz/schema.ts`. The "Paths in this
graph" panel comes from `db.paths()`.

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
`gbz-base construct`. Databases from either read fine; the reader looks the
schema up by table name, not version.

`scripts/rebuild-bundled-dbs.sh` runs this over every `.gbz` under
`exampleData/`.

## Naming haplotypes (optional)

Upstream gbz-base cannot say which haplotype a subgraph path belongs to and
labels them `unknown#N#contig`. The package ships a small Rust tool that adds
two side tables (`HaplotypeSamples`, `HaplotypeLengths`) to an existing
database; with them, every haplotype through a window is reported under its
real `sample#haplotype#contig` name, and the paths panel shows exact lengths.

```bash
cd node_modules/@gmod/gbz-base/tools/haplotype-index && cargo build --release
./target/release/gbz-haplotype-index --interval 4096 graph.gbz graph.gbz.db
# or, without the .gbz at hand:
./target/release/gbz-haplotype-index --from-db graph.gbz.db
```

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
