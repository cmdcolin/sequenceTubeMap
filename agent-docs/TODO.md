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

- Should the Region field explain the "not indexed" failure with a hint to pick
  a reference sample from the paths panel?
- Worth landing a small inline help tooltip on the Region input that explains
  "query an indexed path; response includes all haplotypes"?

Both bundled HPRC examples show resolved names now, by the two routes there
are: "HPRC MICB-KIR3DL1" has the side tables inside its database, "HPRC chrM"
reads them from `exampleData/hprc-chrM.haplotype-index.db` beside it.

## The URL-hosted HPRC release 2.1 example

"HPRC v2.1 whole genome (gbz-base, URL-hosted)" is HPRC's published 10 GB
`.gbz.db` read straight off S3 by range request, with JBrowse's 7.9 GB companion
haplotype index beside it for the names. Nothing is downloaded: a 500 bp window
costs 15 requests and a megabyte, and the paths panel 292 lengths in 2.3 s.
`skipAutoLoad` keeps a menu selection from firing a query on its own; the Go
button does that.

Open questions:

- Read tracks (`.gam`) given by URL are still downloaded whole; the progress UI
  covers those. Range-reading GAM would need the `.gai` index consulted first.
- The default region (`GRCh38#chr6:160620000-160620500`, inside _LPA_'s KIV-2
  array) draws 23 distinct walks and is legible. The chr20 microsatellite the
  README figures use draws 240 over the same 464 haplotypes, which is a far
  denser picture — worth an entry of its own, or is one enough?
- The 464-haplotype windows are drawn in full; there is no "show me these
  haplotypes" selection. `subgraphForHaplotypes` with the companion's
  `HaplotypeAnchors` is what would make that cheap (see doc/gbz-base.md).

## Resolved

- **Uploading a `.sorted.gam` produced a `.sorted.sorted.gam`.**
  `indexGamSorted` now keeps the upload's own name and sorts through a scratch
  file it renames over it, so the returned path is sane. The sort itself still
  runs: `vg gamsort` has no index-only mode we can rely on, and the `.gai` it
  writes records offsets into the stream it emits rather than into the bytes it
  was handed, so indexing a pre-sorted upload in place would give an index that
  doesn't match the file.

- **`.gai` shown as "read" in the staged list.** `detectType` still returns
  `'read'` for index siblings, but `StagedFileList` branches on `isIndexSibling`
  and renders them as `index` with a "(index — skipped on server)" note rather
  than a type dropdown, so the misleading UI is gone. Changing `detectType`
  itself would be churn: the upload path gates on `isIndex` throughout and never
  on the type, and returning `null` would pass `null` to `handleFileUpload` for
  the local sibling registration.
