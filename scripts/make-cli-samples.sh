#!/bin/sh
# Regenerate doc/tubemap-cli-samples/ from the bundled demo data and the
# built-in snp1kg-BRCA1 source. Run from the repo root; needs rsvg-convert and
# ImageMagick alongside the usual toolchain.
set -e

out=doc/tubemap-cli-samples

# One width for every PNG, so the samples sit at a consistent size on the page.
# The SVG beside each one is the figure at its natural scale.
width=1600

# render <basename> <tubemap-cli args...>
render() {
  name=$1
  shift
  pnpm --silent tubemap-cli "$@" --out "$out/$name.svg"
  rsvg-convert -w "$width" "$out/$name.svg" -o "$out/$name.png"
  # The tube map draws no background of its own, and a transparent figure
  # reads as a dark mess wherever it is pasted onto a dark page.
  magick "$out/$name.png" -background white -flatten "$out/$name.png"
}

for n in 1 2 3 4 5 6 7 8 9; do
  render "demo-example-$n" --example "$n"
done
render demo-example-6-compressed --example 6 --compressed
# The one sample with --legend: the demo datasets contain no reverse-strand
# read, so a key on them would name a color their figure never uses.
render snp1kg-BRCA1 --source 'snp1kg-BRCA1 (gbz-base)' --legend
