#!/bin/sh
# Regenerate doc/images/facets-*.png from exampleData/hprc-chrM-3samples.sorted.gam
# (see scripts/make-facet-fixture.sh). Run from the repo root; needs
# rsvg-convert and ImageMagick. Each figure is the left end of the faceted map
# at natural scale, where chrM 146 and 152 split the samples, so the panel
# labels and the legend come along.
set -e

out=doc/images
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# render <basename> <tubemap-cli args...>
render() {
  name=$1
  shift
  pnpm --silent tubemap-cli --graph exampleData/hprc-chrM.gbz.db \
    --haplotype-index exampleData/hprc-chrM.haplotype-index.db \
    --reads exampleData/hprc-chrM-3samples.sorted.gam \
    --region 'GRCh38#chrM:245-255' --banded-haplotypes --ignore-strand \
    --legend "$@" --out "$work/$name.svg"
  rsvg-convert "$work/$name.svg" -o "$work/$name.png"
  magick "$work/$name.png" -crop 2600x2400+0+0 +repage -resize 2000x \
    -background white -flatten "$out/$name.png"
}

render facets-by-sample --facet-by sample_name
render facets-by-sample-banded --facet-by sample_name --coarsened
render facets-by-read-group --facet-by read_group --coarsened --compressed
