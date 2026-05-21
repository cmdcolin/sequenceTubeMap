#### vgv

Pangenome graph viewer. Runs in-browser via WebAssembly — no server needed, nothing uploaded.

> **vgv** is a fork of the excellent [sequenceTubeMap / IVG](https://github.com/vgteam/sequenceTubeMap) by the vgteam. Same core tube-map visualization, with WASM-only mode, ribbon-style reads, MUI rewrite, and other additions on top.

**Opening data** — File → Sample data for built-ins, or File → Open custom files for your own `.gbz.db` / `.gam` / `.gbwt` files. Use the Track Picker to add tracks.

[How to prepare your own files →](https://github.com/cmdcolin/sequenceTubeMap/blob/master/doc/data.md#browser-only-wasm-mode-npm-run-startlocal)

---

**Region format**

| | Example |
|---|---|
| Coordinate range | `chr1:1000-2000` |
| Start + length | `chr1:1000+500` |
| Node ID range | `node:42-55` |

Use **Paths in this graph** to browse contig names.

---

**BED file** — jump between pre-extracted regions with Prev / Next.

**Simplify** — hides small snarls (SNPs, indels). Disabled when reads are loaded.

---

[Docs & source →](https://github.com/cmdcolin/sequenceTubeMap) · [Deep-link URLs →](https://github.com/cmdcolin/sequenceTubeMap/blob/master/doc/linking.md)
