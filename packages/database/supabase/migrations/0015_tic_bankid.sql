-- =====================================================================
-- 0015  TIC BankID production adapter fields
-- =====================================================================

alter table public.bankid_sessions
  add column if not exists provider text not null default 'bankid',
  add column if not exists tic_session_id text,
  add column if not exists auto_start_token text,
  add column if not exists qr_start_token text,
  add column if not exists qr_start_secret text,
  add column if not exists subscription_token text,
  add column if not exists session_expires_at timestamptz,
  add column if not exists callback_state text,
  add column if not exists webhook_received_at timestamptz,
  add column if not exists raw_status jsonb;

create unique index if not exists uq_bankid_sessions_tic_session_id
  on public.bankid_sessions(tic_session_id)
  where tic_session_id is not null;

alter table public.bankid_signatures
  add column if not exists tic_session_id text,
  add column if not exists ocsp_response text,
  add column if not exists user_visible_data_hash text,
  add column if not exists user_non_visible_data_hash text,
  add column if not exists raw_completion jsonb;

create index if not exists idx_bankid_sessions_incident on public.bankid_sessions(incident_id);
create index if not exists idx_bankid_sessions_provider on public.bankid_sessions(provider, status);
