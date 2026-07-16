#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required: npm install -g supabase" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

supabase gen types typescript --linked --schema public,storage > "$TMP"
if [ ! -s "$TMP" ] || ! grep -q 'export type Database' "$TMP"; then
  echo "Generated database types are empty or invalid" >&2
  exit 1
fi
mv "$TMP" packages/database/src/generated-types.ts

echo "Database types regenerated from the linked Supabase project."
