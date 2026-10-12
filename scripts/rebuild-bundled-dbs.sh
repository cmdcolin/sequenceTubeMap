#!/usr/bin/env bash
# Rebuild every `*.gbz.db` under exampleData/ from its `*.gbz` with upstream
# gbz-base (`gbz-base construct`, or `gbz2db` on releases up to 0.5.1), then
# write the companion haplotype indexes when gbz-haplotype-index is on PATH
# (`cargo install gbz-haplotype-index`), and the chrM walk files when vg and
# gfa-to-tabix are (`cargo install gfa-to-tabix`). See doc/data.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if command -v gbz-base >/dev/null; then
  construct() { gbz-base construct --overwrite --output "$2" "$1"; }
elif command -v gbz2db >/dev/null; then
  construct() { gbz2db --overwrite --output "$2" "$1"; }
else
  echo "Neither gbz-base nor gbz2db found on PATH; install https://github.com/jltsiren/gbz-base" >&2
  exit 1
fi

shopt -s nullglob globstar
gbz_files=(exampleData/**/*.gbz)
if (( ${#gbz_files[@]} == 0 )); then
  echo "No .gbz files found under exampleData/."
  exit 0
fi

for gbz in "${gbz_files[@]}"; do
  db="${gbz}.db"
  echo "== ${gbz} -> ${db}"
  construct "$gbz" "$db"
done

# Only these examples carry haplotypes worth naming; each track names its
# companion as `haplotypeIndexFile`. micb-kir3dl1 has no .gbz here, so its
# companion comes from the database.
if command -v gbz-haplotype-index >/dev/null; then
  gbz-haplotype-index --overwrite --anchor-spacing 131072 --page-size 4096 \
    exampleData/hprc-chrM.gbz exampleData/hprc-chrM.gbz.db \
    exampleData/hprc-chrM.haplotype-index.db
  gbz-haplotype-index --overwrite --anchor-spacing 131072 --page-size 4096 \
    --from-db exampleData/micb-kir3dl1.gbz.db \
    exampleData/micb-kir3dl1.haplotype-index.db
fi

# The chrM graph's gfa-to-tabix walk file, for the walk-file example; walk
# format 2 needs gfa-to-tabix 1.0 or later
if command -v vg >/dev/null && command -v gfa-to-tabix >/dev/null; then
  gfa="$(mktemp --suffix .gfa)"
  vg convert -f exampleData/hprc-chrM.gbz >"$gfa"
  gfa-to-tabix "$gfa" --walks --refs GRCh38 --sequences \
    -o exampleData/hprc-chrM
  rm "$gfa"
fi

echo "Done. Re-run any built-in dataset that uses these files to confirm."
