#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Resqly pre-launch verification"

if [ -f env ]; then
  echo "ERROR: root env file exists. Remove it and rotate every secret it contained." >&2
  exit 1
fi

# Reject real-looking secrets in source files while allowing documented placeholders.
if grep -RIlE --exclude-dir=.git --exclude-dir=node_modules --exclude='*.zip' \
  '(SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|BANKID[^=]*KEY)[[:space:]]*=[[:space:]]*[^<${][^[:space:]]{20,}' . \
  | grep -vE '(^|/)(\.env\.example|README\.md|docs/)' >/tmp/resqly-secret-files.txt; then
  echo "ERROR: real-looking secret assignments found:" >&2
  cat /tmp/resqly-secret-files.txt >&2
  exit 1
fi

echo "==> Installing exact locked dependencies"
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile

echo "==> Typecheck, lint, tests and production builds"
pnpm verify

echo "==> Replaying the complete migration chain"
bash packages/database/tests/validate-migrations.sh "${MIGRATION_CHECK_DB:-resqly_migration_check}"

echo "==> OK: local pre-launch verification passed"
