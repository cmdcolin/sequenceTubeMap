# TODO / unfinished clarifications

Working notes for things that need more thought before they make it into
user-facing docs or final UX.

## PanSN query input asymmetry

The Region field currently accepts `sample#contig:start-end`. If the user
types a 3-part PanSN name like `HG00438#2#MT:1-100`, `GBZBaseAPI` parses
sample/contig as `parts[0]` / `parts[parts.length-1]` and silently drops
everything in between (`src/api/GBZBaseAPI.ts:266-267`). Even if we kept
the haplotype field, gbz-base's `query` CLI has no `--haplotype` flag — it
infers haplotype 0 (or whatever's marked reference) from `--sample` +
`--contig`. So:

- **Query input**: 2-part — effectively `sample#contig`, rooted at the
  reference path. Haplotype always defaults to the indexed reference.
- **Response output**: 3-part — every haplotype traversing the queried
  node range is returned with its real `sample#haplotype#contig` name
  (after the `vendor/gbz-base-patch/` resolve step). Tooltips and the
  visibility panel surface those.

The README previously tried to document this asymmetry inline, but the
wording kept tripping people up. Open questions before re-adding to the
README:

- Should the Region field reject 3-part input with a friendly message
  ("haplotype field unused — drop it") instead of silently ignoring it?
- Could we lift the limitation by querying once per matching path
  (e.g. `--sample HG00438 --contig MT` for every haplotype index)? That
  would need either an upstream gbz-base CLI change or a frontend-side
  multi-query merge.
- Worth landing a small inline help tooltip on the Region input that
  explains "query the reference path; response includes all haplotypes"?

For now, point users at the bundled "HPRC chrM" example as the working
demo and let them figure out the pattern from the visible tooltips.

## Whole-chromosome HPRC graphs

A full HPRC chromosome (e.g. chr20) is ~130 MB as a `.gbz.db` — too big to
bundle in this repo. The bundled "HPRC chr20 (URL-hosted, full PanSN)"
example fetches it from `https://jbrowse.org/demos/ivg/hprc/` instead, so
opening it costs one 130 MB download on first query (cached in memory
for the rest of the session) and you get the full set of real PanSN
sample names in the visibility panel and hover tooltips.

To set up your own URL-hosted example, the direct GFA → GBZ conversion
keeps every sample name intact:

```bash
vg gbwt -G hprc-v1.1-mc-grch38.chr20.gfa --gbz-format -g chr20.gbz
gbz2db chr20.gbz chr20.gbz.db
# Upload chr20.gbz.db to an HTTPS object store with CORS allowed for your
# deployed origin (Access-Control-Allow-Origin response header), then add:
```

```json
{
  "name": "HPRC chr20",
  "tracks": [
    { "trackFile": "https://your-bucket/chr20.gbz.db", "trackType": "graph" }
  ],
  "region": "GRCh38#chr20:30000000-30000500",
  "dataType": "built-in"
}
```

Open questions before promoting this back to the README:

- 130 MB first-load is slow on weak connections; the progress UI we added
  helps but doesn't eliminate the wait. Would Range-request streaming be
  feasible against gbz-base WASM (it currently loads the file into WASI
  fs upfront)?
- PathsPanel is empty until the file finishes downloading; a tiny
  pre-computed manifest sidecar could populate it early.
- Default region (`chr20:30000000-30000500`) was picked semi-arbitrarily —
  is there a more biologically interesting demo region?
