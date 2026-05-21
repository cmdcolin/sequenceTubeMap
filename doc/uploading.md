# Loading your own data

Use **File → Open…** in the app. The dialog offers two processing modes and
switches automatically to the vgteam server when first opened.

---

## Option 1 — vgteam server (recommended)

Files are uploaded to `api.tubemap.graphs.vg` (run by the vgteam), processed
by `vg` server-side, and deleted after 24 hours. **5 MB limit per file.**

**Accepted formats**

| Track | Formats |
|-------|---------|
| Graph | `.xg`, `.vg`, `.gbz`, `.pg`, `.hg` |
| Reads | `.gam`, `.gaf`, `.gaf.gz` |
| Haplotype | `.gbwt` |

**Prepare your graph** (if you don't have an `.xg` already):

```bash
# From a GFA (e.g. HPRC pangenome)
vg convert -g pangenome.gfa | vg index -x graph.xg -

# From a VG
vg index -x graph.xg graph.vg
```

**Prepare reads** (optional, for sorted/indexed region queries):

```bash
vg gamsort -i reads.sorted.gam.gai reads.gam > reads.sorted.gam
```

Drop the graph and read files in the dialog and click **Upload & use**.

---

## Option 2 — In-browser / WASM

Everything runs in your browser via WebAssembly — no server, no upload.
Files never leave your machine. No file size limit.

**Accepted formats**

| Track | Formats |
|-------|---------|
| Graph | `.gbz.db` or `.db` |
| Reads | `.gam` (unsorted) or `.sorted.gam` + `.sorted.gam.gai` (indexed) |

**Requires two tools:**

- [`vg`](https://github.com/vgteam/vg) — `mamba install -c bioconda vg`
- [`gbz-base`](https://github.com/jltsiren/gbz-base) — `cargo install gbz-base`

**Convert your graph once:**

```bash
# .xg → .gbz → .gbz.db
vg gbwt --xg-name input.xg --index-paths --gbz-format -g input.gbz
gbz2db input.gbz input.gbz.db

# Starting from a GFA
vg gbwt -G input.gfa --gbz-format -g input.gbz
gbz2db input.gbz input.gbz.db
```

In the dialog click **Switch to in-browser (WASM) →** then drop your `.gbz.db`
and `.gam` files and click **Load files**.

> **Note:** the in-browser parser uses a patched build of `gbz-base` (patch not
> yet accepted upstream). Generating `.gbz.db` files uses the standard release.

---

## Option 3 — Self-hosted server

Run the full `vg` + Express server yourself for larger files or private data.

```bash
docker run -it -p 3210:3000 -v $(pwd):/data quay.io/jmonlong/sequencetubemap:vg1.48.0
```

Open http://localhost:3210 and set the backend URL in **Backend configuration**
at the bottom of the page. See [../docker/README.md](../docker/README.md) for
SSH tunneling and build instructions.

---

## Video tutorial

_TODO: record and embed screencast here_
