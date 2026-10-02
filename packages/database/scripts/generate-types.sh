#!/usr/bin/env bash
set -euo pipefail
database_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="$database_dir/src/generated-types.ts"
candidate="$(mktemp "${TMPDIR:-/tmp}/resqly-db-types.XXXXXX")"
trap 'rm -f "$candidate"' EXIT
if [[ -n "${RESQLY_TYPES_DATABASE_URL:-}" ]]; then
  pnpm dlx supabase@2.119.0 gen types typescript --db-url "$RESQLY_TYPES_DATABASE_URL" --schema public > "$candidate"
else
  pnpm dlx supabase@2.119.0 gen types typescript --local --schema public > "$candidate"
fi
test -s "$candidate"
rg -q '^export type Database' "$candidate"
pnpm exec prettier --parser typescript --config "$database_dir/../../.prettierrc.json" --write "$candidate" >/dev/null
mv "$candidate" "$target"
