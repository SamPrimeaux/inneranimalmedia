-- Tenant + BYOK health audit for tenant_sam_primeaux (edit literals or parameterize in CLI).
-- Run:
--   npm run d1:tenant-byok-audit

-- ── 1. Tenant row ───────────────────────────────────────────────────────────
SELECT id, name, slug, is_active, domain, plan,
       json_extract(meta_json, '$.platform_allowance_usd') AS platform_allowance_usd,
       json_extract(settings, '$.require_byok') AS require_byok
FROM tenants
WHERE id = 'tenant_sam_primeaux';

-- ── 2. Workspaces for tenant ────────────────────────────────────────────────
SELECT id, worker_name, root_path, d1_database_id, d1_binding,
       byok_r2_bucket, cloudflare_account_id, deploy_url, status
FROM agentsam_workspace
WHERE tenant_id = 'tenant_sam_primeaux'
ORDER BY id;

-- ── 3. Workspace memberships (operator users) ─────────────────────────────────
SELECT wm.user_id, wm.workspace_id, wm.role, wm.workspace_role, wm.is_active
FROM workspace_members wm
WHERE wm.tenant_id = 'tenant_sam_primeaux'
ORDER BY wm.workspace_id, wm.user_id
LIMIT 50;

-- ── 4. BYOK provider keys (masked — no secrets) ─────────────────────────────
SELECT uak.id, uak.user_id, uak.provider, uak.category, uak.key_name, uak.key_preview,
       uak.is_active, uak.last_tested_at, uak.test_status, uak.vault_secret_id IS NOT NULL AS has_vault_link
FROM user_api_keys uak
WHERE uak.tenant_id = 'tenant_sam_primeaux'
  AND COALESCE(uak.is_active, 1) = 1
ORDER BY uak.user_id, uak.provider;

-- ── 5. LLM vault slots (OpenAI / Anthropic / Gemini via user_secrets) ───────
SELECT us.user_id, us.secret_name, us.project_label, us.is_active,
       json_extract(us.metadata_json, '$.last4') AS last4
FROM user_secrets us
WHERE us.tenant_id = 'tenant_sam_primeaux'
  AND us.project_label = 'iam_user_llm_keys'
  AND COALESCE(us.is_active, 1) = 1;

-- ── 6. R2 BYOK credentials ────────────────────────────────────────────────
SELECT user_id, cf_account_id, r2_access_key_id, status, validation_status, validated_at
FROM user_storage_access_keys
WHERE tenant_id = 'tenant_sam_primeaux'
ORDER BY user_id;

-- ── 7. Recent secret audit (BYOK lifecycle) ───────────────────────────────
SELECT event_type, secret_source, triggered_by, datetime(created_at, 'unixepoch') AS at
FROM secret_audit_log
WHERE tenant_id = 'tenant_sam_primeaux'
ORDER BY created_at DESC
LIMIT 25;

-- ── 8. Open security findings on keys ───────────────────────────────────────
SELECT id, severity, finding_type, status, datetime(created_at, 'unixepoch') AS at
FROM security_findings
WHERE tenant_id = 'tenant_sam_primeaux'
  AND status IN ('open', 'triaged')
ORDER BY created_at DESC
LIMIT 20;
