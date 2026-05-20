#!/usr/bin/env bash
# Re-run gbz2db.wasm against every `*.gbz` under exampleData/, writing the
# matching `*.gbz.db` next to it. Use after bumping vendor/gbz-base/*.wasm —
# query.wasm only reads the database schema it was built against, so old
# .gbz.db files fail with "Unsupported database version: …".

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

shopt -s nullglob globstar
gbz_files=(exampleData/**/*.gbz)
if (( ${#gbz_files[@]} == 0 )); then
  echo "No .gbz files found under exampleData/."
  exit 0
fi

for gbz in "${gbz_files[@]}"; do
  db="${gbz}.db"
  echo "== ${gbz} -> ${db}"
  node scripts/gbz2db.mjs "$gbz" "$db"
done

echo "Done. Re-run any built-in dataset that uses these files to confirm."
