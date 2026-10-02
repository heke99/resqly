#!/usr/bin/env python3
"""Independent service-role sessions: coverage replay/version and accept races."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess
import threading
from urllib.parse import urlparse

base = os.environ.get('DATABASE_SUPERUSER_URL', '')
name = os.environ.get('RESQLY_TEST_DATABASE', 'resqly_test_migrations')
parsed = urlparse(base)
if (parsed.scheme not in ('postgres', 'postgresql') or parsed.hostname not in ('localhost', '127.0.0.1', '::1')
        or parsed.query or parsed.fragment or not re.fullmatch(r'resqly_(test|migration)_[a-z0-9_]+', name)):
    raise SystemExit('Coverage fixtures require a direct local scratch database')
url = base.rsplit('/', 1)[0] + '/' + name
here = Path(__file__).resolve().parent

def sql(statement, conflict=False):
    result = subprocess.run(['psql', url, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
                             '-c', statement], capture_output=True, text=True)
    if result.returncode:
        if conflict and ('23505:' in result.stderr or '23514: active_job_coverage_review_required' in result.stderr):
            return {'conflict': True}
        raise RuntimeError(result.stderr)
    rows = [line for line in result.stdout.splitlines() if line.startswith('{')]
    return json.loads(rows[0]) if rows else result.stdout.strip()

def race(statements):
    barrier = threading.Barrier(len(statements)+1)
    def session(statement):
        barrier.wait(timeout=30)
        return sql(statement, conflict=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(statements)) as pool:
        futures = [pool.submit(session, s) for s in statements]
        barrier.wait(timeout=30)
        return [f.result(timeout=90) for f in futures]

def decide(incident, version, status, key):
    return ("begin; set local role service_role; select public.decide_incident_coverage("
            f"md5('f1-incident-{incident}')::uuid,md5('f1-insurer')::uuid,md5('f1-reviewer')::uuid,null,"
            f"{version},'{status}','Documented concurrency decision','fixture-reference','{key}','f1-race-coverage');"
            "select pg_sleep(0.02); commit;")

def accept(job, driver):
    return ("begin; set local role service_role; select row_to_json(r) from public.accept_tow_offer_for_actor("
            f"md5('f1-job-{job}')::uuid,md5('f1-driver-{driver}')::uuid,md5('f1-user-{driver}')::uuid,'f1-race-coverage') r;"
            "select pg_sleep(0.02); commit;")

try:
    sql('begin;\n'+(here/'actor_accept_fixture.sql').read_text()+'\ncommit;')
    replay = race([decide(1, 1, 'pending', 'coverage-race-one') for _ in range(16)])
    assert len({r['decision_id'] for r in replay}) == 1, replay
    assert sum(not r['replay'] for r in replay) == 1, replay
    versions = race([decide(1, 2, 'approved', f'coverage-version-{n}') for n in range(16)])
    assert sum(not r.get('conflict', False) for r in versions) == 1, versions
    assert sql("select coverage_version from public.incidents where id=md5('f1-incident-1')::uuid") == '3'
    mixed = race([accept(2, 2), decide(2, 1, 'denied', 'coverage-race-deny')])
    accepted, decision = mixed
    if accepted['accepted']:
        assert decision.get('conflict'), mixed
        assert sql("select coverage_status from public.incidents where id=md5('f1-incident-2')::uuid") == 'approved'
    else:
        assert accepted['reason'] == 'insurance_coverage_required' and decision['coverage_status'] == 'denied', mixed
    # Request returns the existing job without taking a job lock while holding
    # the incident lock; this used to invert accept's lock order.
    request = ("begin; set local role service_role; select public.request_tow_workflow(md5('f1-incident-3')::uuid,"
               "md5('f1-insurer')::uuid,md5('f1-customer')::uuid,null,'{}','coverage-tow-race','f1-race-coverage'); commit;")
    requested, accepted3 = race([request, accept(3, 3)])
    assert requested['tow_job_id'] and accepted3['accepted'], (requested, accepted3)
    print(json.dumps({'sameKeyDecisionSessions':16,'sameKeyDecisions':1,'staleVersionSessions':16,
                      'versionWinners':1,'acceptVersusDecision':'serialized','requestVersusAccept':'no deadlock'}))
finally:
    sql("delete from public.audit_logs where metadata->>'correlation_id' like 'f1-race-%';"
        "delete from public.request_idempotency_keys where scope in('user:'||md5('f1-reviewer')::uuid,'user:'||md5('f1-customer')::uuid);"
        "delete from public.tenants where id in(md5('f1-insurer')::uuid,md5('f1-tow-tenant')::uuid);"
        "delete from auth.users where email like '%@f1-test.invalid';")
