#!/usr/bin/env bash
# Rebuilds the walk files in walk format 8 with gfa-to-tabix 5.0: the test
# graphs from their GFAs here, and the example graphs from their .gbz through
# vg. Usage: exampleData/build.sh [gfa-to-tabix binary]
set -euo pipefail
cd "$(dirname "$0")"
B=${1:-gfa-to-tabix}
build() {
  local name=$1 gfa=$2; shift 2
  "$B" "$gfa" --walks -o "$name.tmp" "$@" > /dev/null 2>&1
  local out
  for out in "$name".tmp.*.walks.gz; do
    local sample=${out#"$name".tmp.}; sample=${sample%.walks.gz}
    mv "$out" "$name.$sample.walks.gz"
    mv "$out.idx" "$name.$sample.walks.gz.idx"
  done
}
from_gbz() {
  local name=$1 ref=$2 gfa
  gfa=$(mktemp --suffix .gfa)
  vg convert -f "$name.gbz" > "$gfa"
  build "$name" "$gfa" --refs "$ref" --sequences
  rm "$gfa"
}
from_gbz hprc-chrM GRCh38
from_gbz internal/snp1kg-BRCA1 17
from_gbz cactus ref
from_gbz backward fwd
build micb-kir3dl1 micb-kir3dl1.gfa.gz --refs GRCh38 --sequences
build ecoli_pggb ecoli_pggb_subgraph.gfa --refs K12
build ecoli_pggb_abridged ecoli_pggb_subgraph.gfa --refs K12 --abridge-steps 20
build departures departures.gfa --refs R --sequences --tile 100
build unloaded_departure unloaded_departure.gfa --refs R --sequences --tile 100 --abridge-steps 5
build dip dip.gfa --refs HG002 --tile 20
