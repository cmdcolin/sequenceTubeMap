# Server data preparation

Everything here applies when you run the Express + `vg` backend yourself —
either from a checkout (`pnpm start`) or from the
[Docker image](../docker/README.md). If you are only uploading files through the
dialog or using in-browser mode, [data.md](data.md) is the doc you want.

## The data path

The server looks for data files in `dataPath`, set in `src/config.json` and
defaulting to `exampleData/`:

```json
"dataPath": "<path to my data folder>/",
```

A relative path is resolved against the repository root. Restart the server
after changing it.

To use files from that directory, choose `custom (mounted files)` in the data
dropdown, then click the gear icon to add tracks.

## Built-in Examples entries

The `DATA_SOURCES` array in `src/config.json` populates the **Examples** menu.
Each entry is a `ViewTarget`:

```json
{
  "name": "my example",
  "tracks": [
    { "trackFile": "exampleData/my.gbz.db", "trackType": "graph" },
    { "trackFile": "exampleData/my.gam", "trackType": "read" }
  ],
  "region": "chr1:1-500",
  "bedFile": "exampleData/my.bed",
  "dataType": "built-in"
}
```

Selecting an entry loads it immediately. When the default region is large or
slow to render, add `"skipAutoLoad": true` so the view waits for the user to
press Go.

## Preparing full graphs

Indexing a `.vg` into an `.xg` makes access faster:

```bash
cd scripts/
./prepare_vg.sh <vg_file>
```

If `.vcf.gz` and `.vcf.gz.tbi` files sit next to the `.vg`, they are used to
build a GBWT index of haplotypes from the VCF. That requires the `.vg` to
contain alt paths, from `vg construct -a`.

To index a GAM for region queries:

```bash
cd scripts/
./prepare_gam.sh <gam_file>
```

Both scripts write their output next to the input files, so move the results
into `dataPath` afterwards.

## Pre-fetching subgraphs

The tube map fetches data when a region is queried, which can take 10–20
seconds. Regions you already know you will visit can be extracted ahead of time
into chunk directories referenced from a BED file.

Run `scripts/prepare_chunks.sh` from the directory holding your inputs and
receiving the chunks — normally `dataPath`:

```bash
cd exampleData/
../scripts/prepare_chunks.sh -x mygraph.xg -h mygraph.gbwt -r chr1:1-100 \
  -d 'Region A' -o chunk-chr1-1-100 -g mygam1.gam -g mygam2.gam >> mychunks.bed
../scripts/prepare_chunks.sh -x mygraph.gbz -r chr1:101-200 \
  -d 'Region B' -o chunk-chr1-100-200 -g mygam1.gam -g mygam2.gam >> mychunks.bed
```

The BED file it appends to carries two nonstandard columns — a description of
the region (column 4) and the chunk's output directory (column 5), tab
separated:

```
chr1	1	100	Region A	chunk-chr1-1-100
chr1	101	200	Region B	chunk-chr2-101-200
```

It must live in `dataPath`, or be hosted on the web alongside its chunk
directories and given as a URL.

### Colouring specific nodes

A `nodeColors.tsv` inside a chunk directory — one node name per line — makes
those nodes render in a different colour. `prepare_chunks.sh` writes it from a
space-delimited `-n` argument:

```bash
../scripts/prepare_chunks.sh -x mygraph.xg -h mygraph.gbwt -r chr1:1-100 \
  -d 'Region A' -o chunk-chr1-1-100 -g mygam1.gam -n "1 2 3" >> mychunks.bed
```

## Pre-extracted subgraphs

`scripts/prepare_local_chunk.sh` takes a subgraph that has already been
extracted from a larger graph, rather than a full graph. It supports most of
`prepare_chunks.sh`'s options, apart from haplotype files, and also accepts
`.gaf` files (converted to GAM with `vg convert`).

It assumes the graph covers some region along a reference path present in the
graph, given with `-r`. Path names in the subgraph must _not_ use
bracket-enclosed subregion suffixes, and the name in the region must match a
path in the graph exactly.

```bash
cd exampleData/
../scripts/prepare_local_chunk.sh -x subgraph.gbz -r chr5:1023911-1025911 \
  -g subgraph_reads.gam -g other_sample_reads.gam \
  -g another_sample_reads.gaf -o subgraph1 >> subgraphs.bed
```

The graph can be `.vg`, `.xg`, `.gfa`, or anything else vg understands, but it
**must be in the same node ID space as the reads**, and the script does not
check this. Indexing a GFA and mapping to it with `vg giraffe` can cut the
original GFA nodes into pieces with new numbers, so the original GFA will not
work. Check with `vg validate subgraph.gfa --gam subgraph_reads.gam`; read
alignments that jump around absurdly are the symptom.

Leave the original subgraph file in place under `dataPath` — the tube map reads
it when listing the paths it contains, and errors if it has moved.

The result is that selecting the BED file and its region shows a precomputed
view of the subgraph, with coordinates computed as if it covers the region
passed to `-r`.

### Node ID renaming in GFA files

vg keeps node IDs unchanged when every node name is a strictly positive integer.
String-named nodes trigger renaming: it begins at the first string-named node,
using the highest integer seen so far (+1), or 1 if the very first node is
string-named, and every node after that is renumbered sequentially regardless of
its original name.

```
Original -> Renamed
3 -> 3
1 -> 1
five -> 4
7 -> 5
four -> 6
```

Account for this when interpreting the visualization.

## Tabix-based indexes

An alternative to `vg chunk` for whole pangenomes: three tabix-indexed files
queried directly, avoiding a full graph index. See [tabix.md](tabix.md).
