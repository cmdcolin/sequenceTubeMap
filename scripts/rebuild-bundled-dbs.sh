#!/usr/bin/env bash
# Rebuild every `*.gbz.db` under exampleData/ from its `*.gbz` with upstream
# gbz-base (`gbz-base construct`, or `gbz2db` on releases up to 0.5.1), then
# add the haplotype side tables when gbz-haplotype-index is on PATH. See
# doc/gbz-base.md.

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
  if command -v gbz-haplotype-index >/dev/null; then
    gbz-haplotype-index "$gbz" "$db"
  fi
done

echo "Done. Re-run any built-in dataset that uses these files to confirm."
