# Apply and synchronize the Resqly launch patch

## Option A — use the complete fixed project

```bash
cd ~/Downloads
unzip -q resqly-launch-fixed-full-2026-07-16.zip -d resqly-launch-fixed
cd resqly-launch-fixed
rm -f env
bash scripts/prelaunch-verify.sh
```

## Option B — apply only changed and added files

```bash
cd ~/Downloads
unzip -q resqly-launch-changed-files-2026-07-16.zip -d resqly-launch-patch
bash resqly-launch-patch/apply.sh /absolute/path/to/resqly-main
cd /absolute/path/to/resqly-main
bash scripts/prelaunch-verify.sh
```

## Commit and push

```bash
git status --short
git add -A
git diff --cached --check
git commit -m "fix: harden Resqly for controlled launch"
git pull --rebase origin main
git push origin HEAD:main
```

## Supabase migration and generated types

First create a database backup/snapshot in Supabase. Then:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
bash scripts/sync-database-types.sh
pnpm typecheck
```

Commit regenerated database types if they changed:

```bash
git add packages/database/src/generated-types.ts
git commit -m "chore: sync Supabase database types"
git push origin HEAD:main
```

## Final deployment verification

```bash
pnpm install --frozen-lockfile
pnpm verify
```

After deployment, open `/readiness` in the platform admin portal. Do not accept
production jobs while it shows any blocker. Run the complete customer → BankID
→ dispatch → driver acceptance → evidence → completion → invoice scenario twice,
including a double-click/retry test.
