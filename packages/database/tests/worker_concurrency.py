#!/usr/bin/env python3
"""Disjoint claims by real worker sessions; no provider or production calls."""
import concurrent.futures
import json
import os
import re
import subprocess
import threading
from urllib.parse import urlparse

base = os.environ.get("DATABASE_SUPERUSER_URL", "")
name = os.environ.get("RESQLY_TEST_DATABASE", "resqly_test_migrations")
parsed = urlparse(base)
if parsed.scheme not in ("postgres", "postgresql") or parsed.hostname not in ("localhost", "127.0.0.1", "::1") or parsed.query or parsed.fragment or not re.fullmatch(r"resqly_(test|migration)_[a-z0-9_]+", name):
    raise SystemExit("Worker fixtures require a direct local scratch database")
url = base.rsplit("/", 1)[0] + "/" + name

def sql(statement):
    run = subprocess.run(["psql", url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stderr)
    return run.stdout.strip()

try:
    sql("insert into public.notification_deliveries(channel,provider,to_address,payload,dedupe_key) "
        "select 'email','resend','worker@f1-test.invalid','{\"html\":\"fixture\"}'::jsonb,'f1-worker-fixture:'||n from generate_series(1,64) n")
    barrier = threading.Barrier(17)
    def claim(n):
        barrier.wait(timeout=30)
        result = sql(f"begin; set local role service_role; select public.claim_delivery_batch('notification_deliveries','worker-{n}',4,120,array['email']); select pg_sleep(0.03); commit;")
        return json.loads(next(line for line in result.splitlines() if line.startswith("[")))
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(claim, n) for n in range(16)]
        barrier.wait(timeout=30)
        rows = [row for future in futures for row in future.result(timeout=90)]
    assert len(rows) == 64, f"Expected all 64 claims, got {len(rows)}"
    assert len({row['id'] for row in rows}) == 64, "Overlapping worker claims"
    assert all(row['attempts'] == 1 and row['claim_token'] for row in rows), "Invalid initial claim"
    print(json.dumps({"workerSessions":16,"queued":64,"claimed":64,"uniqueClaims":64,"duplicateClaims":0}))
finally:
    sql("delete from public.notification_deliveries where dedupe_key like 'f1-worker-fixture:%'")
