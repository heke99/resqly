#!/usr/bin/env python3
"""Independent-session creation/idempotency/number tests, direct-local only."""
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
    raise SystemExit('Incident fixtures require a direct local scratch database')
url = base.rsplit('/', 1)[0] + '/' + name
here = Path(__file__).resolve().parent

def sql(statement):
    result = subprocess.run(['psql', url, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def race(statements):
    barrier = threading.Barrier(len(statements)+1)
    def session(statement):
        barrier.wait(timeout=30)
        return json.loads(next(line for line in sql(statement).splitlines() if line.startswith('{')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(statements)) as pool:
        futures = [pool.submit(session, s) for s in statements]
        barrier.wait(timeout=30)
        return [f.result(timeout=90) for f in futures]

def create(key):
    return ("begin; set local role service_role; select public.create_incident_workflow("
            "md5('workflow-operator')::uuid,md5('workflow-customer')::uuid,null,"
            "jsonb_build_object('customer_user_id',md5('workflow-customer')::uuid,"
            "'vehicle_id',md5('workflow-vehicle')::uuid,'type','towing'),"
            f"'{key}','workflow-concurrency'); select pg_sleep(0.02); commit;")

try:
    sql('begin;\n'+(here/'incident_workflow_fixture.sql').read_text()+'\ncommit;')
    repeated = race([create('one-intent') for _ in range(16)])
    assert len({r['incident_id'] for r in repeated}) == 1, repeated
    assert sum(not r['replay'] for r in repeated) == 1, repeated
    unique = race([create(f'distinct-{n}') for n in range(100)])
    assert len({r['incident_id'] for r in unique}) == 100
    assert len({r['case_number'] for r in unique}) == 100
    incident = repeated[0]['incident_id']
    def request(n):
        return ("begin; set local role service_role; select public.request_tow_workflow("
                f"'{incident}',md5('workflow-operator')::uuid,md5('workflow-customer')::uuid,null,"
                f"'{{\"pickup\":{{\"lat\":59.3,\"lng\":18.1}},\"priority\":\"normal\"}}','request-{n}',"
                "'workflow-concurrency'); select pg_sleep(0.02); commit;")
    requested = race([request(n) for n in range(16)])
    assert len({r['tow_job_id'] for r in requested}) == 1
    assert sum(r['created'] for r in requested) == 1
    counts = json.loads(sql("select json_build_object('incidents',(select count(*) from public.incidents),"
        "'numbers',(select count(*) from public.case_numbers),'jobs',(select count(*) from public.tow_jobs),"
        "'webhooks',(select count(*) from public.webhook_deliveries),'emails',(select count(*) from public.notification_deliveries))"))
    assert counts == {'incidents':101, 'numbers':101, 'jobs':1, 'webhooks':102, 'emails':102}, counts
    print(json.dumps({'sameKeySessions':16,'sameKeyIncidents':1,'distinctSessions':100,'uniqueNumbers':100,
                      'towRequestSessions':16,'towJobs':1,'atomicCounts':counts}))
finally:
    sql("delete from public.audit_logs where tenant_id=md5('workflow-operator')::uuid;"
        "delete from public.request_idempotency_keys where scope='user:'||md5('workflow-customer')::uuid;"
        "delete from public.tenants where id=md5('workflow-operator')::uuid;"
        "delete from public.vehicles where id=md5('workflow-vehicle')::uuid;"
        "delete from auth.users where id in(md5('workflow-customer')::uuid,md5('workflow-other')::uuid);")
