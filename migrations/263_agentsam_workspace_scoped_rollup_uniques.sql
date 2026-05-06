-- 263_agentsam_workspace_scoped_rollup_uniques.sql
-- Rebuild rollup tables so workspace_id is part of the unique key.
-- Uses '__tenant__' as the tenant-level aggregate workspace sentinel.
-- Do not use ws_inneranimalmedia as a fallback.
--
-- Do not apply until approved.
-- Apply (when approved):
--   npx wrangler d1 execute inneranimalmedia-business --remote -c ./wrangler.production.toml --file migrations/263_agentsam_workspace_scoped_rollup_uniques.sql
-- -------------------------------------------------------------------
-- agentsam_tool_stats_compacted
-- Target UNIQUE(tenant_id, workspace_id, tool_name)
-- -------------------------------------------------------------------

DROP TABLE IF EXISTS agentsam_tool_stats_compacted__new;

CREATE TABLE agentsam_tool_stats_compacted__new (
  id TEXT PRIMARY KEY DEFAULT ('atsc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '__tenant__',
  tool_name TEXT NOT NULL,
  total_calls INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  first_seen_at INTEGER,
  last_seen_at INTEGER,
  compacted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  agent_id TEXT,
  timed_out_count INTEGER DEFAULT 0,
  sla_breach_count INTEGER DEFAULT 0,
  p95_duration_ms REAL DEFAULT 0,
  UNIQUE(tenant_id, workspace_id, tool_name)
);

INSERT OR REPLACE INTO agentsam_tool_stats_compacted__new (
  id,
  tenant_id,
  workspace_id,
  tool_name,
  total_calls,
  success_count,
  failure_count,
  success_rate,
  total_cost_usd,
  total_tokens,
  avg_duration_ms,
  first_seen_at,
  last_seen_at,
  compacted_at,
  agent_id,
  timed_out_count,
  sla_breach_count,
  p95_duration_ms
)
SELECT
  id,
  tenant_id,
  COALESCE(NULLIF(workspace_id, ''), '__tenant__') AS workspace_id,
  tool_name,
  COALESCE(total_calls, 0),
  COALESCE(success_count, 0),
  COALESCE(failure_count, 0),
  COALESCE(success_rate, 0),
  COALESCE(total_cost_usd, 0),
  COALESCE(total_tokens, 0),
  COALESCE(avg_duration_ms, 0),
  first_seen_at,
  last_seen_at,
  COALESCE(compacted_at, unixepoch()),
  agent_id,
  COALESCE(timed_out_count, 0),
  COALESCE(sla_breach_count, 0),
  COALESCE(p95_duration_ms, 0)
FROM agentsam_tool_stats_compacted
WHERE tenant_id IS NOT NULL
  AND tool_name IS NOT NULL;

DROP TABLE agentsam_tool_stats_compacted;

ALTER TABLE agentsam_tool_stats_compacted__new
RENAME TO agentsam_tool_stats_compacted;

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_stats_compacted_at
ON agentsam_tool_stats_compacted(compacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_stats_scope_tool
ON agentsam_tool_stats_compacted(tenant_id, workspace_id, tool_name);

CREATE INDEX IF NOT EXISTS idx_tool_stats_workspace
ON agentsam_tool_stats_compacted(workspace_id, tool_name);

-- -------------------------------------------------------------------
-- agentsam_webhook_weekly
-- Target UNIQUE(tenant_id, workspace_id, week_start, provider)
-- -------------------------------------------------------------------

DROP TABLE IF EXISTS agentsam_webhook_weekly__new;

CREATE TABLE agentsam_webhook_weekly__new (
  id TEXT PRIMARY KEY DEFAULT ('whw_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '__tenant__',
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  provider TEXT NOT NULL,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  top_event_types TEXT DEFAULT '{}',
  top_repos TEXT DEFAULT '{}',
  notes TEXT,
  rolled_up_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, workspace_id, week_start, provider)
);

INSERT OR REPLACE INTO agentsam_webhook_weekly__new (
  id,
  tenant_id,
  workspace_id,
  week_start,
  week_end,
  provider,
  total_received,
  total_processed,
  total_failed,
  total_cost_usd,
  top_event_types,
  top_repos,
  notes,
  rolled_up_at
)
SELECT
  id,
  tenant_id,
  COALESCE(NULLIF(workspace_id, ''), '__tenant__') AS workspace_id,
  week_start,
  week_end,
  provider,
  COALESCE(total_received, 0),
  COALESCE(total_processed, 0),
  COALESCE(total_failed, 0),
  COALESCE(total_cost_usd, 0),
  COALESCE(top_event_types, '{}'),
  COALESCE(top_repos, '{}'),
  notes,
  COALESCE(rolled_up_at, datetime('now'))
FROM agentsam_webhook_weekly
WHERE tenant_id IS NOT NULL
  AND week_start IS NOT NULL
  AND provider IS NOT NULL;

DROP TABLE agentsam_webhook_weekly;

ALTER TABLE agentsam_webhook_weekly__new
RENAME TO agentsam_webhook_weekly;

CREATE INDEX IF NOT EXISTS idx_agentsam_webhook_weekly_scope
ON agentsam_webhook_weekly(tenant_id, workspace_id, week_start, provider);

CREATE INDEX IF NOT EXISTS idx_agentsam_webhook_weekly_rolled_up
ON agentsam_webhook_weekly(rolled_up_at DESC);