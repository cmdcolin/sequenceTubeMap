# Loading your own data

There are three ways to get a graph into the tube map. Use **File → Open…** in
the app for the first two.

|                                                     | Where the work happens  | Size limit    | Setup needed                  |
| --------------------------------------------------- | ----------------------- | ------------- | ----------------------------- |
| [vgteam server](#option-1--vgteam-server)           | `api.tubemap.graphs.vg` | 5 MB per file | none                          |
| [In-browser](#option-2--in-browser)                 | your browser            | none          | one-time `.gbz.db` conversion |
| [Self-hosted server](#option-3--self-hosted-server) | your machine            | none          | Docker or a local checkout    |

Running the Express backend yourself unlocks a further set of options — built-in
`Examples` entries, pre-extracted chunks, tabix indexes. Those live in
[server-data.md](server-data.md).

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
machine and there is no size limit.

**Accepted formats**

| Track | Formats                                                          |
| ----- | ---------------------------------------------------------------- |
| Graph | `.gbz.db` or `.db`                                               |
| Reads | `.gam` (unsorted) or `.sorted.gam` + `.sorted.gam.gai` (indexed) |

### Converting a graph to `.gbz.db`

This needs two tools, once per graph:

- [`vg`](https://github.com/vgteam/vg) — `mamba install -c bioconda vg`
- [`gbz-base`](https://github.com/jltsiren/gbz-base) —
  `cargo install --git https://github.com/jltsiren/gbz-base`

```bash
# .xg (or .vg) → .gbz → .gbz.db
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
gbz-base construct input.gbz
```

If you already have a `.gbz`, skip the first command. Starting from a GFA
instead, `vg gbwt -G input.gfa --gbz-format -g input.gbz` keeps PanSN sample
names intact.

By default haplotypes are reported as `unknown#N`. To get real
`sample#haplotype#contig` names, run the optional `gbz-haplotype-index` step —
that, and the rest of the `.gbz.db` details, are in [gbz-base.md](gbz-base.md).

### Indexing reads for region queries

Drop an unsorted `.gam` to scan every alignment, or sort and index it so only
the blocks overlapping the region are read:

```bash
vg gamsort input.gam -i input.sorted.gam.gai > input.sorted.gam
```

Drop both `.sorted.gam` and `.sorted.gam.gai` into the dialog together.

### Loading

In the dialog click **Switch to in-browser →**, drop your files, and click
**Load files**. A `.gbz.db` hosted on an HTTPS server with CORS and range
support can instead be given as a track URL — it is read by range requests
rather than downloaded, so whole-chromosome graphs work without pulling the
whole file.

---

## Option 3 — Self-hosted server

Run the full `vg` + Express server yourself, for files over the 5 MB cap or for
data you don't want to upload.

```bash
docker run -it -p 3210:3000 -v $(pwd):/data quay.io/jmonlong/sequencetubemap:vg1.74.1
```

Open http://localhost:3210 and set the backend URL under **Backend
configuration** at the bottom of the page. See
[../docker/README.md](../docker/README.md) for SSH tunnelling and build
instructions, and [server-data.md](server-data.md) for what you can do with the
data directory once it is running.

---

## Finding contig names

Open **Paths in this graph** in the sidebar to browse the paths a graph
contains. Region syntax:

|                  | Example          |
| ---------------- | ---------------- |
| Coordinate range | `chr1:1000-2000` |
| Start + length   | `chr1:1000+500`  |
| Node ID range    | `node:42-55`     |
| Node + context   | `node:42+5`      |

For PanSN graphs, `<sample>#<contig>:<start>-<end>` and
`<sample>#<haplotype>#<contig>:<start>-<end>` select a specific reference path
or haplotype; see [gbz-base.md](gbz-base.md#region-syntax).

## Graph requirements

A graph must contain haplotype or path information — only nodes covered by at
least one haplotype or path are drawn, so a graph with none renders nothing.
