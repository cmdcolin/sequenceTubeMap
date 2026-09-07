# TODO / unfinished clarifications

Working notes for things that need more thought before they make it into
user-facing docs or final UX.

## PanSN query input asymmetry

The Region field accepts `contig`, `sample#contig` and `sample#haplotype#contig`
(`pathQueryFor` in `src/api/GBZBaseAPI.ts`); `@gmod/gbz-base` takes the
haplotype number, so a 3-part name is no longer silently truncated. What still
limits it is the database: only paths gbz-base indexed for random access
(generic paths and the GBWT `reference_samples`) can anchor a query, so
`HG00438#2#MT:1-100` fails with "has not been indexed for random access" unless
that sample was a reference sample at construction time.

- **Query input**: any indexed path, in any of the three forms.
- **Response output**: 3-part — every haplotype traversing the queried node
  range is returned. Names are real `sample#haplotype#contig` when the database
  has the `HaplotypeSamples` side tables (`gbz-haplotype-index`, see
  `doc/gbz-base.md`); otherwise `unknown#N#contig`, as upstream emits.

Open questions:

- Should the Region field explain the "not indexed" failure with a hint to
  pick a reference sample from the paths panel?
- Worth landing a small inline help tooltip on the Region input that explains
  "query an indexed path; response includes all haplotypes"?

The bundled "HPRC MICB-KIR3DL1" example has the side tables and shows resolved
names; "HPRC chrM" does not.

## Whole-chromosome HPRC graphs

A full HPRC chromosome (e.g. chr20) is ~130 MB as a `.gbz.db` — too big to
bundle in this repo. The bundled "HPRC chr20 (URL-hosted, full PanSN)" example
reads it from `https://jbrowse.org/demos/ivg/hprc/` by HTTP range requests
(`RemoteFile` through `@gmod/gbz-base`): a 500 bp window is about seven
requests and half a megabyte, and the paths panel fills from the `Paths` table
without a download. The hosted file has no `HaplotypeSamples` side tables yet,
so its haplotypes are labelled `unknown#N#chr20`; running
`gbz-haplotype-index --from-db` on it and re-uploading would give real PanSN
names.

To set up your own URL-hosted example, the direct GFA → GBZ conversion keeps
every sample name intact:

```bash
vg gbwt -G hprc-v1.1-mc-grch38.chr20.gfa --gbz-format -g chr20.gbz
gbz-base construct chr20.gbz
gbz-haplotype-index --from-db chr20.gbz.db   # optional, names the haplotypes
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

- Read tracks (`.gam`) given by URL are still downloaded whole; the progress
  UI covers those. Range-reading GAM would need the `.gai` index consulted
  first.
- Default region (`chr20:30000000-30000500`) was picked semi-arbitrarily — is
  there a more biologically interesting demo region?

## Server re-sorts already-sorted .sorted.gam files

`indexGamSorted` detects `.gam` (which `.sorted.gam` ends with), strips the
last `.gam`, and outputs `.sorted.sorted.gam`. If a user uploads a pre-sorted
GAM, the server wastes time re-sorting and the returned path looks odd. Could
detect the `.sorted.gam` suffix and skip the sort step, returning the file
as-is (still creating the `.gai` with `vg gamsort -i` only).

## Resolved

- **`.gai` shown as "read" in the staged list.** `detectType` still returns
  `'read'` for index siblings, but `StagedFileList` branches on
  `isIndexSibling` and renders them as `index` with a "(index — skipped on
  server)" note rather than a type dropdown, so the misleading UI is gone.
  Changing `detectType` itself would be churn: the upload path gates on
  `isIndex` throughout and never on the type, and returning `null` would pass
  `null` to `handleFileUpload` for the local sibling registration.
