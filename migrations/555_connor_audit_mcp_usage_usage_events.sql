-- 555: Connor/Sam isolation audit — mcp_usage_log attribution + usage event docs
-- 2026-06-03
-- Worker fixes (deploy required): src/core/mcp-usage-log.js, usage-event-cost.js, telemetry.js

-- mcp_usage_log: explicit workspace/user attribution columns
ALTER TABLE mcp_usage_log ADD COLUMN workspace_id TEXT;
ALTER TABLE mcp_usage_log ADD COLUMN user_id TEXT;
ALTER TABLE mcp_usage_log ADD COLUMN tenant_audit_flag INTEGER DEFAULT 0;

UPDATE mcp_usage_log
SET tenant_audit_flag = 1
WHERE tenant_id = 'tenant_sam_primeaux'
  AND created_at > unixepoch('2026-06-03')
  AND (workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
  AND (user_id IS NULL OR TRIM(COALESCE(user_id, '')) = '');

-- Stop trigger from crediting NULL tenant_id rows to Sam
DROP TRIGGER IF EXISTS trg_mcp_tool_calls_usage;

CREATE TRIGGER trg_mcp_tool_calls_usage
AFTER INSERT ON mcp_tool_calls
BEGIN
  INSERT INTO mcp_usage_log (id, tenant_id, tool_name, date, call_count, success_count, failure_count)
  SELECT
    lower(hex(randomblob(16))),
    TRIM(NEW.tenant_id),
    NEW.tool_name,
    date(COALESCE(NEW.created_at, datetime('now'))),
    1,
    CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END
  WHERE NEW.tenant_id IS NOT NULL AND TRIM(NEW.tenant_id) != ''
  ON CONFLICT(tenant_id, tool_name, date) DO UPDATE SET
    call_count = call_count + 1,
    success_count = success_count + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    failure_count = failure_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END;
END;

INSERT OR REPLACE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES (
  'script_fix_mcp_usage_log_tenant',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'fix_mcp_usage_log_tenant_attribution',
  'fix_mcp_usage_log_tenant_attribution',
  'docs/platform/connor-audit-555-mcp-usage-log.md',
  '',
  'BUG 555: mcp_usage_log tenant_id DEFAULT was tenant_sam_primeaux. Worker upsertMcpUsageLog requires explicit tenant_id, workspace_id, user_id.',
  'maintenance',
  'node',
  'markdown',
  '',
  0,
  1,
  0,
  1,
  0,
  0,
  'low',
  'audit,mcp,usage',
  'Code fix shipped in src/core/mcp-usage-log.js',
  'repo:src/core/mcp-usage-log.js',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES (
  'script_fix_usage_event_zero_cost_write',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'fix_usage_event_silent_drop_on_unknown_pricing',
  'fix_usage_event_silent_drop_on_unknown_pricing',
  'docs/platform/connor-audit-555-usage-events.md',
  '',
  'BUG 555: usage events insert with cost_usd=0 and reason=pricing_lookup_failed when pricing missing.',
  'maintenance',
  'node',
  'markdown',
  '',
  0,
  1,
  0,
  1,
  0,
  0,
  'low',
  'audit,usage,deepseek',
  'Code fix shipped in src/core/usage-event-cost.js and telemetry.js',
  'repo:src/core/usage-event-cost.js',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_workspace_blocklist (workspace_id, owner_user_id, reason)
VALUES
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'platform operator workspace — Sam only'),
  ('ws_meauxbility',      'au_871d920d1233cbd1', 'Meauxbility nonprofit workspace — Sam only'),
  ('ws_inneranimals',     'au_871d920d1233cbd1', 'Inner Animals apparel workspace — Sam only');
