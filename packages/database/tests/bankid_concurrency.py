#!/usr/bin/env python3
"""Simultaneous synthetic provider completions, direct-local SQL sessions."""
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
u = urlparse(base)
if (u.scheme not in ('postgres','postgresql') or u.hostname not in ('localhost','127.0.0.1','::1') or u.query or u.fragment
        or not re.fullmatch(r'resqly_(test|migration)_[a-z0-9_]+', name)):
    raise SystemExit('BankID fixtures require a direct local scratch database')
url = base.rsplit('/',1)[0]+'/'+name
here = Path(__file__).resolve().parent

def sql(statement):
    r = subprocess.run(['psql',url,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],capture_output=True,text=True)
    if r.returncode: raise RuntimeError(r.stderr)
    rows = [line for line in r.stdout.splitlines() if line.startswith('{')]
    return json.loads(rows[0]) if rows else r.stdout.strip()

try:
    # Expand local fixture includes for a single committed connection.
    fixture = (here/'bankid_binding_fixture.sql').read_text().replace('\\ir actor_accept_fixture.sql',(here/'actor_accept_fixture.sql').read_text())
    sql('begin;\n'+fixture+'\ncommit;')
    statement = """begin; set local role service_role;
      select row_to_json(r) from public.bankid_sessions b cross join lateral public.complete_bankid_session(b.id,
        jsonb_build_object('tenant_id',b.tenant_id,'user_id',b.user_id,'incident_id',b.incident_id,'order_ref',b.order_ref,
          'tic_session_id',b.tic_session_id,'environment',b.environment,'signed_payload_hash',b.bound_payload_hash,
          'personal_number_hash',repeat('a',64),'signature','synthetic-proof','bankid_status','complete'),
        b.bound_payload_text::jsonb,jsonb_build_object('status','complete','sessionId',b.tic_session_id,'orderRef',b.order_ref),true) r
        where b.id=md5('bankid-session-1')::uuid;
      select pg_sleep(0.02); commit;"""
    barrier = threading.Barrier(17)
    def session():
        barrier.wait(timeout=30)
        return sql(statement)
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(session) for _ in range(16)]
        barrier.wait(timeout=30)
        results = [f.result(timeout=90) for f in futures]
    assert sum(r['newly_processed'] for r in results) == 1, results
    assert len({r['signature_id'] for r in results}) == 1, results
    counts = sql("""select json_build_object(
      'signatures',(select count(*) from public.bankid_signatures where incident_id=md5('bankid-incident-1')::uuid),
      'audit',(select count(*) from public.audit_logs where entity_type='bankid_signature'),
      'webhooks',(select count(*) from public.webhook_deliveries where event='incident.bankid_verified'),
      'emails',(select count(*) from public.notification_deliveries where incident_id=md5('bankid-incident-1')::uuid),
      'statusEvents',(select count(*) from public.incident_status_events where incident_id=md5('bankid-incident-1')::uuid))""")
    assert all(n == 1 for n in counts.values()), counts
    sql("update public.bankid_sessions set status='pending',raw_status='{\"status\":\"pending\"}' where id=md5('bankid-session-1')::uuid")
    assert sql("select status from public.bankid_sessions where id=md5('bankid-session-1')::uuid") == 'complete'
    print(json.dumps({'completionSessions':16,'completionWinners':1,'atomicSideEffects':counts,'latePending':'preserved complete'}))
finally:
    sql("delete from public.audit_logs where tenant_id=md5('f1-insurer')::uuid;"
        "delete from public.request_idempotency_keys where scope='user:'||md5('f1-reviewer')::uuid;"
        "delete from public.tenants where id in(md5('f1-insurer')::uuid,md5('f1-tow-tenant')::uuid);"
        "delete from auth.users where email like '%@f1-test.invalid';")
