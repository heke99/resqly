-- =====================================================================
-- 0002  Role -> permission matrix (platform definitions, not tenant data)
-- =====================================================================

-- Superadmin gets every permission.
insert into public.role_permissions (role_key, permission_key)
select 'platform_superadmin', key from public.permissions;

insert into public.role_permissions (role_key, permission_key) values
  -- Insurance: owner/admin
  ('insurance_owner_admin', 'incidents.read'),
  ('insurance_owner_admin', 'incidents.create'),
  ('insurance_owner_admin', 'incidents.update'),
  ('insurance_owner_admin', 'incidents.export'),
  ('insurance_owner_admin', 'claims.read'),
  ('insurance_owner_admin', 'claims.submit'),
  ('insurance_owner_admin', 'claims.approve'),
  ('insurance_owner_admin', 'tow_jobs.read'),
  ('insurance_owner_admin', 'vehicles.manage'),
  ('insurance_owner_admin', 'billing.read'),
  ('insurance_owner_admin', 'billing.manage'),
  ('insurance_owner_admin', 'white_label.manage'),
  ('insurance_owner_admin', 'api_keys.manage'),
  ('insurance_owner_admin', 'webhooks.manage'),
  ('insurance_owner_admin', 'audit_logs.read'),
  -- Insurance: claims handler
  ('insurance_claims_handler', 'incidents.read'),
  ('insurance_claims_handler', 'incidents.update'),
  ('insurance_claims_handler', 'claims.read'),
  ('insurance_claims_handler', 'claims.submit'),
  ('insurance_claims_handler', 'claims.approve'),
  ('insurance_claims_handler', 'tow_jobs.read'),
  -- Insurance: roadside handler
  ('insurance_roadside_handler', 'incidents.read'),
  ('insurance_roadside_handler', 'incidents.create'),
  ('insurance_roadside_handler', 'incidents.update'),
  ('insurance_roadside_handler', 'tow_jobs.read'),
  ('insurance_roadside_handler', 'tow_jobs.dispatch'),
  -- Insurance: fraud reviewer
  ('insurance_fraud_reviewer', 'incidents.read'),
  ('insurance_fraud_reviewer', 'claims.read'),
  ('insurance_fraud_reviewer', 'audit_logs.read'),
  -- Insurance: finance
  ('insurance_finance', 'incidents.read'),
  ('insurance_finance', 'billing.read'),
  ('insurance_finance', 'billing.manage'),
  -- Insurance: support
  ('insurance_support', 'incidents.read'),
  ('insurance_support', 'claims.read'),
  ('insurance_support', 'tow_jobs.read'),
  -- Insurance: integration manager
  ('insurance_integration_manager', 'incidents.read'),
  ('insurance_integration_manager', 'api_keys.manage'),
  ('insurance_integration_manager', 'webhooks.manage'),
  -- Insurance: viewer
  ('insurance_viewer', 'incidents.read'),
  ('insurance_viewer', 'claims.read'),
  ('insurance_viewer', 'tow_jobs.read'),
  ('insurance_viewer', 'billing.read'),
  -- Tow: owner/admin
  ('tow_owner_admin', 'tow_jobs.read'),
  ('tow_owner_admin', 'tow_jobs.dispatch'),
  ('tow_owner_admin', 'tow_jobs.accept'),
  ('tow_owner_admin', 'tow_jobs.complete'),
  ('tow_owner_admin', 'vehicles.manage'),
  ('tow_owner_admin', 'drivers.manage'),
  ('tow_owner_admin', 'billing.read'),
  ('tow_owner_admin', 'billing.manage'),
  ('tow_owner_admin', 'white_label.manage'),
  ('tow_owner_admin', 'audit_logs.read'),
  -- Tow: dispatcher
  ('tow_dispatcher', 'tow_jobs.read'),
  ('tow_dispatcher', 'tow_jobs.dispatch'),
  ('tow_dispatcher', 'tow_jobs.accept'),
  ('tow_dispatcher', 'drivers.manage'),
  -- Tow: driver
  ('tow_driver', 'tow_jobs.read'),
  ('tow_driver', 'tow_jobs.accept'),
  ('tow_driver', 'tow_jobs.complete'),
  -- Tow: vehicle manager
  ('tow_vehicle_manager', 'vehicles.manage'),
  ('tow_vehicle_manager', 'drivers.manage'),
  ('tow_vehicle_manager', 'tow_jobs.read'),
  -- Tow: finance
  ('tow_finance', 'billing.read'),
  ('tow_finance', 'billing.manage'),
  ('tow_finance', 'tow_jobs.read'),
  -- Tow: viewer
  ('tow_viewer', 'tow_jobs.read'),
  ('tow_viewer', 'billing.read');
