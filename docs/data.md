# Loading your own data

There are three ways to get a graph into the tube map. Use **File → Open…** in
the app for the first two.

|                                                     | Where the work happens  | Size limit    | Setup needed                  |
| --------------------------------------------------- | ----------------------- | ------------- | ----------------------------- |
| [vgteam server](#option-1--vgteam-server)           | `api.tubemap.graphs.vg` | 5 MB per file | none                          |
| [In-browser](#option-2--in-browser)                 | your browser            | none          | one-time walk-file conversion |
| [Self-hosted server](#option-3--self-hosted-server) | your machine            | none          | Docker or a local checkout    |

Running the Express backend yourself unlocks a further set of options — built-in
`Examples` entries, pre-extracted chunks, tabix indexes. Those live in
[server.md](server.md).

---

## Option 1 — vgteam server

The default. Files are uploaded to `api.tubemap.graphs.vg` (run by the vgteam),
processed by `vg` server-side, and deleted after 24 hours. **5 MB limit per
file.**

**Accepted formats**

| Track     | Formats                            |
| --------- | ---------------------------------- |
| Graph     | `.xg`, `.vg`, `.gbz`, `.pg`, `.hg` |
| Reads     | `.gam`                             |
| Haplotype | `.gbwt`                            |

A `.gam.gai` may be included but is ignored — the server sorts and indexes the
`.gam` itself. `.gaf` is not accepted here: it has to be sorted and
tabix-indexed beforehand, which the upload route cannot do, so a `.gaf` read
track only works when it is already mounted in a server's data directory.

**Prepare your graph** (if you don't have an `.xg` already):

```bash
# From a GFA (e.g. HPRC pangenome)
vg convert -g pangenome.gfa | vg index -x graph.xg -

# From a VG
vg index -x graph.xg graph.vg
```

Drop the graph and read files in the dialog and click **Upload & use**.

---

## Option 2 — In-browser

Everything runs in your browser — no server, no upload. Files never leave your
machine and there is no size limit. The browser reads a graph from
[gfa-to-tabix](https://github.com/GMOD/gfa-to-tabix) walk files, and fetches
only the tiles a region needs; see
[Reading gfa-to-tabix walk files](#reading-gfa-to-tabix-walk-files).

**Accepted formats**

| Track | Formats                                                            |
| ----- | ------------------------------------------------------------------ |
| Graph | `.walks.gz` with its `.idx`                                        |
| Graph | legacy: `.gbz.db` or `.db`, with an optional `.haplotype-index.db` |
| Reads | `.gam` (unsorted) or `.sorted.gam` + `.sorted.gam.gai` (indexed)   |

Drop a graph's companion files in with it: the upload dialog pairs a walk file
with its `.idx`, and `graph.haplotype-index.db` with `graph.gbz.db`.

### Reading gfa-to-tabix walk files

`gfa-to-tabix --walks` cuts every haplotype's path into pieces filed by
reference position, one walk file per reference sample, so the browser reads a
region with a few range requests and names every haplotype
`sample#haplotype#contig` without a companion index. The JBrowse graph track and
BandageJS read the same files, all through
[@jbrowse/graph-walks](https://github.com/GMOD/graph-walks).

```bash
cargo install gfa-to-tabix   # 5.0 or later
vg convert --no-translation -f graph.gbz > graph.gfa   # or any base-level GFA with W/P lines
gfa-to-tabix graph.gfa --walks --refs GRCh38 --sequences -o graph
```

- The command writes `graph.GRCh38.walks.gz` and its directory `.idx`. Give the
  walk file as the graph track, with its `.idx` dropped in beside it or at the
  same URL plus `.idx`
- The reader takes walk format 8, which gfa-to-tabix writes from 5.0, and asks
  for a rebuild of an older file
- `--sequences` adds the nodes' bases, which the tube map shows as node labels.
  Without it, nodes draw at the right width with no bases
- `--refs` takes several samples and writes a file for each. A file takes
  regions on the sample it was written for: `GRCh38#chr20:1000-2000`,
  `GRCh38#0#chr20:1000-2000`, or plain `chr20:1000-2000`
- A graph whose paths have no PanSN sample takes the reference path's name:
  `--refs 17` on the bundled snp1kg-BRCA1 graph writes
  `snp1kg-BRCA1.17.walks.gz`, and its regions read `17:1-100`
- A walk file takes no node region (`node:42-55`), since gfa-to-tabix indexes it
  by reference position
- Node ids are the GFA's, and a `.gam` read track draws over the walk file only
  where they are the ids the reads were aligned to. A GBZ built from a GFA whose
  segments it chopped or renamed writes the GFA's names back by default, so
  `--no-translation` is what keeps the GBZ's own ids

The cut is graph-walks' browser preset: the reference over the region plus 1,000
bp either side, and each haplotype from its first step there to its last. The
`.gbz.db` reader keeps 100 bp either side, so the same region draws 1,800 bp
wider from a walk file, and holds the same nodes and walks where the two
overlap. Where a haplotype leaves the reference at the edge for sequence of its
own, and the cut holds all of it, up to 65,536 bp, its walk runs on through
those nodes. Two of a contig's W lines that meet with none of its sequence
missing between them draw as one walk. A walk stops at the edge where the cut
holds only part of that sequence, or the graph lacks some of it, and a
haplotype's sequence past either end of the reference path is not drawn. On the
bundled chrM graph both readers name the same 44 haplotypes. A walk file can
also list a haplotype as [abridged](#abridged-walks) until it is read in full.

A view can keep another context than the preset's 1,000 bp:

- `context=100` in a link ([urlparams.md](urlparams.md#context)),
  `"context": 100` on a `DATA_SOURCES` entry in `config.json`, or
  `--context 100` on `pnpm tubemap-cli`, in bp. A region changed in the app
  keeps the context its link or data source set
- At 100 bp a region is framed as the `.gbz.db` reader frames it, which is what
  keeps a figure of a narrow window narrow: BRCA1 at `17:1-100` draws 2,296
  units across in place of 9,395
- The default is unchanged, and it is the one to keep outside a figure. Every
  graph-walks reader cuts by the same preset, so the same region draws the same
  graph in JBrowse, BandageJS and here, and a view with its own context no
  longer matches them
- A smaller context can also draw less of a haplotype. A cut attaches a
  departure's own nodes only where it leaves or rejoins the reference on the
  region or its context, so a haplotype that leaves inside the region and
  rejoins past a narrow context stops where it leaves, where a wider one would
  have drawn it through
- A `.gbz.db` ignores the setting

A window past graph-walks' budgets, 4,000,000 steps or 8 MB of walk rows, or the
node limit is refused, with the width that would fit where one does. One whose
departure records come to more than 2 MB, usually at a collapsed repeat, is
refused at any width.

HPRC release 2.1 has a hosted walk file, which the **HPRC v2.1 whole genome
(gfa-to-tabix walks, URL-hosted)** example reads. It was written without
`--sequences`, so its nodes draw with no bases:

```json
{
  "trackFile": "https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38-f8.GRCh38.walks.gz",
  "trackType": "graph"
}
```

#### Abridged walks

gfa-to-tabix gives each tile a cost budget. In a tile over it, usually a
satellite array, the writer moves the costliest walks' steps to detail records
that a window doesn't read
([walks-format.md](https://github.com/GMOD/gfa-to-tabix/blob/main/docs/walks-format.md#abridged-tiles)).

- A bar over the tube map lists each abridged walk as a block, such as
  `HG00133#1: 170 kb off the reference not loaded`: the bp of the walk's runs
  off the reference that the window did not load, in the words graph-walks'
  `abridgedText` gives every reader. The map leaves out a walk with such a run
- Clicking a block reads that walk in full and redraws. Double-clicking a walk
  to follow it does the same when the window abridged it
- A walk read in full stays so for every region of that file, until its × under
  **Read in full** abridges it again
- The node limit and the draw limit apply to the cut with the walk in full

At HPRC v2.1's LPA KIV-2 array, `GRCh38#chr6:160614798-160647758`, read in full,
HG00133#1 runs 150 kb through the array, and HG00133#2 166 kb.

### Converting a graph to `.gbz.db`

`.gbz.db` is the legacy format: the browser still reads it, through
[`@gmod/gbz-base`](https://github.com/GMOD/gbz-base-js), but new graphs should
be walk files. Three things only a `.gbz.db` does here:

- a node region (`node:42-55`)
- the Reads column of the paths panel, which counts an uploaded GAM's reads on
  each path
- a haplotype's own sequence past the end of the reference path, which a walk
  file's cut leaves out

This needs [`gbz-base`](https://github.com/jltsiren/gbz-base)
(`cargo install --git https://github.com/jltsiren/gbz-base`), and
[`vg`](https://github.com/vgteam/vg) (`mamba install -c bioconda vg`) if you are
not starting from a `.gbz`:

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
`scripts/rebuild-bundled-dbs.sh` runs the conversion over every `.gbz` under
`exampleData/`.

The app recognizes any graph track ending in `.db`, not only `.gbz.db`, since
`--output` will call the database whatever you like. The reader refuses a file
that turns out not to be a gbz-base database when it opens it, not when it is
named.

The reader accepts exactly one schema tag, `GBZ-base version 4`
(`SCHEMA_VERSION` in `@gmod/gbz-base`), which every `gbz-base` release from
0.5.0 on writes. It refuses anything else, older or newer, with a
`SchemaVersionError` rather than reading it on a guess, so a future upstream
version 5 would need a matching reader release first.

### Naming haplotypes (optional)

Upstream gbz-base names only the query path, so by default the other haplotypes
are reported as `unknown#N#contig`. The Rust tool `gbz-haplotype-index` writes a
companion haplotype index (tables `HaplotypeSamples`, `HaplotypeLengths`,
`HaplotypeAnchors`) beside the database; with it, every haplotype through a
window is reported under its real `sample#haplotype#contig` name, and the paths
panel shows exact lengths. The tool never touches the database, which stays
exactly what `gbz-base construct` wrote. What the tables hold is in the
[gbz-base docs](https://github.com/GMOD/gbz-base-js/blob/main/docs/haplotype-index.md).

```bash
cargo install gbz-haplotype-index
gbz-haplotype-index graph.gbz graph.gbz.db graph.haplotype-index.db
# or, without the .gbz at hand:
gbz-haplotype-index --from-db graph.gbz.db graph.haplotype-index.db
```

Naming `graph.gbz.db` between the GBZ and the index checks that the two match.
The tool refuses to replace an existing index without `--overwrite`.

Build cost scales with total path length, not graph size: the full HPRC v2.1
graph (5.5 GB GBZ, 53,150 paths, 1,305 Gbp walked) takes about 13 minutes on 24
cores and yields a 7.9 GB companion. The bundled examples take seconds.

`--interval` (default 4096 bp) is the size/latency knob: it sets how far apart
the samples along each path are, so halving it roughly doubles the table and
halves the `lf()` walk needed to name a path that missed every sample. Small
graphs like the bundled examples are fine at the default; the published HPRC
v2.1 index was built at 16384. `--anchor-spacing` (default 32768 bp in 0.3.0)
does the same for `HaplotypeAnchors`.

gbz-base 7 reads the index only from a companion, and only format 3, which
`gbz-haplotype-index` 0.3 writes; it refuses any other. A database built by an
older `gbz-haplotype-index` with the tables inside it now reports `unknown#N`
like any other; `--from-db` builds its companion without the GBZ. The bundled
`exampleData/hprc-chrM.gbz.db` (110 kB) and `exampleData/micb-kir3dl1.gbz.db`
(an HPRC slice from the package's test data) each have a `.haplotype-index.db`
beside them, which `scripts/rebuild-bundled-dbs.sh` regenerates.

#### Pointing a track at a companion index

The graph track names the companion beside the database:

```json
{
  "trackFile": "https://example.org/graph.gbz.db",
  "haplotypeIndexFile": "https://example.org/graph.haplotype-index.db",
  "trackType": "graph"
}
```

`haplotypeIndexFile` works wherever a graph track is spelled out for the
in-browser backend — `DATA_SOURCES` in `src/config.json`, or `tracksJson=` in a
link — and the browser reads it by range request like the database itself. Only
that backend uses it: a vg server ignores it, since the graph it chunks carries
the path names already.

The published HPRC release 2.1 graph shows why the index is a file of its own.
HPRC hosts the 10 GB database, JBrowse hosts the 7.9 GB companion, and the
bundled "HPRC v2.1 whole genome" example reads both:

```json
{
  "trackFile": "https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38.gbz.db",
  "haplotypeIndexFile": "https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38.haplotype-index.f3.db",
  "trackType": "graph"
}
```

Measured against those two files from a home connection, 500 bp inside _LPA_'s
KIV-2 array (`GRCh38#chr6:160620000-160620500`, the example's default region): 2
s, 15 range requests, 1 MB, for 57 nodes and 23 distinct haplotype walks — named
`HG03942#2#CM088404.1` rather than `unknown#2`.

The paths panel is the other reason to name the index. It asks for a length per
indexed path, and the companion answers that out of `HaplotypeLengths` instead
of walking the graph to the end of each one: the release 2.1 graph's 292 indexed
paths cost 2.3 s and 3.6 MB with the companion open, and 6 s and 41 MB without
it.

### Indexing reads for region queries

Drop an unsorted `.gam` to scan every alignment, or sort and index it so only
the blocks overlapping the region are read:

```bash
vg gamsort input.gam -i input.sorted.gam.gai > input.sorted.gam
```

Drop both `.sorted.gam` and `.sorted.gam.gai` into the dialog together. A
`.sorted.gam` dropped again on its own is read unindexed, since the index
dropped earlier describes the earlier file.

### Loading

In the dialog click **Switch to in-browser →**, drop your files, and click
**Load files**. The browser reads an uploaded file in place from its `File`
object, and it never leaves your machine.

A walk-file set or `.gbz.db` hosted on an HTTPS server with CORS
(`Access-Control-Allow-Origin`) and range support, which S3 and CloudFront
provide, can instead be given as a track URL. The browser reads it by range
requests rather than downloading it, so a whole-pangenome graph works without
pulling the whole file. The bundled **HPRC v2.1 whole genome** examples are
exactly that: a 1.6 GB walk file on jbrowse.org, and the legacy 10 GB `.gbz.db`
on HPRC's S3, where a 500 bp window costs 15 requests and a megabyte. Bigger
windows cost proportionally more; the gbz-base reader's README has numbers for
MHC- and LPA-scale queries.

### Which bundled examples read in the browser

The **Examples** menu groups its entries by backend. A `(gfa-to-tabix walks)` in
the name marks a graph the browser reads itself, and `(gbz-base)` the legacy
`.gbz.db` copy of the same graph.

![The Examples menu, grouped by backend](images/examples-menu-grouped.png)

That is the menu with a server configured. In-browser mode shows the first group
alone, since it is the only one it can open — `Discovered` is whatever
`manifest.json` files the server's data directory holds
([server.md](server.md)). The in-browser entries, from `DATA_SOURCES` in
`src/config.json`:

| Example                                                 | Graph                                 | Haplotype names                                                                |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| snp1kg-BRCA1 (gfa-to-tabix walks)                       | bundled, with a `.gam` read track     | the path `17`                                                                  |
| cactus (gfa-to-tabix walks)                             | bundled, with a `.gam` read track     | the three paths' own                                                           |
| backward (gfa-to-tabix walks)                           | bundled, `fwd` and `rev` paths        | `fwd` and `rev`                                                                |
| HPRC chrM (gfa-to-tabix walks)                          | bundled, PanSN sample names           | real, from the walk file                                                       |
| HPRC MICB-KIR3DL1 (gfa-to-tabix walks)                  | bundled, an HPRC slice of 46 samples  | real, from the walk file                                                       |
| HPRC v2.1 whole genome (gfa-to-tabix walks, URL-hosted) | hosted, 1.6 GB, read by range request | real, from the walk file                                                       |
| snp1kg-BRCA1, cactus and backward (gbz-base)            | the same graphs as `.gbz.db`          | `_gbwt_ref` and `unknown#N`                                                    |
| HPRC chrM and MICB-KIR3DL1 (gbz-base)                   | the same graphs as `.gbz.db`          | real, from a bundled [companion index](#pointing-a-track-at-a-companion-index) |
| HPRC v2.1 whole genome (gbz-base, URL-hosted)           | hosted, 10 GB, read by range request  | real, from the [companion index](#pointing-a-track-at-a-companion-index)       |

`exampleData/build.sh` rebuilds the bundled walk files. The `rev` path of the
backward graph runs 200 bp past the start of `fwd`, which only its `.gbz.db`
draws.

Everything else in the menu — `snp1kg-BRCA1`, `vg "small" example`, `cactus`,
`cactus multiple reads`, `Lancet example` — is an `.xg`/`.vg`/`.gbz` graph that
`vg chunk` has to cut, so it needs the vgteam server or a self-hosted one and
the in-browser mode hides it.

---

## Option 3 — Self-hosted server

Run the full `vg` + Express server yourself, for files over the 5 MB cap or for
data you don't want to upload.

```bash
docker run -it -p 3210:3000 -v $(pwd):/data quay.io/jmonlong/sequencetubemap:vg1.74.1
```

Open http://localhost:3210 and set the backend URL under **Backend
configuration** at the bottom of the page. [server.md](server.md) covers SSH
tunnelling, building the image, and what the data directory can hold once the
server is running.

---

## Finding contig names

Open **Paths in this graph** in the sidebar to browse the paths a graph
contains. In the browser, with an uploaded `.gbz.db` and a read file of up to 32
MB, it also counts the reads on each path; for a hosted file it leaves the Reads
column out, since counting means downloading the whole GAM. Region syntax:

|                  | Example          |
| ---------------- | ---------------- |
| Coordinate range | `chr1:1000-2000` |
| Start + length   | `chr1:1000+500`  |
| Node ID range    | `node:42-55`     |
| Node + context   | `node:42+5`      |

A node region is cut the way `vg chunk` cuts it, by either backend: `node:42-55`
is the nodes with those ids and everything within 20 edges of them, and
`node:42+5` is node 42 and everything within five. In the browser only a
`.gbz.db` takes one. The browser refuses a node region that spans more than
10,000 ids or takes in more than 10,000 nodes, since each can be a range
request. With no path to anchor it, a node region has no ruler, and in the
browser its walks are named only when the graph has a
[companion index](#naming-haplotypes-optional).

### Region syntax for PanSN graphs

`<contig>:<start>-<end>` queries the generic (`_gbwt_ref`) path;
`<sample>#<contig>:<start>-<end>` a PanSN reference path (haplotype 0);
`<sample>#<haplotype>#<contig>:<start>-<end>` a specific haplotype. Only paths
the database indexed for random access (generic paths and the samples in the
GBWT `reference_samples` tag) can be queried, whichever form is used.

### Fragmented contigs

A graph that splits a contig into fragments lists one row per fragment, all
under the contig's name, so each row also carries the offset it starts at —
which is what **Load** and **Copy to region** put in the Region field. HPRC
release 2.1 does this heavily: 292 indexed paths under 219 distinct names.

![Four fragments of CHM13#chr1 in the paths panel](images/paths-panel-fragments.png)

## How wide a region will draw

A tube map draws every haplotype through the window, and the cost of that is the
number of nodes those haplotypes visit between them rather than the number of
bases or nodes on their own: one node that 464 haplotypes walk is 464 ribbon
segments. On a pangenome graph it climbs fast, and superlinearly, because a
wider window is also a window more haplotypes diverge in. Measured on HPRC
release 2.1, which carries 464:

| Region                                     | Nodes | Distinct walks | Node visits |
| ------------------------------------------ | ----: | -------------: | ----------: |
| `GRCh38#chr6:160620000-160620500` (500 bp) |    57 |             23 |         874 |
| `GRCh38#chr20:48000600-48001000` (400 bp)  |   104 |            240 |      14,518 |
| `GRCh38#chr6:31500000-31502000` (2 kb)     |   129 |             25 |       2,146 |
| `GRCh38#chr6:31500000-31510000` (10 kb)    |   712 |            157 |      73,282 |
| `GRCh38#chr6:31500000-31550000` (50 kb)    | 2,498 |            300 |     495,391 |
| `GRCh38#chr6:31500000-31650000` (150 kb)   | 6,651 |            450 |   1,975,561 |

Above 30,000 node visits the app stops before drawing and says what the region
came to:

![The render cap refusing a 10 kb window](images/graph-render-cap.png)

Measured in Chrome, the 10 kb row draws in a second but then takes 400 ms per
zoom step, and the 50 kb row takes 10 s to draw. **Draw anyway** is there when
you mean it.

The count is of what is drawn, so a window folded with the View menu's **Fold
variants under** ([fold-variants.md](fold-variants.md)) is counted after the
fold: the 51 kb window in the README is 9 nodes and 35 visits folded at 1 kb.

**Coarsen** is the better answer on a graph with no reads loaded: the coarsened
view draws one band per node-to-node edge instead of one ribbon per visit, so it
gets a cap of 1,000,000 visits instead. Coarsened, the 10 kb row draws in 0.6 s
and zooms at 30 ms a step; the 50 kb row draws in 1.3 s and zooms at 85 ms a
step; the 150 kb row takes 4 s and 300 ms or more a step, so it stays refused.

### How wide a region will load

The render cap counts what arrived, and past a point the fetch is the problem:
in the browser the same MHC locus is 76 MB of JSON at 150 kb and 221 MB at 500
kb, and 1 Mb is more than a tab holds. So a region wider than 200 kb is held
before its fetch, with a notice and a **Load anyway** button, whether it was
typed or arrived in a shared link. Width says little about size on its own (a
sparse graph loads far wider windows), so this is the only guard that asks
rather than refuses. Two backstops sit behind it: the browser stops reading a
path region at 50,000 nodes, before it has read a haplotype, and says how wide a
region would have fit; and the vgteam server refuses a region wider than its
`maxRegionBp` (2 Mb by default, see [request limits](server.md#request-limits)).

A coarsened window wide enough to hold a structural variant is still far wider
than a page, so a figure of one is best cropped to its breakpoints. Across the
30 kb window `GRCh38#chr1:109675000-109705000`, about 70% of the HPRC v2.1
haplotypes skip GSTM1, the common 18 kb deletion. The dark band leaves the
reference near 109,683,900, where a paler band of the haplotypes that keep the
gene carries on through it:

![Start of the GSTM1 deletion](images/hprc-v2.1-gstm1-deletion-start.png)

The same band rejoins near 109,702,400:

![End of the GSTM1 deletion](images/hprc-v2.1-gstm1-deletion-end.png)

The whole window lays out 94,708 by 244 units even with compressed node widths.
The crops come from one render, reframed by its viewBox since `rsvg-convert`
cannot rasterize anything that wide:

```bash
pnpm tubemap-cli --source 'HPRC v2.1 whole genome (gbz-base, URL-hosted)' \
                 --region 'GRCh38#chr1:109675000-109705000' \
                 --coarsened --compressed --out gstm1.svg
sed '0,/viewBox="[^"]*"/s//viewBox="52000 -20 3700 245"/' gstm1.svg |
  rsvg-convert -b white -o docs/images/hprc-v2.1-gstm1-deletion-start.png
sed '0,/viewBox="[^"]*"/s//viewBox="83900 -20 3700 245"/' gstm1.svg |
  rsvg-convert -b white -o docs/images/hprc-v2.1-gstm1-deletion-end.png
```

The cap resets with each new region, and `pnpm tubemap-cli` ignores it.

To see the shape of a window too wide to draw, **View → Open in BandageJS**
shows it as a force-directed graph, which costs nodes rather than node visits.

Reads are capped separately and subsampled rather than refused, since dropping
reads still leaves a true picture of the graph; the banner above the map says
how many of them are drawn.

## Graph requirements

A graph must contain haplotype or path information — only nodes covered by at
least one haplotype or path are drawn, so a graph with none renders nothing.
