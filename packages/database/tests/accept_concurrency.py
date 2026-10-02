#!/usr/bin/env python3
"""Real independent PostgreSQL sessions against explicit local fixtures."""
import concurrent.futures
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import threading
from urllib.parse import urlparse
import uuid

base = os.environ.get("DATABASE_SUPERUSER_URL", "")
name = os.environ.get("RESQLY_TEST_DATABASE", "resqly_test_migrations")
parsed = urlparse(base)
if parsed.scheme not in ("postgres","postgresql") or parsed.hostname not in ("localhost", "127.0.0.1", "::1") or parsed.query or parsed.fragment or not re.fullmatch(r"resqly_(test|migration)_[a-z0-9_]+",name):
    raise SystemExit("Concurrency fixtures require a direct local scratch database")
url = base.rsplit("/", 1)[0] + "/" + name
here = Path(__file__).resolve().parent

def ident(text):
    return str(uuid.UUID(hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()))

def sql(statement):
    run = subprocess.run(["psql", url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stderr)
    return run.stdout.strip()

def accept(job, driver, label):
    return ("begin; set local role service_role; select row_to_json(result) from "
            f"public.accept_tow_offer_for_actor('{ident('f1-job-'+str(job))}',"
            f"'{ident('f1-driver-'+str(driver))}','{ident('f1-user-'+str(driver))}',"
            f"'f1-race-{label}') result; select pg_sleep(0.03); commit;")

def race(statements):
    barrier = threading.Barrier(len(statements) + 1)
    def session(statement):
        barrier.wait(timeout=30)
        return sql(statement)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(statements)) as pool:
        futures = [pool.submit(session, statement) for statement in statements]
        barrier.wait(timeout=30)
        return [future.result(timeout=90) for future in futures]

def outcomes(results):
    return [json.loads(line) for text in results for line in text.splitlines() if line.startswith("{")]

def winner_count(results):
    return sum(row["accepted"] for row in outcomes(results))

def cleanup():
    sql("delete from public.audit_logs where metadata->>'correlation_id' like 'f1-race-%';"
        "delete from public.request_idempotency_keys where scope='user:'||md5('f1-reviewer')::uuid;"
        f"delete from public.tenants where id='{ident('f1-insurer')}';"
        f"delete from public.tenants where id='{ident('f1-tow-tenant')}';"
        "delete from auth.users where email like '%@f1-test.invalid';")

try:
    sql("begin;\n" + (here / "actor_accept_fixture.sql").read_text() + "\ncommit;")
    results = race([accept(1, n, f"same-job-{n}") for n in range(1, 101)])
    assert winner_count(results) == 1, results
    job = ident("f1-job-1")
    counts = json.loads(sql(f"select json_build_object('assignments',(select count(*) from public.tow_job_assignments where tow_job_id='{job}'),"
        f"'shares',(select count(*) from public.tow_job_customer_shares where tow_job_id='{job}'),"
        f"'audit',(select count(*) from public.audit_logs where action='tow.driver_accepted' and entity_id='{job}'),"
        f"'events',(select count(*) from public.tow_job_status_events where tow_job_id='{job}'),"
        f"'webhooks',(select count(*) from public.webhook_deliveries where payload->>'tow_job_id'='{job}'),"
        f"'email',(select count(*) from public.notification_deliveries where tow_job_id='{job}'));"))
    assert all(value == 1 for value in counts.values()), counts
    winner = sql(f"select driver_id from public.tow_jobs where id='{job}';")
    available = [n for n in range(1, 101) if ident('f1-driver-'+str(n)) != winner]
    retry_driver = next(n for n in range(1, 101) if ident('f1-driver-'+str(n)) == winner)
    retried = outcomes([sql(accept(1, retry_driver, "retry"))])[0]
    assert retried["accepted"] and retried["reason"] == "already_accepted_by_driver"
    a, b, c = available[:3]
    assert winner_count(race([accept(2, a, "driver-2"), accept(3, a, "driver-3")])) == 1
    sql(f"update public.tow_drivers set current_vehicle_id='{ident('f1-vehicle-'+str(b))}' where id='{ident('f1-driver-'+str(c))}';"
        f"update public.tow_job_offers set tow_vehicle_id='{ident('f1-vehicle-'+str(b))}' where tow_job_id='{ident('f1-job-5')}' and driver_id='{ident('f1-driver-'+str(c))}';")
    assert winner_count(race([accept(4, b, "vehicle-4"), accept(5, c, "vehicle-5")])) == 1
    duplicate = sql("select count(*) from (select driver_id from public.tow_jobs where status='accepted' group by driver_id having count(*)>1) conflicts;")
    assert duplicate == "0"
    duplicate = sql("select count(*) from (select tow_vehicle_id from public.tow_jobs where status='accepted' group by tow_vehicle_id having count(*)>1) conflicts;")
    assert duplicate == "0"
    print(json.dumps({"sameJobSessions":100,"sameJobWinners":1,"atomicSideEffects":counts,
        "sameDriverSessions":2,"sameVehicleSessions":2,"winnerRetry":"idempotent","resourceConflicts":0}))
finally:
    cleanup()
