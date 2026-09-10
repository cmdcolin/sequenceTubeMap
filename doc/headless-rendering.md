# Headless rendering (CLI)

The same d3 layout the web UI uses can also run under Node + jsdom and emit a
static SVG — useful for scripting, headless servers, or pasting a tube map into
a paper without a browser screenshot.

```bash
# whatever a link from the app describes
pnpm tubemap-cli --url 'https://cmdcolin.github.io/sequenceTubeMap/?name=snp1kg-BRCA1%20(gbz-base)&region=17:1-1000' \
                 --out brca1.svg

# a source from src/config.json by name, with the region it names or your own
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' --out brca1.svg
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' \
                 --region 17:1-200 --out brca1-zoom.svg

# bundled demo data (1–9)
pnpm tubemap-cli --example 6 --out demo6.svg
```

Node runs `scripts/tubemap-cli.ts` and the `src/` modules it pulls in directly,
stripping the types rather than bundling first. Strip-only mode erases types but
does not rewrite syntax, so `tsconfig.json` sets `erasableSyntaxOnly` — enums,
namespaces and constructor parameter properties would break this entry point
even though the Vite build accepts them.

## Rendering a link

`--url` takes what the app's **Copy link** button produces, or the address bar
itself, and draws it: the region, the tracks, the colors and the View menu
settings the link carries are the ones the app would have shown
([what a link can say](urlparams.md)). `--region` and the view options below
override it, so a link is a starting point rather than the whole command.

Two things a link does not carry into a headless render. Its data has to be
readable by the in-browser backend, which means a `.gbz.db` graph — a link to a
`.vg`/`.xg`/`.gbz` source is refused rather than half-drawn. And the browser
subsamples reads where the CLI does not, so a dense region draws every read here
unless `--read-limit` says otherwise.

## Sizing

The exported `viewBox` is cropped to the drawing itself, at natural scale, so
nothing is clipped and there is no dead space around it. Two renders of the same
data and view options are the same file whatever `--width`/`--height` say, and
the same file the app's **Download Image** button saves.

`--width`/`--height` size the viewport the map is laid out in, which decides the
zoom the app would open it at. That only reaches the output through
`--viewport`, which exports the whole canvas at that zoom — what the app would
show — rather than the cropped figure.

## View options

Every option in the app's View menu has a flag: `--compressed`, `--no-reads`,
`--no-soft-clips`, `--no-merge-nodes`, `--node-labels`, `--transparent-nodes`,
`--coarsened`, `--ignore-strand`, `--color-by-mapq`, `--alpha-by-mapq` and
`--mapq N` — `--help` lists them, from the same table that reads them, so the
two cannot drift apart. The mapping-quality flags only show up when the reads
actually differ in mapping quality.

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

## The color key

`--legend` draws the app's color legend into the figure, above the map, so a
reader who never opens the app can tell what a color means:

```bash
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' --legend --out brca1.svg
```

![A figure carrying its color legend](tubemap-cli-samples/snp1kg-BRCA1.png)

It names the palette each thing is drawn in, which is not always the obvious
one: everything but a read takes `mainPalette`'s first color for the reference
path and colors every other path from `auxPalette`, so a graph with no separate
haplotype track gets both rows. The **Download Image** button in the app saves
the same key, whenever the legend panel is open.

Pass it where a color means something, and leave it off where it does not. None
of the `--example` datasets contain a wholly reverse-strand read, so a key on
one of those figures names a red palette the picture never uses, over tracks
called "Demo graph" — which is why the samples below carry one only on real
data.

## Reads

Unlike the browser, which subsamples to 100 reads by default to stay responsive,
the CLI draws every read in the region. `--read-limit N` applies the same even
subsampling when a high-coverage region would otherwise produce an unusably
large SVG:

```bash
pnpm tubemap-cli --source 'snp1kg-BRCA1 (gbz-base)' \
                 --region 17:1-300 --read-limit 100 --out brca1-sampled.svg
```

The cap does not apply under `--coarsened`, which weighs each band by how many
reads traverse it: thinning the reads there would redraw the picture rather than
simplify it. The app leaves the coarsened view uncapped for the same reason.

## Hosted graphs

A source whose graph is a URL is read by range request here as it is in the
browser, companion haplotype index included, so a figure over HPRC release 2.1
needs no local copy of its 10 GB database:

```bash
pnpm tubemap-cli --source 'HPRC v2.1 whole genome (gbz-base, URL-hosted)' \
                 --region 'GRCh38#chr20:48000600-48001000' --out str.svg
```

That is 464 haplotypes on 240 distinct walks — 23835 by 1549 units, which is too
wide for a page. The README's two figures are crops of it, one over the allele
staircase and one where the haplotypes come back into register:

```bash
rsvg-convert -z 1 str.svg -o str.png
magick str.png -crop 2499x1549+2452+0  +repage -background white -flatten \
  doc/images/hprc-v2.1-chr20-str.png
magick str.png -crop 2499x1549+19617+0 +repage -background white -flatten \
  doc/images/hprc-v2.1-chr20-register.png
```

A local track file is staged as an upload rather than fetched, so the bundled
sources render the same way with no network at all.

## Sample output

Everything below lives in [tubemap-cli-samples/](tubemap-cli-samples/), SVG
alongside PNG, and `scripts/make-cli-samples.sh` regenerates the lot.

`--source 'snp1kg-BRCA1 (gbz-base)' --legend`
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
