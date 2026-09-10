# Headless rendering (CLI)

The same d3 layout the web UI uses can also run under Node + jsdom and emit a
static SVG — useful for scripting, headless servers, or pasting a tube map into
a paper without a browser screenshot.

```bash
# bundled demo data (1–9)
pnpm tubemap-cli --example 6 --out demo6.svg

# real data via the in-browser API (any source from src/config.json)
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' \
                 --out brca1.svg --width 3000

# region override
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' \
                 --region 17:1-200 --out brca1-zoom.svg
```

## Sizing

`--width`/`--height` set the viewport the map is laid out in, which is what
decides how far the drawing is scaled down to fit. The exported `viewBox` is
then cropped to the drawing itself, so nothing is clipped and there is no dead
space around it. Pass `--viewport` to export the whole canvas instead.

## View options

Every option in the app's View menu has a flag: `--compressed`, `--no-reads`,
`--no-soft-clips`, `--no-merge-nodes`, `--node-labels`, `--transparent-nodes`,
`--coarsened`, `--ignore-strand`, `--color-by-mapq`, `--alpha-by-mapq` and
`--mapq N`. The two mapping-quality colouring flags ride on a track's colour
scheme, so they apply to `--source` renders rather than `--example` ones, and
they only show up when the reads actually differ in mapping quality.

`--ignore-strand` is quiet on all nine bundled `--example` datasets, which is
those datasets rather than the flag. What it moves in the normal view is reads
the renderer marked `is_reverse`, and it marks a read that way only when _every_
node visit is reversed — a mixed-orientation read is drawn as if forward. None
of the `--example` datasets contain a wholly reversed read, but plenty of the
bundled alignment data does: on snp1kg-BRCA1 at `17:1-400` the flag moves all
118 reverse-strand reads out of the red auxiliary palette and into the blue main
one.

Under `--coarsened` the flag appears to do nothing at all, on every input tried.
Read orientation is normalised before the bands are aggregated, so both
traversals of an edge have already collapsed into one band by the time the flag
could merge them.

`--compressed` is the one to reach for whenever a figure comes out unreadably
wide. Node width scales with sequence length, so any region spanning many bases
lays out far wider than tall and the detail disappears; making width logarithmic
pulls it back. snp1kg-BRCA1 at `17:1-1000` goes from 10122 units across to 1099
at the same height, and it rescues a dense read pileup just as much as a graph
with long nodes.

Example 6 at natural node widths is 4376 units across
([SVG](tubemap-cli-samples/demo-example-6.svg)):

![Demo example 6](tubemap-cli-samples/demo-example-6.png)

The same data with `--compressed` is 1725 across, and readable at the width a
page actually gives it
([SVG](tubemap-cli-samples/demo-example-6-compressed.svg)):

![Demo example 6, compressed node widths](tubemap-cli-samples/demo-example-6-compressed.png)

## Reads

Unlike the browser, which subsamples to 100 reads by default to stay responsive,
the CLI draws every read in the region. `--read-limit N` applies the same even
subsampling when a high-coverage region would otherwise produce an unusably
large SVG:

```bash
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' \
                 --region 17:1-300 --read-limit 100 --out brca1-sampled.svg
```

## Hosted graphs

A source whose graph is a URL is read by range request here as it is in the
browser, companion haplotype index included, so a figure over HPRC release 2.1
needs no local copy of its 10 GB database:

```bash
pnpm tubemap-cli --source 'HPRC v2.1 whole genome (gbz-base, URL-hosted)' \
                 --region 'GRCh38#chr20:48000600-48001000' --out str.svg
```

That is 464 haplotypes on 240 distinct walks — 18470 by 1204 units, which is
too wide for a page. The README's two figures are crops of it, one over the
allele staircase and one where the haplotypes come back into register:

```bash
rsvg-convert -z 1 str.svg -o str.png
magick str.png -crop 1936x1204+1900+0  +repage -background white -flatten \
  doc/images/hprc-v2.1-chr20-str.png
magick str.png -crop 1936x1204+15200+0 +repage -background white -flatten \
  doc/images/hprc-v2.1-chr20-register.png
```

A local track file is staged as an upload rather than fetched, so the bundled
sources render the same way with no network at all.

## Sample output

Everything below was produced by the commands above and lives in
[tubemap-cli-samples/](tubemap-cli-samples/), SVG alongside PNG.

`--source 'snp1kg-BRCA1 (gbz-base)' --width 3000`
([SVG](tubemap-cli-samples/snp1kg-BRCA1.svg))

![snp1kg-BRCA1 tube map](tubemap-cli-samples/snp1kg-BRCA1.png)

`--example 8` — a cyclic graph, whose loops are drawn outside the node bounds
([SVG](tubemap-cli-samples/demo-example-8.svg))

![Demo example 8](tubemap-cli-samples/demo-example-8.png)

`--example 7` — mixed forward and reverse alignments
([SVG](tubemap-cli-samples/demo-example-7.svg))

![Demo example 7](tubemap-cli-samples/demo-example-7.png)

`--example 1` — haplotypes only, no reads
([SVG](tubemap-cli-samples/demo-example-1.svg))

![Demo example 1](tubemap-cli-samples/demo-example-1.png)

The remaining demo datasets render the same way: examples
[2](tubemap-cli-samples/demo-example-2.png),
[3](tubemap-cli-samples/demo-example-3.png),
[4](tubemap-cli-samples/demo-example-4.png),
[5](tubemap-cli-samples/demo-example-5.png) and
[9](tubemap-cli-samples/demo-example-9.png).

A render whose layout produced non-finite coordinates prints
`warning: N shape(s) have non-finite coordinates and will not appear`. Those
shapes are missing from the picture, so treat the figure as incomplete rather
than shipping it.

Caveat: interactive features (zoom, context menus) are inert in headless mode.
