#!/bin/sh
# Regenerate doc/images/facets-*.png. Run from the repo root; needs
# rsvg-convert, ImageMagick and pngquant.
#
# The read facets draw exampleData/hprc-chrM-3samples.sorted.gam (see
# scripts/make-facet-fixture.sh), each figure the left end of the faceted map
# at natural scale, where chrM 146 and 152 split the samples, so the panel
# labels and the legend come along. The haplotype facets draw the real HPRC
# haplotypes in exampleData/micb-kir3dl1.gbz.db and hprc-chrM.gbz.db, cropped
# to the first or last panels of a stack too tall to print whole.
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

# figure <basename> <gravity> <crop> <width> <tubemap-cli args...>
figure() {
  name=$1
  gravity=$2
  crop=$3
  width=$4
  shift 4
  pnpm --silent tubemap-cli --legend "$@" --out "$work/$name.svg"
  rsvg-convert "$work/$name.svg" -o "$work/$name.png"
  magick "$work/$name.png" -gravity "$gravity" -crop "$crop" +repage \
    -resize "$width"x -background white -flatten -strip "$work/$name.crop.png"
  pngquant --force --strip --quality 80-98 --output "$out/$name.png" \
    "$work/$name.crop.png"
}

micb=GRCh38%23chr6:31500700-31500949
micbGraph='"trackFile":"exampleData/micb-kir3dl1.gbz.db","haplotypeIndexFile":"exampleData/micb-kir3dl1.haplotype-index.db","trackType":"graph"'

# Each haplotype in a palette color, so a sample's two tell apart
figure facets-haplotypes-by-sample NorthWest 1800x1400+0+0 1800 \
  --url "?tracksJson=[{$micbGraph,\"trackColorSettings\":{\"mainPalette\":\"greys\",\"auxPalette\":\"plainColors\"}}]&region=$micb&facet=haplotype_sample" \
  --compressed

figure facets-haplotypes-banded NorthWest 1490x1900+0+0 1490 \
  --url "?tracksJson=[{$micbGraph}]&region=$micb&facet=haplotype_sample" \
  --compressed --banded-haplotypes

figure facets-haplotypes-chrM SouthWest 2000x1400+0+0 1800 \
  --graph exampleData/hprc-chrM.gbz.db \
  --haplotype-index exampleData/hprc-chrM.haplotype-index.db \
  --reads exampleData/hprc-chrM-3samples.sorted.gam \
  --region 'GRCh38#chrM:245-255' --banded-haplotypes --ignore-strand \
  --coarsened --facet-by haplotype_sample
