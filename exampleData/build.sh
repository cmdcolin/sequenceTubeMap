#!/usr/bin/env bash
# Rebuilds the walk-file fixtures in walk format 7 with gfa-to-tabix 4.0: the
# test graphs from their GFAs here, and the chrM graph from hprc-chrM.gbz
# through vg. Usage: exampleData/build.sh [gfa-to-tabix binary]
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
chrM=$(mktemp --suffix .gfa)
vg convert -f hprc-chrM.gbz > "$chrM"
build hprc-chrM "$chrM" --refs GRCh38 --sequences
rm "$chrM"
build ecoli_pggb ecoli_pggb_subgraph.gfa --refs K12
build ecoli_pggb_abridged ecoli_pggb_subgraph.gfa --refs K12 --abridge-steps 20
build departures departures.gfa --refs R --sequences --tile 100
