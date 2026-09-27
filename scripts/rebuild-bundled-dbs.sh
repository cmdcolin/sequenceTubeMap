#!/usr/bin/env bash
# Rebuild every `*.gbz.db` under exampleData/ from its `*.gbz` with upstream
# gbz-base (`gbz-base construct`, or `gbz2db` on releases up to 0.5.1), then
# write the companion haplotype indexes when gbz-haplotype-index is on PATH
# (`cargo install gbz-haplotype-index`). See doc/data.md.

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
  gbz-haplotype-index --overwrite exampleData/hprc-chrM.gbz \
    exampleData/hprc-chrM.gbz.db exampleData/hprc-chrM.haplotype-index.db
  gbz-haplotype-index --overwrite --from-db exampleData/micb-kir3dl1.gbz.db \
    exampleData/micb-kir3dl1.haplotype-index.db
fi

echo "Done. Re-run any built-in dataset that uses these files to confirm."
