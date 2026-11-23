#!/bin/sh
# Regenerate docs/images/fold-*-before.png and fold-*-folded.png. Run from the
# repo root; needs rsvg-convert, ImageMagick and pngquant, and the network for
# the hosted HPRC v2.1 walk file.
#
# Each window is drawn twice. Unfolded, as the app draws a window this size:
# banded, with logarithmic node widths. That figure is too wide to print, so it
# is shown whole, squeezed into a strip, above its first 2000 px at natural
# scale. Folded at 1 kb, the whole figure prints at twice natural scale.
#
# The folded maps as the app shows them, with the notice above them and the
# View menu's control, come from scripts/screenshot-ui.mjs fold-variants.
set -e

out=docs/images
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

walks='?tracks=graph:https%3A%2F%2Fjbrowse.org%2Fdemos%2Fhprc%2Fhprc-v2.1-mc-grch38-f8.GRCh38.walks.gz&colors=greys/plainColors'

# window <basename> <region>
window() {
  name=$1
  region=$2

  pnpm --silent tubemap-cli --url "$walks&region=$region" --legend \
    --compressed --banded-haplotypes --out "$work/before.svg"
  box=$(sed -n '2s/.*viewBox="\([^"]*\)".*/\1/p' "$work/before.svg")
  set -- $box
  echo "$name unfolded: ${3%.*} px wide, ${4%.*} px tall"
  rsvg-convert -w 2000 -b white "$work/before.svg" -o "$work/strip.png"
  sed "2s/viewBox=\"[^\"]*\"/viewBox=\"$1 $2 2000 $4\"/" "$work/before.svg" \
    >"$work/start.svg"
  rsvg-convert -b white "$work/start.svg" -o "$work/start.png"
  magick "$work/start.png" -trim +repage -background white -extent 2000x \
    "$work/start.png"
  magick "$work/strip.png" -bordercolor white -border 0x12 "$work/start.png" \
    -append -strip "$work/before.png"
  pngquant --force --strip --quality 80-98 \
    --output "$out/fold-$name-before.png" "$work/before.png"

  pnpm --silent tubemap-cli --url "$walks&region=$region" --legend \
    --fold-variants 1000 --out "$work/folded.svg"
  rsvg-convert -z 2 -b white "$work/folded.svg" -o "$work/folded.png"
  pngquant --force --strip --quality 80-98 \
    --output "$out/fold-$name-folded.png" "$work/folded.png"
}

window chr1 'GRCh38%23chr1:72298000-72349000'
window chr16 'GRCh38%23chr16:75204000-75225000'
